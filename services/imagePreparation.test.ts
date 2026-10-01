import {expect,it,vi} from 'vitest';
import {prepareReferenceFiles,validateImageFile,imageExtension} from './imagePreparation';
it('reserves duplicate names within the batch, keeps dotted names and prepares sequentially',async()=>{
 const compress=vi.fn().mockResolvedValue('prepared');const files=['card.v1.png','card.v2.jpg','card.v1.png'].map(name=>({name,type:'image/png',size:100}) as File);
 const result=await prepareReferenceFiles(files,new Set(),compress);
 expect(result.items.map(i=>i.name)).toEqual(['card.v1','card.v2']);expect(result.errors).toHaveLength(1);expect(compress).toHaveBeenCalledTimes(2);
});
it('rejects non-images and oversize files before decoding',()=>{
 expect(()=>validateImageFile({name:'bad.svg',type:'image/svg+xml',size:100} as File)).toThrow();
 expect(()=>validateImageFile({name:'large.png',type:'image/png',size:21*1024*1024} as File)).toThrow();
});
it('downloads the actual image MIME without conversion',()=>{expect(imageExtension('data:image/jpeg;base64,x')).toBe('jpg');expect(imageExtension('data:image/png;base64,x')).toBe('png');});
