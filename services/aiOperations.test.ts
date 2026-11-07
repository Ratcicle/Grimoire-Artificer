import { beforeEach, describe, expect, it, vi } from 'vitest';
import { runGeneration, runReferenceAnalysis } from './aiOperations';
import { VisualDNA, ImageModel } from '../types';

const mocks = vi.hoisted(() => ({
  generate: vi.fn(), analyze: vi.fn(), read: vi.fn(), save: vi.fn(), log: vi.fn(),
  merge: vi.fn(), create: vi.fn(), owner: { id: 'A' }
}));
vi.mock('./geminiService', () => ({
  generateCardArt: mocks.generate, analyzeReferenceImage: mocks.analyze,
  extractUsageFromError: (e: any) => e?.usageMetadata,
  mapUsageMetadata: (u: any) => ({ totalTokenCount: u?.totalTokenCount })
}));
vi.mock('./localDbService', () => ({getLocalDNA: mocks.read, getLocalDNAById: async (id: string) => (await mocks.read()).find((d: VisualDNA) => d.id === id), saveTokenLog: mocks.log}));
vi.mock('./cloudDnaService', () => ({saveDNA: mocks.save}));
vi.mock('./visualDnaMerge', () => ({mergeVisualDNASafe: mocks.merge, createVisualDNAFromAnalysis: mocks.create}));
vi.mock('./dnaAccountContext', () => ({
  captureDnaOperationContext: () => ({ownerId: mocks.owner.id}),
  assertDnaOperationContext: (c: any) => {if(c.ownerId !== mocks.owner.id) throw new Error('Account changed');}
}));
const deferred = <T,>() => {let resolve!: (v:T)=>void; let reject!: (e:unknown)=>void; const promise = new Promise<T>((r,j)=>{resolve=r;reject=j;});return {promise,resolve,reject};};
const dna = {id:'a',name:'A',imageUrl:'image',revision:1,tags:[],scores:{}} as VisualDNA;
const usageMetadata = {totalTokenCount:456};
beforeEach(() => {
  vi.clearAllMocks(); mocks.owner.id='A';
  mocks.read.mockResolvedValue([dna]); mocks.save.mockImplementation(async d=>d);
  mocks.log.mockResolvedValue(undefined); mocks.merge.mockReturnValue({data:{...dna,summary:'new'},changed:true});
  mocks.create.mockReturnValue(dna);
  mocks.analyze.mockImplementation(async (_i,_n,_m,started)=>{started();return {data:{},usageMetadata};});
  mocks.generate.mockImplementation(async (_r,started)=>{started();return {imageUrl:'generated',usageMetadata};});
});
describe('real operation orchestration',()=>{
  it('locks reference before first read across direct and queued entry points',async()=>{
    const read=deferred<VisualDNA[]>(); mocks.read.mockReturnValueOnce(read.promise);
    const first=runReferenceAnalysis({id:'a',name:'A',imageUrl:'image',model:'mock',reanalyze:true});
    expect(await runReferenceAnalysis({id:'a',name:'A',imageUrl:'image',model:'mock',reanalyze:true,sessionId:'queue'})).toEqual({status:'busy'});
    read.resolve([dna]); await first;
    expect(mocks.analyze).toHaveBeenCalledTimes(1);expect(mocks.save).toHaveBeenCalledTimes(1);expect(mocks.log).toHaveBeenCalledTimes(1);
  });
  it.each(['deleted','conflict','merge','noop'])('records consumption once after %s',async(kind)=>{
    const response=deferred<any>();mocks.analyze.mockImplementation((_i,_n,_m,started)=>{started();return response.promise;});
    const pending=runReferenceAnalysis({id:'a',name:'A',imageUrl:'image',model:'mock',reanalyze:true});
    await vi.waitFor(()=>expect(mocks.analyze).toHaveBeenCalledTimes(1));
    if(kind==='deleted')mocks.read.mockResolvedValue([]);
    if(kind==='conflict')mocks.read.mockResolvedValue([{...dna,revision:2}]);
    if(kind==='merge')mocks.merge.mockImplementation(()=>{throw new Error('merge rejected');});
    if(kind==='noop')mocks.merge.mockReturnValue({data:dna,changed:false});
    response.resolve({data:{},usageMetadata}); await pending;
    expect(mocks.save).not.toHaveBeenCalled();expect(mocks.log).toHaveBeenCalledTimes(1);
    expect(mocks.log.mock.calls[0][0].totalTokenCount).toBe(456);
  });
  it('releases read failures without recording an unmade API call',async()=>{
    mocks.read.mockRejectedValueOnce(new Error('storage unavailable'));
    const args={id:'a',name:'A',imageUrl:'image',model:'mock',reanalyze:true};
    expect((await runReferenceAnalysis(args)).status).toBe('failed');
    expect(mocks.log).not.toHaveBeenCalled();await runReferenceAnalysis(args);expect(mocks.analyze).toHaveBeenCalledTimes(1);
  });
  it('passes the independent snapshot and account to compare-and-save',async()=>{
    await runReferenceAnalysis({id:'a',name:'A',imageUrl:'image',model:'mock',reanalyze:true});
    expect(mocks.save.mock.calls[0][1]).toEqual({context:{ownerId:'A'},expected:dna});
    expect(mocks.save.mock.calls[0][1].expected).not.toBe(dna);
  });
  it('rejects account switch after response while logging actual consumption',async()=>{
    mocks.analyze.mockImplementation(async(_i,_n,_m,started)=>{started();mocks.owner.id='B';return {data:{},usageMetadata};});
    expect((await runReferenceAnalysis({id:'a',name:'A',imageUrl:'image',model:'mock',reanalyze:true})).status).toBe('failed');
    expect(mocks.save).not.toHaveBeenCalled();expect(mocks.log).toHaveBeenCalledTimes(1);
  });
  it('generation rejects duplicate invocation and survives failed telemetry',async()=>{
    const response=deferred<any>();mocks.generate.mockImplementation((_r,started)=>{started();return response.promise;});mocks.log.mockRejectedValue(new Error('log unavailable'));
    const request={model:ImageModel.Lite} as any;
    const first=runGeneration(request);expect(await runGeneration(request)).toEqual({status:'busy'});
    response.resolve({imageUrl:'generated',usageMetadata});
    expect((await first).status).toBe('done');expect(mocks.log).toHaveBeenCalledTimes(1);expect(mocks.generate).toHaveBeenCalledTimes(1);
    await runGeneration(request);expect(mocks.generate).toHaveBeenCalledTimes(2);
  });
  it('replaceImage analyzes the new file and stores it, discarding the old analysis',async()=>{
    const current={...dna,imageUrl:'old-thumbnail',summary:'old',energyDesign:'stale',tags:['boss monster','my custom tag'],createdAt:5,revision:3,cloudDocumentId:'doc',ownerId:'A'} as VisualDNA;
    mocks.read.mockResolvedValue([current]);mocks.create.mockReturnValue({id:'a',name:'A',imageUrl:'new-image',summary:'new',tags:['dragon'],scores:{}});
    const outcome=await runReferenceAnalysis({id:'a',name:'A renamed',imageUrl:'new-image',model:'mock',reanalyze:true,replaceImage:true});
    expect(outcome.status).toBe('done');expect(mocks.analyze.mock.calls[0][0]).toBe('new-image');expect(mocks.merge).not.toHaveBeenCalled();
    expect(mocks.create.mock.calls[0][0]).toMatchObject({id:'a',name:'A',imageUrl:'new-image',createdAt:5,revision:3});
    const [saved,options]=mocks.save.mock.calls[0];
    expect(saved).toMatchObject({id:'a',imageUrl:'new-image',summary:'new',cloudDocumentId:'doc',ownerId:'A'});
    expect(saved.tags).toEqual(['dragon','my custom tag']);expect(saved).not.toHaveProperty('energyDesign');
    expect(options.expected).toEqual(current);
  });
  describe('one analysis per provider',()=>{
    const gemini={...dna,imageUrl:'art',summary:'gemini text',energyDesign:'gemini only',tags:['boss monster','my custom tag'],analysisVersion:4,analysisProvider:'gemini',analysisModel:'gemini-4-argon',createdAt:5,revision:3,cloudDocumentId:'doc',ownerId:'A'} as VisualDNA;
    const answered=(servedModel?:string)=>mocks.analyze.mockImplementation(async(_i,_n,_m,started)=>{started();return {data:{analysisVersion:4},usageMetadata,servedModel};});
    const claudeText=(imageUrl='art')=>mocks.create.mockReturnValue({id:'a',name:'A',imageUrl,summary:'claude text',tags:['dragon'],scores:{}});
    it('another provider sets the active analysis aside instead of merging into it',async()=>{
      mocks.read.mockResolvedValue([gemini]);claudeText();answered('claude-sonnet-5-5');
      const outcome=await runReferenceAnalysis({id:'a',name:'A',imageUrl:'ignored',model:'claude-sonnet-5-5',reanalyze:true});
      expect(outcome.status).toBe('done');expect(mocks.merge).not.toHaveBeenCalled();expect(mocks.analyze.mock.calls[0][0]).toBe('art');
      const [saved,options]=mocks.save.mock.calls[0];
      expect(saved).toMatchObject({imageUrl:'art',summary:'claude text',analysisProvider:'claude',analysisModel:'claude-sonnet-5-5',analysisVersion:4,cloudDocumentId:'doc',ownerId:'A'});
      expect(saved).not.toHaveProperty('energyDesign');expect(saved.tags).toEqual(['dragon','my custom tag']);
      expect(saved.storedAnalyses.gemini).toMatchObject({summary:'gemini text',energyDesign:'gemini only',analysisProvider:'gemini',analysisModel:'gemini-4-argon'});
      expect(saved.storedAnalyses.gemini).not.toHaveProperty('imageUrl');expect(options.expected).toEqual(gemini);
    });
    it('the record names the model that really answered when a fallback served it',async()=>{
      mocks.read.mockResolvedValue([gemini]);claudeText();answered('claude-sonnet-5');
      await runReferenceAnalysis({id:'a',name:'A',imageUrl:'ignored',model:'claude-sonnet-5-5',reanalyze:true});
      expect(mocks.save.mock.calls[0][0]).toMatchObject({analysisProvider:'claude',analysisModel:'claude-sonnet-5'});
    });
    it('the same provider merges and leaves the other analysis alone',async()=>{
      const both={...gemini,summary:'claude text',analysisProvider:'claude',analysisModel:'claude-sonnet-5-5',storedAnalyses:{gemini:{summary:'gemini text',analysisVersion:4}}} as VisualDNA;
      mocks.read.mockResolvedValue([both]);mocks.merge.mockReturnValue({data:{...both,summary:'newer claude text'},changed:true});answered('claude-opus-5-5');
      await runReferenceAnalysis({id:'a',name:'A',imageUrl:'ignored',model:'claude-opus-5-5',reanalyze:true});
      expect(mocks.merge).toHaveBeenCalledTimes(1);
      expect(mocks.save.mock.calls[0][0]).toMatchObject({summary:'newer claude text',analysisModel:'claude-opus-5-5',storedAnalyses:{gemini:{summary:'gemini text'}}});
    });
    it('a new file keeps the other provider and replaces its own',async()=>{
      const both={...gemini,summary:'claude text',analysisProvider:'claude',analysisModel:'claude-sonnet-5-5',storedAnalyses:{gemini:{summary:'gemini text',analysisVersion:4}}} as VisualDNA;
      mocks.read.mockResolvedValue([both]);claudeText('new-image');answered('claude-sonnet-5-5');
      await runReferenceAnalysis({id:'a',name:'A',imageUrl:'new-image',model:'claude-sonnet-5-5',reanalyze:true,replaceImage:true});
      const [saved]=mocks.save.mock.calls[0];
      expect(saved).toMatchObject({imageUrl:'new-image',summary:'claude text',storedAnalyses:{gemini:{summary:'gemini text'}}});
      expect(saved.storedAnalyses).not.toHaveProperty('claude');
    });
    it('importing a file with another provider sets the active analysis aside',async()=>{
      mocks.read.mockResolvedValue([gemini]);claudeText('new-image');answered('claude-sonnet-5-5');
      await runReferenceAnalysis({id:'a',name:'A',imageUrl:'new-image',model:'claude-sonnet-5-5',reanalyze:true,replaceImage:true});
      const [saved]=mocks.save.mock.calls[0];
      expect(saved).toMatchObject({imageUrl:'new-image',analysisProvider:'claude',storedAnalyses:{gemini:{summary:'gemini text'}}});
    });
    it('a failed analysis writes nothing',async()=>{
      mocks.read.mockResolvedValue([gemini]);mocks.analyze.mockRejectedValue(Object.assign(new Error('401 invalid x-api-key'),{status:401}));
      expect(await runReferenceAnalysis({id:'a',name:'A',imageUrl:'ignored',model:'claude-sonnet-5-5',reanalyze:true})).toMatchObject({status:'failed',kind:'permanent'});
      expect(mocks.save).not.toHaveBeenCalled();
    });
  });
  it('refuses to reanalyze a cloud thumbnail before any model call',async()=>{
    const header=[0xff,0xd8,0xff,0xc0,0,17,8,0,179,0,179,3,0,0,0,0,0,0,0,0,0];
    mocks.read.mockResolvedValue([{...dna,imageUrl:`data:image/jpeg;base64,${btoa(String.fromCharCode(...header))}`}]);
    const outcome=await runReferenceAnalysis({id:'a',name:'A',imageUrl:'x',model:'mock',reanalyze:true});
    expect(outcome).toMatchObject({status:'failed',kind:'permanent'});expect(mocks.analyze).not.toHaveBeenCalled();expect(mocks.log).not.toHaveBeenCalled();
  });
  it('classifies a failed analysis so the queue can decide whether to wait or stop',async()=>{
    mocks.analyze.mockImplementation(async(_i,_n,_m,started)=>{started();throw Object.assign(new Error('Please retry in 12s.'),{status:429});});
    expect(await runReferenceAnalysis({id:'a',name:'A',imageUrl:'image',model:'mock',reanalyze:true})).toMatchObject({status:'failed',kind:'rate_limit',retryAfterMs:12000});
  });
  it('marks a merged reanalysis with the version of the analysis that produced it',async()=>{
    mocks.analyze.mockImplementation(async(_i,_n,_m,started)=>{started();return {data:{analysisVersion:4},usageMetadata};});
    await runReferenceAnalysis({id:'a',name:'A',imageUrl:'image',model:'mock',reanalyze:true});
    expect(mocks.save.mock.calls[0][0].analysisVersion).toBe(4);
  });
  it('retains usage from an API error and does not retry',async()=>{
    mocks.generate.mockImplementation(async(_r,started)=>{started();throw Object.assign(new Error('API failed'),{usageMetadata});});
    expect((await runGeneration({model:ImageModel.Lite} as any)).status).toBe('failed');
    expect(mocks.log).toHaveBeenCalledTimes(1);expect(mocks.log.mock.calls[0][0].totalTokenCount).toBe(456);expect(mocks.generate).toHaveBeenCalledTimes(1);
  });
});
