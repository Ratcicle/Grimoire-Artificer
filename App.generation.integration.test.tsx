// @vitest-environment jsdom
import React from 'react';
import {act,cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {afterEach,expect,it,vi} from 'vitest';
import App from './App';
const m=vi.hoisted(()=>({generate:vi.fn(),log:vi.fn()}));
vi.mock('@google/genai',()=>({Type:{OBJECT:'OBJECT',STRING:'STRING',ARRAY:'ARRAY',NUMBER:'NUMBER'},GoogleGenAI:class {models={generateContent:m.generate};}}));
vi.mock('./services/geminiTransport',async()=>{
 const {GoogleGenAI}=await import('@google/genai');
 return {hasHostRuntimeCredential:()=>false,createGeminiClient:(started?:()=>void)=>({models:{generateContent:(r:any)=>{started?.();return new GoogleGenAI({}).models.generateContent(r);}}})};
});
vi.mock('./services/localDbService',()=>({getLocalDNA:async()=>[],saveTokenLog:m.log}));
vi.mock('./services/cloudDnaService',()=>({saveDNA:vi.fn()}));
afterEach(()=>{cleanup();vi.unstubAllGlobals();});
it('real form → App → operation → Gemini service sends one payload and retains art after log failure',async()=>{
 localStorage.clear();vi.stubGlobal('fetch',vi.fn().mockResolvedValue({ok:true,json:async()=>({configured:true})}));
 let resolve!:any;m.generate.mockReturnValueOnce(new Promise(r=>resolve=r));m.log.mockRejectedValue(new Error('log unavailable'));
 const {container}=render(<App/>);await screen.findByRole('button',{name:'Manifest Card'});
 fireEvent.change(screen.getByRole('textbox'),{target:{value:'A human knight wearing white silk'}});
 await act(async()=>{fireEvent.submit(container.querySelector('form')!);fireEvent.submit(container.querySelector('form')!);});
 await waitFor(()=>expect(m.generate).toHaveBeenCalledTimes(1));
 expect(m.generate.mock.calls[0][0].contents.parts.find((p:any)=>p.text).text).toContain('A human knight wearing white silk');
 await act(async()=>resolve({candidates:[{content:{parts:[{inlineData:{data:'mock',mimeType:'image/png'}}]}}],usageMetadata:{totalTokenCount:321}}));
 await screen.findByRole('button',{name:'DOWNLOAD ARTIFACT'});expect(m.log).toHaveBeenCalledTimes(1);expect(m.log.mock.calls[0][0].totalTokenCount).toBe(321);
 expect(screen.getByText('Biblioteca vazia; nenhuma referência usada.')).toBeTruthy();expect(m.generate).toHaveBeenCalledTimes(1);
});
