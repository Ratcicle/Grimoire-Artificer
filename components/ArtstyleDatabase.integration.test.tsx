// @vitest-environment jsdom
import React from 'react';
import {act,cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import ArtstyleDatabase from './ArtstyleDatabase';
import App from '../App';
import {VisualDNA} from '../types';
import {setDnaOwnerProvider} from '../services/dnaAccountContext';
const m=vi.hoisted(()=>({claude:vi.fn(),read:vi.fn(),save:vi.fn(),log:vi.fn(),generate:vi.fn(),remove:vi.fn(),wipe:vi.fn(),exportBackup:vi.fn(),rows:[] as any[],auth:{currentUser:null as any},authChanged:null as any}));
vi.mock('@anthropic-ai/sdk',()=>({default:class {beta={messages:{create:m.claude}};}}));
vi.mock('../services/backupService',()=>({exportLibraryBackup:m.exportBackup,validateAndPreviewBackup:vi.fn(),applyBackupRestoration:vi.fn()}));
vi.mock('@google/genai',()=>({Type:{OBJECT:'OBJECT',STRING:'STRING',ARRAY:'ARRAY',NUMBER:'NUMBER'},GoogleGenAI:class {models={generateContent:m.generate};}}));
vi.mock('../services/geminiTransport', async () => {
  const { GoogleGenAI } = await import('@google/genai');
  return { createGeminiClient: (started?: () => void) => ({ models: {
    generateContent: (request: any) => { started?.(); return new GoogleGenAI({}).models.generateContent(request); }
  } }) };
});
vi.mock('../services/firebase',()=>({auth:m.auth,provider:{},signInWithPopup:vi.fn(),signOut:vi.fn(),onAuthStateChanged:(_a:any,cb:any)=>{m.authChanged=cb;cb(m.auth.currentUser);return ()=>{};}}));
vi.mock('../services/localDbService',()=>({getLocalDNA:m.read,getLocalDNAById:async(id:string)=>(await m.read()).find((d:VisualDNA)=>d.id===id),saveTokenLog:m.log}));
vi.mock('../services/cloudDnaService',()=>({
 saveDNA:m.save,deleteDNA:m.remove,wipeLibrary:m.wipe,syncCloudAndLocal:vi.fn(),syncLocalToCloud:vi.fn(),
 isFirestoreQuotaExceeded:()=>false,isCloudSyncEnabled:()=>false,setCloudSyncEnabled:vi.fn(),isSyncInProgress:()=>false,getLastSyncAt:()=>0,resetQuotaExceeded:vi.fn()
}));
vi.mock('../services/imageUtils',()=>({compressImage:async(file:File)=>`data:image/png;base64,${encodeURIComponent(file.name)}`}));
const analyzed={summary:'A monochrome knight',rendering:'cel shading',linework:'clean contours',scores:{style:0.8,rendering:0.9}};
beforeEach(()=>{vi.clearAllMocks();localStorage.removeItem('grimoire_analysis_model');localStorage.removeItem('grimoire_claude_api_key');m.auth.currentUser=null;setDnaOwnerProvider(()=>m.auth.currentUser?.uid??null);m.rows=[];m.read.mockImplementation(async()=>structuredClone(m.rows));m.log.mockResolvedValue(undefined);m.save.mockImplementation(async(d:VisualDNA)=>{m.rows=[d];return d;});m.generate.mockResolvedValue({text:JSON.stringify(analyzed),usageMetadata:{totalTokenCount:456}});});afterEach(cleanup);
it('real import handler runs analyzer, creation and single save preserving analyzer metadata',async()=>{
 const {container}=render(<ArtstyleDatabase/>);await screen.findByText(/database is empty/);
 fireEvent.change(container.querySelector('input[type=file]')!,{target:{files:[new File(['x'],'card.v1.png',{type:'image/png'})]}});
 fireEvent.click(await screen.findByRole('button',{name:'Analyze'}));
 await waitFor(()=>expect(m.save).toHaveBeenCalledTimes(1));
 await waitFor(()=>expect(m.log).toHaveBeenCalledTimes(1));
 expect(m.generate).toHaveBeenCalledTimes(1);const saved=m.save.mock.calls[0][0];
 expect(saved.name).toBe('card.v1');expect(saved.analysisVersion).toBe(4);expect(saved.analysisStatus).toBeDefined();expect(saved.warnings).toBeDefined();expect(saved.isCalibrated).toBe(true);
 expect(saved).not.toHaveProperty('raw');expect(saved).not.toHaveProperty('patch');expect(saved).not.toHaveProperty('clearFields');
});
it('pending import stays visible when dismiss is clicked and does not call AI automatically',async()=>{
 const {container}=render(<ArtstyleDatabase/>);await screen.findByText(/database is empty/);
 fireEvent.change(container.querySelector('input[type=file]')!,{target:{files:[new File(['x'],'one.png',{type:'image/png'})]}});
 await screen.findByRole('button',{name:'Analyze'});fireEvent.click(screen.getByRole('button',{name:'Dismiss finished'}));
 expect(screen.getByRole('button',{name:'Analyze'})).toBeTruthy();expect(m.generate).not.toHaveBeenCalled();
});

it('account switch stops a prepared batch before the next model call',async()=>{
 m.auth.currentUser={uid:'A'};let resolve!:any;m.generate.mockReturnValueOnce(new Promise(r=>resolve=r));
 const {container}=render(<ArtstyleDatabase/>);await screen.findByText(/database is empty/);
 fireEvent.change(container.querySelector('input[type=file]')!,{target:{files:[new File(['x'],'one.png',{type:'image/png'}),new File(['y'],'two.png',{type:'image/png'})]}});
 fireEvent.change(await screen.findByLabelText('Análises simultâneas'),{target:{value:'1'}});
 fireEvent.click(screen.getByRole('button',{name:'Analyze All'}));await waitFor(()=>expect(m.generate).toHaveBeenCalledTimes(1));
 await act(async()=>{m.auth.currentUser={uid:'B'};await m.authChanged(m.auth.currentUser);resolve({text:JSON.stringify(analyzed),usageMetadata:{totalTokenCount:456}});});
 expect(m.generate).toHaveBeenCalledTimes(1);expect(m.save).not.toHaveBeenCalled();expect(m.log).toHaveBeenCalledTimes(1);
});
it.each(['save','delete'])('delayed %s completion cannot mutate the next account UI',async(operation)=>{
 const record={...analyzed,id:'same',name:'Account A',imageUrl:'data:image/png;base64,mock',tags:[],ownerId:'A'};
 m.auth.currentUser={uid:'A'};m.rows=[record];let resolve!:any;
 if(operation==='save')m.save.mockReturnValueOnce(new Promise(r=>resolve=r));
 else m.remove.mockReturnValueOnce(new Promise(r=>resolve=r));
 render(<ArtstyleDatabase/>);await screen.findByText('Account A');
 if(operation==='save'){
   fireEvent.click(screen.getByText('Account A'));fireEvent.click(screen.getByTitle('Edit memory details'));
   fireEvent.click(screen.getByRole('button',{name:'Save Edits'}));await waitFor(()=>expect(m.save).toHaveBeenCalledTimes(1));
 } else {
   fireEvent.click(screen.getByTitle('Delete profile'));fireEvent.click(screen.getByTitle('Click again to confirm'));await waitFor(()=>expect(m.remove).toHaveBeenCalledTimes(1));
 }
 await act(async()=>{m.rows=[{...record,name:'Account B',ownerId:'B'}];m.auth.currentUser={uid:'B'};await m.authChanged(m.auth.currentUser);});
 await act(async()=>resolve(record));
 expect(screen.queryAllByText('Account A')).toHaveLength(0);expect(screen.getByText('Account B')).toBeTruthy();
});
describe('library screen',()=>{
 const rows=[
  {...analyzed,id:'1',name:'Zeta',imageUrl:'x',tags:['dragon'],updatedAt:100},
  {...analyzed,id:'2',name:'alpha',imageUrl:'x',tags:[],updatedAt:300},
  {...analyzed,id:'3',name:'Art 10',imageUrl:'x',tags:[],updatedAt:200},
  {...analyzed,id:'4',name:'Art 2',imageUrl:'x',tags:[],createdAt:50},
 ];
 const names=()=>screen.getAllByRole('heading',{level:4}).map(h=>h.textContent).filter(n=>rows.some(r=>r.name===n));
 beforeEach(()=>{localStorage.removeItem('grimoire_library_sort');m.rows=structuredClone(rows);});
 it('sorts by last change by default and toggles to alphabetical, remembering the choice',async()=>{
  const first=render(<ArtstyleDatabase/>);await screen.findByText('Zeta');
  expect(names()).toEqual(['alpha','Art 10','Zeta','Art 2']);
  fireEvent.click(screen.getByRole('button',{name:'Ordem: data de alteração'}));
  expect(names()).toEqual(['alpha','Art 2','Art 10','Zeta']);
  first.unmount();
  render(<ArtstyleDatabase/>);await screen.findByText('Zeta');
  expect(names()).toEqual(['alpha','Art 2','Art 10','Zeta']);
  fireEvent.click(screen.getByRole('button',{name:'Ordem: alfabética'}));
  expect(names()).toEqual(['alpha','Art 10','Zeta','Art 2']);
 });
 it('keeps the order while searching',async()=>{
  render(<ArtstyleDatabase/>);await screen.findByText('Zeta');
  fireEvent.change(screen.getByPlaceholderText('Search Visual Memories...'),{target:{value:'art'}});
  expect(names()).toEqual(['Art 10','Art 2']);
 });
 it('starts with the tag blocks hidden and shows them on request',async()=>{
  render(<ArtstyleDatabase/>);await screen.findByText('Zeta');
  expect(screen.queryByText('Physical Scale')).toBeNull();
  fireEvent.click(screen.getByRole('button',{name:'Mostrar Blocos'}));
  expect(screen.getByText('Physical Scale')).toBeTruthy();
 });
 it('has no shortcut back to the generator and no usage hints',async()=>{
  m.rows=[{...rows[0],imageUrl:thumbnail}];
  const {container}=render(<ArtstyleDatabase/>);await screen.findByText('Zeta');
  expect(screen.queryByRole('button',{name:/Forge Cards/})).toBeNull();
  expect(container.textContent).not.toMatch(/só têm a miniatura|importe os arquivos/i);
 });
});
const thumbnail=`data:image/jpeg;base64,${btoa(String.fromCharCode(0xff,0xd8,0xff,0xc0,0,17,8,0,179,0,179,3,0,0,0,0,0,0,0,0,0))}`;
it('selecting a folder upgrades same-name records, skips finished ones and adds new ones',async()=>{
 const old={...analyzed,id:'old-id',name:'Old Art',imageUrl:thumbnail,energyDesign:'stale text',tags:['boss monster','my custom tag'],revision:2,createdAt:5,cloudDocumentId:'doc'};
 const done={...analyzed,id:'done-id',name:'Done Art',imageUrl:'data:image/jpeg;base64,full',tags:[],analysisVersion:4};
 m.rows=[old,done];m.save.mockImplementation(async(d:VisualDNA)=>{m.rows=[...m.rows.filter(r=>r.id!==d.id),d];return d;});
 const {container}=render(<ArtstyleDatabase/>);await screen.findByText('Old Art');
 fireEvent.change(container.querySelector('input[type=file]')!,{target:{files:['Old Art.jpg','Done Art.jpg','New Art.jpg'].map(n=>new File(['x'],n,{type:'image/jpeg'}))}});
 await screen.findByText(/1 novas e 1 atualizações. 1 já analisadas/);
 fireEvent.click(await screen.findByRole('button',{name:'Analyze All'}));
 await waitFor(()=>expect(m.save).toHaveBeenCalledTimes(2));await screen.findByText(/Lote concluído: 2 analisadas, 0 com falha/);
 expect(m.generate).toHaveBeenCalledTimes(2);
 const upgraded=m.save.mock.calls.map(c=>c[0]).find(d=>d.name==='Old Art');
 expect(upgraded).toMatchObject({id:'old-id',imageUrl:'data:image/png;base64,Old%20Art.jpg',analysisVersion:4,cloudDocumentId:'doc'});
 expect(upgraded.tags).toContain('my custom tag');expect(upgraded).not.toHaveProperty('energyDesign','stale text');
});
it('Piloto analyzes only the first items and Pausar stops the rest of a batch',async()=>{
 m.save.mockImplementation(async(d:VisualDNA)=>{m.rows=[...m.rows.filter(r=>r.id!==d.id),d];return d;});
 const {container}=render(<ArtstyleDatabase/>);await screen.findByText(/database is empty/);
 fireEvent.change(container.querySelector('input[type=file]')!,{target:{files:Array.from({length:9},(_,i)=>new File(['x'],`art-${i}.jpg`,{type:'image/jpeg'}))}});
 fireEvent.click(await screen.findByRole('button',{name:'Piloto (5)'}));
 await screen.findByText(/Piloto concluído: 5 analisadas/);expect(m.generate).toHaveBeenCalledTimes(5);
 fireEvent.change(screen.getByLabelText('Análises simultâneas'),{target:{value:'1'}});
 let resolve!:any;m.generate.mockReturnValueOnce(new Promise(r=>resolve=r));
 fireEvent.click(screen.getByRole('button',{name:'Analyze All'}));await waitFor(()=>expect(m.generate).toHaveBeenCalledTimes(6));
 fireEvent.click(screen.getByRole('button',{name:'Pausar'}));
 await act(async()=>resolve({text:JSON.stringify(analyzed),usageMetadata:{totalTokenCount:1}}));
 await screen.findByText(/Lote pausado: 1 analisadas/);expect(m.generate).toHaveBeenCalledTimes(6);
 fireEvent.click(screen.getByRole('button',{name:'Analyze All'}));
 await screen.findByText(/Lote concluído: 3 analisadas/);expect(m.generate).toHaveBeenCalledTimes(9);
});
it('a broken setup stops the batch after a few failures instead of burning the queue',async()=>{
 m.generate.mockResolvedValue({text:'not json',usageMetadata:{totalTokenCount:1}});
 const {container}=render(<ArtstyleDatabase/>);await screen.findByText(/database is empty/);
 fireEvent.change(container.querySelector('input[type=file]')!,{target:{files:Array.from({length:30},(_,i)=>new File(['x'],`art-${i}.jpg`,{type:'image/jpeg'}))}});
 fireEvent.change(await screen.findByLabelText('Análises simultâneas'),{target:{value:'1'}});
 fireEvent.click(screen.getByRole('button',{name:'Analyze All'}));
 await screen.findByText(/Parado depois de falhas seguidas/);expect(m.generate).toHaveBeenCalledTimes(5);expect(m.save).not.toHaveBeenCalled();
});
describe('Apagar biblioteca',()=>{
 beforeEach(()=>{
  URL.createObjectURL=vi.fn(()=>'blob:backup');URL.revokeObjectURL=vi.fn();
  m.exportBackup.mockResolvedValue({records:[],warnings:[]});
  m.wipe.mockImplementation(async()=>{m.rows=[];return {localDeleted:2,cloudDeleted:2};});
 });
 const open=async(user?:{uid:string})=>{
  m.auth.currentUser=user??null;m.rows=[{...analyzed,id:'a',name:'Art A',imageUrl:'x',tags:[],ownerId:user?.uid??null},{...analyzed,id:'b',name:'Art B',imageUrl:'y',tags:[],ownerId:user?.uid??null}];
  render(<ArtstyleDatabase/>);await screen.findByText('Art A');
  fireEvent.click(screen.getByRole('button',{name:'Apagar biblioteca'}));
 };
 const confirm=()=>fireEvent.change(screen.getByLabelText('Digite APAGAR para confirmar'),{target:{value:'apagar'}});
 const submit=()=>screen.getByRole('button',{name:'Baixar backup e apagar'}) as HTMLButtonElement;
 it('needs the typed confirmation, downloads a backup first, then wipes everywhere',async()=>{
  await open({uid:'A'});expect(submit().disabled).toBe(true);fireEvent.click(submit());expect(m.wipe).not.toHaveBeenCalled();
  confirm();expect(submit().disabled).toBe(false);fireEvent.click(submit());
  await screen.findByText(/Biblioteca apagada: 2 neste aparelho e 2 na nuvem/);
  expect(m.exportBackup.mock.invocationCallOrder[0]).toBeLessThan(m.wipe.mock.invocationCallOrder[0]);
  expect(m.wipe.mock.calls[0][0].includeCloud).toBe(true);
  await screen.findByText(/database is empty/);expect(screen.queryByText('Art A')).toBeNull();
 });
 it('never deletes when the backup fails',async()=>{
  m.exportBackup.mockRejectedValue(new Error('disk full'));await open({uid:'A'});confirm();fireEvent.click(submit());
  await screen.findByText(/Falha ao exportar backup: disk full/);expect(m.wipe).not.toHaveBeenCalled();expect(screen.getByText('Art A')).toBeTruthy();
 });
 it('offers a device-only wipe to a connected account',async()=>{
  await open({uid:'A'});fireEvent.click(screen.getByLabelText('Só neste aparelho'));confirm();fireEvent.click(submit());
  await waitFor(()=>expect(m.wipe).toHaveBeenCalled());expect(m.wipe.mock.calls[0][0].includeCloud).toBe(false);
 });
 it('without an account it only touches this device',async()=>{
  await open();expect(screen.queryByLabelText('Só neste aparelho')).toBeNull();confirm();fireEvent.click(submit());
  await waitFor(()=>expect(m.wipe).toHaveBeenCalled());expect(m.wipe.mock.calls[0][0].includeCloud).toBe(false);
 });
 it('shows why a failed wipe stopped and keeps the library on screen',async()=>{
  m.wipe.mockRejectedValue(new Error('Apagadas 1 de 2 referências da nuvem, e nada foi apagado neste aparelho.'));await open({uid:'A'});confirm();fireEvent.click(submit());
  await screen.findByText(/Apagadas 1 de 2/);expect(screen.getByText('Art A')).toBeTruthy();
 });
});
describe('Gemini and Claude on one record',()=>{
 const claudeReply=(summary='A Claude reading')=>({model:'claude-sonnet-5-5',stop_reason:'end_turn',content:[{type:'text',text:JSON.stringify({...analyzed,summary,lighting:'Dramatic warm rim light from below'})}],usage:{input_tokens:540,cache_read_input_tokens:8600,cache_creation_input_tokens:0,output_tokens:2500}});
 const geminiRecord=()=>({...analyzed,id:'art',name:'Art',imageUrl:'data:image/jpeg;base64,FULL',summary:'A Gemini reading',tags:['dragon'],revision:1,analysisVersion:4,analysisProvider:'gemini',analysisModel:'gemini-4-argon'});
 const select=(model:string)=>fireEvent.change(screen.getByLabelText('Modelo de análise'),{target:{value:model}});
 const saveKey=()=>{fireEvent.change(screen.getByLabelText('Chave da API do Claude'),{target:{value:'sk-test'}});fireEvent.click(screen.getByRole('button',{name:'Salvar'}));};
 const reanalyze=()=>{const button=screen.getByTitle(/^Reanalisar com/);fireEvent.click(button);fireEvent.click(screen.getByTitle('Click again to confirm reanalysis'));};
 beforeEach(()=>{m.save.mockImplementation(async(d:VisualDNA)=>{m.rows=[d];return d;});m.claude.mockResolvedValue(claudeReply());m.rows=[geminiRecord()];});
 const open=async()=>{render(<ArtstyleDatabase/>);fireEvent.click(await screen.findByText('Art'));};

 it('offers every analysis model and remembers the choice',async()=>{
  const first=render(<ArtstyleDatabase/>);await screen.findByText('Art');
  const options=Array.from((screen.getByLabelText('Modelo de análise') as HTMLSelectElement).options).map(o=>o.textContent);
  expect(options).toEqual(['Gemini 4 Argon','Gemini 3.8 Flash','Claude Sonnet 5.5','Claude Opus 5.5']);
  select('claude-opus-5-5');first.unmount();render(<ArtstyleDatabase/>);await screen.findByText('Art');
  expect((screen.getByLabelText('Modelo de análise') as HTMLSelectElement).value).toBe('claude-opus-5-5');
 });
 it('asks for the key only with a Claude model, and refuses to run without it',async()=>{
  await open();expect(screen.queryByLabelText('Chave da API do Claude')).toBeNull();
  select('claude-sonnet-5-5');expect(screen.getByLabelText('Chave da API do Claude')).toBeTruthy();
  fireEvent.click(screen.getByTitle(/^Reanalisar com/));
  expect(await screen.findByText(/Informe a chave/)).toBeTruthy();expect(m.claude).not.toHaveBeenCalled();
  saveKey();expect(localStorage.getItem('grimoire_claude_api_key')).toBe('sk-test');expect(screen.queryByLabelText('Chave da API do Claude')).toBeNull();
  fireEvent.click(screen.getByRole('button',{name:'Remover chave do Claude'}));expect(localStorage.getItem('grimoire_claude_api_key')).toBeNull();
 });
 it('without a stored analysis there is no switch button',async()=>{
  await open();expect(screen.queryByTitle(/Trocar para a análise/)).toBeNull();
 });
 it('analyzing with Claude keeps the Gemini analysis, and the button switches between them',async()=>{
  await open();select('claude-sonnet-5-5');saveKey();reanalyze();
  await waitFor(()=>expect(m.save).toHaveBeenCalledTimes(1));
  const saved=m.save.mock.calls[0][0];
  expect(saved).toMatchObject({summary:'A Claude reading',analysisProvider:'claude',analysisModel:'claude-sonnet-5-5'});
  expect(saved.storedAnalyses.gemini).toMatchObject({summary:'A Gemini reading',analysisProvider:'gemini',analysisModel:'gemini-4-argon'});
  const toGemini=await screen.findByTitle('Trocar para a análise de Gemini 4 Argon');
  expect(screen.getAllByText('Claude Sonnet 5.5').length).toBeGreaterThan(0);expect(screen.getAllByText(/A Claude reading/).length).toBeGreaterThan(0);
  fireEvent.click(toGemini);
  const toClaude=await screen.findByTitle('Trocar para a análise de Claude Sonnet 5.5');
  expect(m.save.mock.calls[1][0]).toMatchObject({summary:'A Gemini reading',analysisProvider:'gemini'});
  expect(m.save.mock.calls[1][0].storedAnalyses.claude.summary).toBe('A Claude reading');
  expect(screen.getAllByText(/A Gemini reading/).length).toBeGreaterThan(0);expect(m.claude).toHaveBeenCalledTimes(1);expect(m.generate).not.toHaveBeenCalled();
  fireEvent.click(toClaude);await screen.findByTitle('Trocar para a análise de Gemini 4 Argon');
  expect(m.save).toHaveBeenCalledTimes(3);expect(m.claude).toHaveBeenCalledTimes(1);
 });
 it('analyzing again with the same provider replaces only its own analysis',async()=>{
  m.rows=[{...geminiRecord(),summary:'A Claude reading',analysisProvider:'claude',analysisModel:'claude-sonnet-5-5',storedAnalyses:{gemini:{summary:'A Gemini reading',analysisProvider:'gemini',analysisModel:'gemini-4-argon',analysisVersion:4}}}];
  m.claude.mockResolvedValue({...claudeReply('A newer Claude reading'),model:'claude-opus-5-5'});
  await open();select('claude-opus-5-5');saveKey();reanalyze();
  await waitFor(()=>expect(m.save).toHaveBeenCalledTimes(1));
  expect(m.save.mock.calls[0][0]).toMatchObject({summary:'A newer Claude reading',analysisModel:'claude-opus-5-5'});
  expect(m.save.mock.calls[0][0].storedAnalyses.gemini.summary).toBe('A Gemini reading');
  expect(m.generate).not.toHaveBeenCalled();
 });
 it('analyzing with the provider set aside replaces that one and makes it active',async()=>{
  m.rows=[{...geminiRecord(),summary:'A Claude reading',analysisProvider:'claude',analysisModel:'claude-sonnet-5-5',storedAnalyses:{gemini:{summary:'A Gemini reading',analysisProvider:'gemini',analysisModel:'gemini-4-argon',analysisVersion:4}}}];
  m.generate.mockResolvedValue({text:JSON.stringify({...analyzed,summary:'A newer Gemini reading'}),usageMetadata:{totalTokenCount:9}});
  await open();reanalyze();
  await waitFor(()=>expect(m.save).toHaveBeenCalledTimes(1));
  const saved=m.save.mock.calls[0][0];
  expect(saved).toMatchObject({summary:'A newer Gemini reading',analysisProvider:'gemini',analysisModel:'gemini-4-argon'});
  expect(Object.keys(saved.storedAnalyses)).toEqual(['claude']);expect(saved.storedAnalyses.claude.summary).toBe('A Claude reading');
 });
 it('a folder import queues only the arts still missing the selected provider',async()=>{
  const gone={...geminiRecord(),id:'both',name:'Both',storedAnalyses:{claude:{summary:'x',analysisVersion:4,analysisProvider:'claude'}}};
  m.rows=[geminiRecord(),gone];
  const {container}=render(<ArtstyleDatabase/>);await screen.findByText('Art');
  select('claude-sonnet-5-5');
  fireEvent.change(container.querySelector('input[type=file]')!,{target:{files:['Art.jpg','Both.jpg'].map(n=>new File(['x'],n,{type:'image/jpeg'}))}});
  await screen.findByText(/0 novas e 1 atualizações. 1 já analisadas/);
 });
 it('a failed Claude call leaves the record untouched',async()=>{
  m.claude.mockRejectedValue(Object.assign(new Error('401 invalid x-api-key'),{status:401}));
  await open();select('claude-sonnet-5-5');saveKey();reanalyze();
  await screen.findByText(/invalid x-api-key/);expect(m.save).not.toHaveBeenCalled();expect(screen.queryByTitle(/Trocar para a análise/)).toBeNull();
 });
});
it('refuses to reanalyze a thumbnail from the detail panel',async()=>{
 m.rows=[{...analyzed,id:'thumb',name:'Thumb',imageUrl:thumbnail,tags:[]}];
 render(<ArtstyleDatabase/>);fireEvent.click(await screen.findByText('Thumb'));
 expect(screen.getByText('Miniatura')).toBeTruthy();fireEvent.click(screen.getByTitle(/^Reanalisar com/));
 expect(await screen.findByText(/Importe o original/)).toBeTruthy();expect(m.generate).not.toHaveBeenCalled();
});
it('real App tab switching keeps an in-flight analysis visible and prevents another model call',async()=>{
 vi.stubGlobal('fetch',vi.fn().mockResolvedValue({ok:true,json:async()=>({configured:false})}));
 let resolve!:any;m.generate.mockReturnValueOnce(new Promise(r=>resolve=r));
 const {container}=render(<App/>);
 fireEvent.click(await screen.findByRole('button',{name:'Artstyle Database'}));await screen.findByText(/database is empty/);
 fireEvent.change(container.querySelectorAll('input[type=file]')[1],{target:{files:[new File(['x'],'one.png',{type:'image/png'})]}});
 fireEvent.click(await screen.findByRole('button',{name:'Analyze'}));await waitFor(()=>expect(m.generate).toHaveBeenCalledTimes(1));
 fireEvent.click(screen.getByRole('button',{name:'Grimoire'}));
 fireEvent.click(screen.getByRole('button',{name:'Artstyle Database'}));
 expect(screen.getByText('Extracting visual DNA...')).toBeTruthy();
 fireEvent.click(screen.getByRole('button',{name:'Analyze All'}));fireEvent.click(screen.getByRole('button',{name:'Dismiss finished'}));
 expect(screen.getByText('Extracting visual DNA...')).toBeTruthy();expect(m.generate).toHaveBeenCalledTimes(1);
 await act(async()=>resolve({text:JSON.stringify(analyzed),usageMetadata:{totalTokenCount:456}}));
 expect(m.save).toHaveBeenCalledTimes(1);expect(m.log).toHaveBeenCalledTimes(1);vi.unstubAllGlobals();
});
it.each(['edit','delete'])('direct reanalysis respects %s during the mocked model call and accounts usage once',async(change)=>{
 const original={...analyzed,id:'direct',name:'Reference',imageUrl:'data:image/png;base64,mock',tags:[],revision:1};m.rows=[original];
 let resolve!:any;m.generate.mockReturnValueOnce(new Promise(r=>resolve=r));
 render(<ArtstyleDatabase/>);fireEvent.click(await screen.findByText('Reference'));
 fireEvent.click(screen.getByTitle(/^Reanalisar com/));
 const confirm=screen.getByTitle('Click again to confirm reanalysis');
 fireEvent.click(confirm);fireEvent.click(confirm);
 await waitFor(()=>expect(m.generate).toHaveBeenCalledTimes(1));
 m.rows=change==='delete'?[]:[{...original,revision:2,summary:'manual edit'}];
 await act(async()=>resolve({text:JSON.stringify(analyzed),usageMetadata:{totalTokenCount:789}}));
 expect(m.save).not.toHaveBeenCalled();expect(m.log).toHaveBeenCalledTimes(1);expect(m.log.mock.calls[0][0].totalTokenCount).toBe(789);
 if(change==='delete')expect(m.rows).toEqual([]);else expect(m.rows[0].summary).toBe('manual edit');
});
