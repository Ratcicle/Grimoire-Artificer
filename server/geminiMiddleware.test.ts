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
it('allows the concurrency the analysis queue uses and refuses more',async()=>{
 let release!:(v:any)=>void;const gate=new Promise(r=>release=r);
 const generate=vi.fn(()=>gate);const handler=createGeminiMiddleware({configured:true,generate});const body={model:'gemini-4-argon',contents:'test'};
 const pending=[1,2,3,4].map(()=>request(handler,'/api/gemini/generate',body));
 await vi.waitFor(()=>expect(generate).toHaveBeenCalledTimes(4));
 expect((await request(handler,'/api/gemini/generate',body)).status).toBe(409);expect(generate).toHaveBeenCalledTimes(4);
 release({text:'{}'});expect((await Promise.all(pending)).map(r=>r.status)).toEqual([200,200,200,200]);
 expect((await request(handler,'/api/gemini/generate',body)).status).toBe(200);
});
it('reports the provider status and reason instead of a generic failure',async()=>{
 const fails=(error:any)=>createGeminiMiddleware({configured:true,generate:vi.fn().mockRejectedValue(error)});const body={model:'gemini-4-argon',contents:'test'};
 const invalid=await request(fails(Object.assign(new Error(`Schema too complex for key AIza${"A".repeat(35)}`),{status:400})),'/api/gemini/generate',body);
 expect(invalid.status).toBe(400);expect(invalid.data.detail).toContain('Schema too complex');expect(invalid.data.detail).not.toContain('AIza');
 expect((await request(fails(Object.assign(new Error('Too many requests'),{status:429})),'/api/gemini/generate',body)).status).toBe(429);
 expect((await request(fails(Object.assign(new Error('The model is overloaded'),{status:503})),'/api/gemini/generate',body)).status).toBe(503);
 // "generate" contains "rate" and is not a rate limit.
 expect((await request(fails(new Error('Failed to generate content')),'/api/gemini/generate',body)).status).toBe(502);
});
it('rejects opaque origin without throwing or attempting the model',async()=>{
 const generate=vi.fn();const handler=createGeminiMiddleware({configured:true,generate});
 expect((await request(handler,'/api/gemini/generate',{model:'gemini-3.5-flash',contents:'test'},'null')).status).toBe(403);
 expect(generate).not.toHaveBeenCalled();
});
