// @vitest-environment jsdom
import React from 'react';
import {act,cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import ArtstyleDatabase from './ArtstyleDatabase';
import App from '../App';
import {VisualDNA} from '../types';
import {setDnaOwnerProvider} from '../services/dnaAccountContext';
const m=vi.hoisted(()=>({read:vi.fn(),save:vi.fn(),log:vi.fn(),generate:vi.fn(),remove:vi.fn(),rows:[] as any[],auth:{currentUser:null as any},authChanged:null as any}));
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
 saveDNA:m.save,deleteDNA:m.remove,syncCloudAndLocal:vi.fn(),syncLocalToCloud:vi.fn(),
 isFirestoreQuotaExceeded:()=>false,isCloudSyncEnabled:()=>false,setCloudSyncEnabled:vi.fn(),isSyncInProgress:()=>false,getLastSyncAt:()=>0,resetQuotaExceeded:vi.fn()
}));
vi.mock('../services/imageUtils',()=>({compressImage:async()=> 'data:image/png;base64,mock'}));
const analyzed={summary:'A monochrome knight',rendering:'cel shading',linework:'clean contours',scores:{style:0.8,rendering:0.9}};
beforeEach(()=>{vi.clearAllMocks();m.auth.currentUser=null;setDnaOwnerProvider(()=>m.auth.currentUser?.uid??null);m.rows=[];m.read.mockImplementation(async()=>structuredClone(m.rows));m.log.mockResolvedValue(undefined);m.save.mockImplementation(async(d:VisualDNA)=>{m.rows=[d];return d;});m.generate.mockResolvedValue({text:JSON.stringify(analyzed),usageMetadata:{totalTokenCount:456}});});afterEach(cleanup);
it('real import handler runs analyzer, creation and single save preserving analyzer metadata',async()=>{
 const {container}=render(<ArtstyleDatabase onBackToGrimoire={()=>{}}/>);await screen.findByText(/database is empty/);
 fireEvent.change(container.querySelector('input[type=file]')!,{target:{files:[new File(['x'],'card.v1.png',{type:'image/png'})]}});
 fireEvent.click(await screen.findByRole('button',{name:'Analyze'}));
 await waitFor(()=>expect(m.save).toHaveBeenCalledTimes(1));
 await waitFor(()=>expect(m.log).toHaveBeenCalledTimes(1));
 expect(m.generate).toHaveBeenCalledTimes(1);const saved=m.save.mock.calls[0][0];
 expect(saved.name).toBe('card.v1');expect(saved.analysisVersion).toBe(4);expect(saved.analysisStatus).toBeDefined();expect(saved.warnings).toBeDefined();expect(saved.isCalibrated).toBe(true);
 expect(saved).not.toHaveProperty('raw');expect(saved).not.toHaveProperty('patch');expect(saved).not.toHaveProperty('clearFields');
});
it('pending import stays visible when dismiss is clicked and does not call AI automatically',async()=>{
 const {container}=render(<ArtstyleDatabase onBackToGrimoire={()=>{}}/>);await screen.findByText(/database is empty/);
 fireEvent.change(container.querySelector('input[type=file]')!,{target:{files:[new File(['x'],'one.png',{type:'image/png'})]}});
 await screen.findByRole('button',{name:'Analyze'});fireEvent.click(screen.getByRole('button',{name:'Dismiss finished'}));
 expect(screen.getByRole('button',{name:'Analyze'})).toBeTruthy();expect(m.generate).not.toHaveBeenCalled();
});

it('account switch stops a prepared batch before the next model call',async()=>{
 m.auth.currentUser={uid:'A'};let resolve!:any;m.generate.mockReturnValueOnce(new Promise(r=>resolve=r));
 const {container}=render(<ArtstyleDatabase onBackToGrimoire={()=>{}}/>);await screen.findByText(/database is empty/);
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
 render(<ArtstyleDatabase onBackToGrimoire={()=>{}}/>);await screen.findByText('Account A');
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
const thumbnail=`data:image/jpeg;base64,${btoa(String.fromCharCode(0xff,0xd8,0xff,0xc0,0,17,8,0,179,0,179,3,0,0,0,0,0,0,0,0,0))}`;
it('selecting a folder upgrades same-name records, skips finished ones and adds new ones',async()=>{
 const old={...analyzed,id:'old-id',name:'Old Art',imageUrl:thumbnail,energyDesign:'stale text',tags:['boss monster','my custom tag'],revision:2,createdAt:5,cloudDocumentId:'doc'};
 const done={...analyzed,id:'done-id',name:'Done Art',imageUrl:'data:image/jpeg;base64,full',tags:[],analysisVersion:4};
 m.rows=[old,done];m.save.mockImplementation(async(d:VisualDNA)=>{m.rows=[...m.rows.filter(r=>r.id!==d.id),d];return d;});
 const {container}=render(<ArtstyleDatabase onBackToGrimoire={()=>{}}/>);await screen.findByText('Old Art');
 expect(screen.getByText(/1 referências só têm a miniatura/)).toBeTruthy();
 fireEvent.change(container.querySelector('input[type=file]')!,{target:{files:['Old Art.jpg','Done Art.jpg','New Art.jpg'].map(n=>new File(['x'],n,{type:'image/jpeg'}))}});
 await screen.findByText(/1 novas e 1 atualizações. 1 já analisadas/);
 fireEvent.click(await screen.findByRole('button',{name:'Analyze All'}));
 await waitFor(()=>expect(m.save).toHaveBeenCalledTimes(2));await screen.findByText(/Lote concluído: 2 analisadas, 0 com falha/);
 expect(m.generate).toHaveBeenCalledTimes(2);
 const upgraded=m.save.mock.calls.map(c=>c[0]).find(d=>d.name==='Old Art');
 expect(upgraded).toMatchObject({id:'old-id',imageUrl:'data:image/png;base64,mock',analysisVersion:4,cloudDocumentId:'doc'});
 expect(upgraded.tags).toContain('my custom tag');expect(upgraded).not.toHaveProperty('energyDesign','stale text');
 await waitFor(()=>expect(screen.queryByText(/referências só têm a miniatura/)).toBeNull());
});
it('Piloto analyzes only the first items and Pausar stops the rest of a batch',async()=>{
 m.save.mockImplementation(async(d:VisualDNA)=>{m.rows=[...m.rows.filter(r=>r.id!==d.id),d];return d;});
 const {container}=render(<ArtstyleDatabase onBackToGrimoire={()=>{}}/>);await screen.findByText(/database is empty/);
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
 const {container}=render(<ArtstyleDatabase onBackToGrimoire={()=>{}}/>);await screen.findByText(/database is empty/);
 fireEvent.change(container.querySelector('input[type=file]')!,{target:{files:Array.from({length:30},(_,i)=>new File(['x'],`art-${i}.jpg`,{type:'image/jpeg'}))}});
 fireEvent.change(await screen.findByLabelText('Análises simultâneas'),{target:{value:'1'}});
 fireEvent.click(screen.getByRole('button',{name:'Analyze All'}));
 await screen.findByText(/Parado depois de falhas seguidas/);expect(m.generate).toHaveBeenCalledTimes(5);expect(m.save).not.toHaveBeenCalled();
});
it('refuses to reanalyze a thumbnail from the detail panel',async()=>{
 m.rows=[{...analyzed,id:'thumb',name:'Thumb',imageUrl:thumbnail,tags:[]}];
 render(<ArtstyleDatabase onBackToGrimoire={()=>{}}/>);fireEvent.click(await screen.findByText('Thumb'));
 expect(screen.getByText('Miniatura')).toBeTruthy();fireEvent.click(screen.getByTitle('Re-run Gemini analysis'));
 expect(await screen.findByText(/Importe o arquivo original/)).toBeTruthy();expect(m.generate).not.toHaveBeenCalled();
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
 render(<ArtstyleDatabase onBackToGrimoire={()=>{}}/>);fireEvent.click(await screen.findByText('Reference'));
 fireEvent.click(screen.getByTitle('Re-run Gemini analysis'));
 const confirm=screen.getByTitle('Click again to confirm reanalysis');
 fireEvent.click(confirm);fireEvent.click(confirm);
 await waitFor(()=>expect(m.generate).toHaveBeenCalledTimes(1));
 m.rows=change==='delete'?[]:[{...original,revision:2,summary:'manual edit'}];
 await act(async()=>resolve({text:JSON.stringify(analyzed),usageMetadata:{totalTokenCount:789}}));
 expect(m.save).not.toHaveBeenCalled();expect(m.log).toHaveBeenCalledTimes(1);expect(m.log.mock.calls[0][0].totalTokenCount).toBe(789);
 if(change==='delete')expect(m.rows).toEqual([]);else expect(m.rows[0].summary).toBe('manual edit');
});
