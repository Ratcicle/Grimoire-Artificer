// @vitest-environment jsdom
import {afterEach,expect,it,vi} from 'vitest';
import {compressImage,createThumbnail} from './imageUtils';
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllGlobals();});
it('keeps at least one pixel in thin reference and cloud thumbnail dimensions',async()=>{
 vi.stubGlobal('Image',class {width=2000;height=1;onload:any;set src(_s:string){queueMicrotask(()=>this.onload());}});
 vi.spyOn(HTMLCanvasElement.prototype,'getContext').mockReturnValue({drawImage:vi.fn()} as any);
 const dimensions:number[][]=[];
 vi.spyOn(HTMLCanvasElement.prototype,'toDataURL').mockImplementation(function(){dimensions.push([this.width,this.height]);return this.width&&this.height?'data:image/jpeg;base64,mock':'data:,';});
 expect(await compressImage(new File(['x'],'thin.png',{type:'image/png'}),800,800)).toMatch(/^data:image/);
 expect(await createThumbnail('data:image/png;base64,mock')).toEqual({success:true,thumbnail:'data:image/jpeg;base64,mock'});
 expect(dimensions).toEqual([[800,1],[180,1]]);
});
it('turns a canvas exception into handled compression and thumbnail failures',async()=>{
 const images:any[]=[];vi.stubGlobal('Image',class {width=10;height=10;onload:any;set src(_s:string){images.push(this);}});
 vi.spyOn(HTMLCanvasElement.prototype,'getContext').mockReturnValue({drawImage:()=>{throw new Error('canvas failed');}} as any);
 const compressed=compressImage(new File(['x'],'bad.png',{type:'image/png'}));let error:unknown;
 const completion=compressed.catch(e=>{error=e;});await vi.waitFor(()=>expect(images).toHaveLength(1));
 try {images[0].onload();} catch {}
 await Promise.resolve();expect(error).toBeInstanceOf(Error);await completion;
 const thumbnail=createThumbnail('data:image/png;base64,mock');let result:any;
 void thumbnail.then(value=>{result=value;});try {images[1].onload();} catch {}
 await Promise.resolve();expect(result).toEqual({success:false,error:'canvas failed'});
});
