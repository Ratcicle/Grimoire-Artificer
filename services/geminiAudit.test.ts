import {beforeEach,expect,it,vi} from 'vitest';
import {generateCardArt,checkApiKey,promptApiKeySelection,mapUsageMetadata} from './geminiService';
import {ImageModel,CardType,Complexity,Context,Archetype} from '../types';
const m=vi.hoisted(()=>({generate:vi.fn(),read:vi.fn()}));
vi.mock('@google/genai',()=>({Type:{OBJECT:'OBJECT',STRING:'STRING',ARRAY:'ARRAY',NUMBER:'NUMBER'},GoogleGenAI:class {models={generateContent:m.generate};}}));
vi.mock('./localDbService',()=>({getLocalDNA:m.read}));
const request={model:ImageModel.Lite,subject:'knight',cardType:CardType.Monster,context:Context.Character,complexity:Complexity.Medium,archetype:Archetype.Generic,useVisualDB:true,dbAutoSelect:true};
beforeEach(()=>{vi.clearAllMocks();m.read.mockResolvedValue([]);m.generate.mockResolvedValue({candidates:[{content:{parts:[{inlineData:{data:'mock',mimeType:'image/png'}}]}}]});});
it('database read failure prevents the image model call',async()=>{m.read.mockRejectedValue(new Error('local unavailable'));await expect(generateCardArt(request)).rejects.toThrow(/database|banco|DNA/i);expect(m.generate).not.toHaveBeenCalled();});
it('missing candidate content preserves API usage',async()=>{m.generate.mockResolvedValue({candidates:[{}],usageMetadata:{totalTokenCount:123}});await expect(generateCardArt(request)).rejects.toMatchObject({usageMetadata:{totalTokenCount:123}});});
it('unknown usage stays unknown, explicit zero stays zero',()=>{expect(mapUsageMetadata(undefined).totalTokenCount).toBeUndefined();expect(mapUsageMetadata({totalTokenCount:0}).totalTokenCount).toBe(0);});
it('distinguishes disabled and empty database in the actual generation result',async()=>{
 expect((await generateCardArt({...request,useVisualDB:false})).visualDbStatus).toBe('disabled');
 expect((await generateCardArt(request)).visualDbStatus).toBe('empty');
 expect(m.generate).toHaveBeenCalledTimes(2);
});
it('local connect cannot claim success without a configured backend or host',async()=>{
 const data=new Map<string,string>();vi.stubGlobal('localStorage',{getItem:(k:string)=>data.get(k),setItem:(k:string,v:string)=>data.set(k,v),removeItem:(k:string)=>data.delete(k)});vi.stubGlobal('window',{});vi.stubGlobal('fetch',vi.fn().mockRejectedValue(new Error('no local backend')));
 try {await promptApiKeySelection();}catch{}expect(await checkApiKey()).toBe(false);vi.unstubAllGlobals();
});
it('a key-selection bridge alone cannot claim a working browser transport',async()=>{
 vi.stubEnv('API_KEY','');vi.stubGlobal('localStorage',{getItem:()=>null,removeItem:vi.fn()});
 vi.stubGlobal('window',{aistudio:{hasSelectedApiKey:async()=>true,openSelectKey:vi.fn()}});
 vi.stubGlobal('fetch',vi.fn().mockResolvedValue({ok:true,json:async()=>({configured:false})}));
 expect(await checkApiKey()).toBe(false);
 vi.unstubAllGlobals();vi.unstubAllEnvs();
});
