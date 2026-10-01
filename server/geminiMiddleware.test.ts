import {Readable} from 'node:stream';
import {expect,it,vi} from 'vitest';
import {createGeminiMiddleware} from './geminiMiddleware';
async function request(handler:any,url:string,body?:any,origin='http://localhost:3000') {
 const req=Readable.from(body?[JSON.stringify(body)]:[]) as any;req.url=url;req.method=body?'POST':'GET';req.headers={origin,host:'localhost:3000'};
 let data:any;const res={statusCode:0,setHeader:vi.fn(),end:(v:string)=>{data=JSON.parse(v);}};
 await handler(req,res,()=>{});return {status:res.statusCode,data};
}
it('missing configuration cannot invoke the model or expose a credential',async()=>{
 const generate=vi.fn();const handler=createGeminiMiddleware({configured:false,generate});
 expect((await request(handler,'/api/gemini/status')).data).toMatchObject({configured:false});
 expect((await request(handler,'/api/gemini/generate',{model:'gemini-3.5-flash',contents:'test'})).status).toBe(503);expect(generate).not.toHaveBeenCalled();
});
it('rejects cross-origin calls and forwards one authorized request with usage',async()=>{
 const generate=vi.fn().mockResolvedValue({text:'{}',usageMetadata:{totalTokenCount:10}});const handler=createGeminiMiddleware({configured:true,generate});const body={model:'gemini-3.5-flash',contents:'test'};
 expect((await request(handler,'/api/gemini/generate',body,'https://other.test')).status).toBe(403);expect(generate).not.toHaveBeenCalled();
 expect((await request(handler,'/api/gemini/generate',body)).data.usageMetadata.totalTokenCount).toBe(10);expect(generate).toHaveBeenCalledTimes(1);
});
it('rejects opaque origin without throwing or attempting the model',async()=>{
 const generate=vi.fn();const handler=createGeminiMiddleware({configured:true,generate});
 expect((await request(handler,'/api/gemini/generate',{model:'gemini-3.5-flash',contents:'test'},'null')).status).toBe(403);
 expect(generate).not.toHaveBeenCalled();
});
