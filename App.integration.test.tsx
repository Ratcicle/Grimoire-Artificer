// @vitest-environment jsdom
import React from 'react';
import {act, cleanup, render, screen} from '@testing-library/react';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import App from './App';
const m=vi.hoisted(()=>({generate:vi.fn(),log:vi.fn(),submit:null as any}));
vi.mock('./services/geminiService',()=>({
 checkApiKey:async()=>true,promptApiKeySelection:vi.fn(),disconnectApiKey:vi.fn(),
 resolveAccessPolicy:async()=>({mode:'local_server',label:'Servidor local configurado',hasPersonalKey:true}),
 validateModelAccess:()=>({allowed:true}),
 generateCardArt:(r:any,started?:()=>void)=>{started?.();return m.generate(r);},
 mapUsageMetadata:(u:any)=>({totalTokenCount:u?.totalTokenCount}),extractUsageFromError:(e:any)=>e?.usageMetadata
}));
vi.mock('./services/accessPolicy',()=>({
 resolveAccessPolicy:async()=>({mode:'local_server',label:'Servidor local configurado',hasPersonalKey:true}),
 validateModelAccess:()=>({allowed:true}),
 setAccessModeForTesting:vi.fn(),
 hasHostRuntimeCredential:()=>false
}));
vi.mock('./services/localDbService',()=>({saveTokenLog:m.log}));
vi.mock('./services/cloudDnaService',()=>({saveDNA:vi.fn()}));
vi.mock('./services/dnaAccountContext',()=>({captureDnaOperationContext:()=>({ownerId:null}),assertDnaOperationContext:vi.fn()}));
vi.mock('./components/CardForm',()=>({default:(p:any)=>{m.submit=p.onSubmit;return <div>form</div>;}}));
vi.mock('./components/CardFrame',()=>({default:()=> <div>generated art</div>}));
vi.mock('./components/ArtstyleDatabase',()=>({default:()=> <div>database</div>}));
beforeEach(()=>{vi.clearAllMocks();m.log.mockResolvedValue(undefined);});afterEach(cleanup);
it('the App callback excludes two concurrent submissions and keeps success when log fails',async()=>{
 let resolve!:any;m.generate.mockReturnValue(new Promise(r=>resolve=r));m.log.mockRejectedValue(new Error('log unavailable'));
 render(<App/>);await screen.findByText('form');
 let first:any,second:any;
 await act(async()=>{first=m.submit({model:'mock',subject:'knight',archetype:'Generic Fantasy',cardType:'Monster',complexity:'Medium',context:'Character'});second=m.submit({model:'mock',subject:'knight',archetype:'Generic Fantasy',cardType:'Monster',complexity:'Medium',context:'Character'});});
 expect(m.generate).toHaveBeenCalledTimes(1);
 await act(async()=>{resolve({imageUrl:'mock-art',usageMetadata:{totalTokenCount:200}});await Promise.all([first,second]);});
 expect(m.log).toHaveBeenCalledTimes(1);expect(screen.queryByText(/failed to manifest/)).toBeNull();expect(screen.getByText('generated art')).toBeTruthy();
});
