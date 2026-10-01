// @vitest-environment jsdom
import React from 'react';
import {act,cleanup,fireEvent,render,screen} from '@testing-library/react';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import CardForm from './CardForm';
const m=vi.hoisted(()=>({read:vi.fn(),compress:vi.fn(),changed:null as any}));
vi.mock('../services/localDbService',()=>({getLocalDNA:m.read}));
vi.mock('../services/dnaAccountContext',()=>({subscribeDnaChanges:(f:any)=>{m.changed=f;return ()=>{};}}));
vi.mock('../services/imageUtils',()=>({compressImage:m.compress}));
beforeEach(()=>{vi.clearAllMocks();localStorage.clear();m.read.mockResolvedValue([]);});afterEach(cleanup);
it('blocks submit during preparation and newest image wins when promises finish backwards',async()=>{
 const submit=vi.fn();const pending:((v:string)=>void)[]=[];m.compress.mockImplementation(()=>new Promise(r=>pending.push(r)));
 const {container}=render(<CardForm onSubmit={submit} isLoading={false} hasApiKey onRequestKey={()=>{}}/>);
 fireEvent.change(screen.getByRole('textbox'),{target:{value:'knight'}});
 const input=container.querySelector('input[type=file]')!;
 fireEvent.change(input,{target:{files:[new File(['a'],'one.png',{type:'image/png'})]}});
 fireEvent.submit(container.querySelector('form')!);expect(submit).not.toHaveBeenCalled();
 fireEvent.change(input,{target:{files:[new File(['b'],'two.png',{type:'image/png'})]}});
 await act(async()=>pending[1]('newest'));await act(async()=>pending[0]('old'));
 fireEvent.submit(container.querySelector('form')!);expect(submit.mock.calls[0][0].referenceImage).toBe('newest');
});
it('refreshes local manual references on library changes without cloud reads',async()=>{
 render(<CardForm onSubmit={()=>{}} isLoading={false} hasApiKey onRequestKey={()=>{}}/>);
 await act(async()=>{});expect(m.read).toHaveBeenCalledTimes(1);
 expect(m.changed).toBeTypeOf('function');await act(async()=>m.changed());expect(m.read).toHaveBeenCalledTimes(2);
});
