import {expect,it,vi} from 'vitest';
import {getDataUrlImageSize,isThumbnailImage,prepareReferenceFiles,validateImageFile,imageExtension} from './imagePreparation';
import {fingerprintImage} from './visualDnaSyncUtils';
const file=(name:string,size=100)=>({name,type:'image/png',size}) as File;
const jpegOf=(width:number,height:number)=>{const bytes=[0xff,0xd8,0xff,0xe0,0,4,0,0,0xff,0xc0,0,17,8,height>>8,height&255,width>>8,width&255,3,0,0,0,0,0,0,0,0,0];return `data:image/jpeg;base64,${btoa(String.fromCharCode(...bytes))}`;};
const pngOf=(width:number,height:number)=>{const bytes=[0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a,0,0,0,13,0x49,0x48,0x44,0x52,0,0,width>>8,width&255,0,0,height>>8,height&255,8,6,0,0];return `data:image/png;base64,${btoa(String.fromCharCode(...bytes))}`;};
type Rec={id:string;name:string;current?:boolean};
const library=(records:Rec[])=>({byName:new Map<string,Rec>(records.map(r=>[r.name.toLocaleLowerCase(),r])),isCurrent:(r:Rec)=>!!r.current});
it('rejects one image saved under two names, in the batch and against the library',async()=>{
 const sameBytes=vi.fn().mockResolvedValue('data:image/jpeg;base64,SAME');
 const inBatch=await prepareReferenceFiles([file('The Fallen & The Virtuous.jpg'),file('The Fallen &amp; The Virtuous.jpg')],new Set(),sameBytes);
 expect(inBatch.items.map(i=>i.name)).toEqual(['The Fallen & The Virtuous']);
 expect(inBatch.errors).toEqual(['The Fallen &amp; The Virtuous.jpg: imagem idêntica a "The Fallen & The Virtuous".']);
 const fingerprint=fingerprintImage('data:image/jpeg;base64,SAME');
 const another=await prepareReferenceFiles([file('Other Name.jpg')],new Set(),sameBytes,{existing:{...library([]),imageOwners:new Map([[fingerprint,'Stored Art']])}});
 expect(another.items).toEqual([]);expect(another.errors[0]).toContain('"Stored Art"');
 // The same art re-imported under its own name is an update, not a repetition.
 const own=await prepareReferenceFiles([file('Stored Art.jpg')],new Set(),sameBytes,{existing:{...library([{id:'stored',name:'Stored Art'}]),imageOwners:new Map([[fingerprint,'Stored Art']])}});
 expect(own.items.map(i=>i.operationType)).toEqual(['upgrade']);expect(own.errors).toEqual([]);
});
it('a rejected repetition frees its name for a later file',async()=>{
 const compress=vi.fn().mockResolvedValueOnce('A').mockResolvedValueOnce('A').mockResolvedValueOnce('B');
 const result=await prepareReferenceFiles([file('one.jpg'),file('two.jpg'),file('two.png')],new Set(),compress);
 expect(result.items.map(i=>i.name)).toEqual(['one','two']);expect(result.errors).toHaveLength(1);
});
it('a same-name file updates its record, a finished one is skipped and a new one gets a new id',async()=>{
 const compress=vi.fn(async(f:File)=>`prepared ${f.name}`);
 const result=await prepareReferenceFiles([file('Old Art.jpg'),file('Done Art.jpg'),file('New Art.jpg')],new Set(),compress,{existing:library([{id:'old-id',name:'old art'},{id:'done-id',name:'done art',current:true}])});
 expect(result.items.map(i=>[i.name,i.operationType])).toEqual([['Old Art','upgrade'],['New Art',undefined]]);
 expect(result.items[0].id).toBe('old-id');expect(result.items[1].id).not.toBe('old-id');
 expect(result.skipped).toBe(1);expect(result.errors).toEqual([]);expect(compress).toHaveBeenCalledTimes(2);
});
it('accepts a folder larger than the former 100 MiB limit and reports progress',async()=>{
 const files=Array.from({length:30},(_,i)=>file(`art-${i}.jpg`,8*1024*1024));const progress=vi.fn();
 const result=await prepareReferenceFiles(files,new Set(),async f=>`prepared ${f.name}`,{onProgress:progress});
 expect(result.items).toHaveLength(30);expect(result.errors).toEqual([]);expect(progress).toHaveBeenLastCalledWith(30,30);
});
it('reads image size from headers and recognizes cloud thumbnails',()=>{
 expect(getDataUrlImageSize(jpegOf(179,179))).toEqual({width:179,height:179});
 expect(getDataUrlImageSize(pngOf(800,600))).toEqual({width:800,height:600});
 expect(isThumbnailImage(jpegOf(179,179))).toBe(true);expect(isThumbnailImage(jpegOf(180,133))).toBe(true);
 expect(isThumbnailImage(jpegOf(624,624))).toBe(false);expect(isThumbnailImage(pngOf(800,800))).toBe(false);
 expect(isThumbnailImage('data:image/png;base64,mock')).toBe(false);expect(isThumbnailImage('image')).toBe(false);expect(isThumbnailImage(undefined)).toBe(false);
});
it('reserves duplicate names within the batch, keeps dotted names and prepares sequentially',async()=>{
 const compress=vi.fn(async(f:File)=>`prepared ${f.name}`);const files=['card.v1.png','card.v2.jpg','card.v1.png'].map(name=>({name,type:'image/png',size:100}) as File);
 const result=await prepareReferenceFiles(files,new Set(),compress);
 expect(result.items.map(i=>i.name)).toEqual(['card.v1','card.v2']);expect(result.errors).toHaveLength(1);expect(compress).toHaveBeenCalledTimes(2);
});
it('rejects non-images and oversize files before decoding',()=>{
 expect(()=>validateImageFile({name:'bad.svg',type:'image/svg+xml',size:100} as File)).toThrow();
 expect(()=>validateImageFile({name:'large.png',type:'image/png',size:21*1024*1024} as File)).toThrow();
});
it('downloads the actual image MIME without conversion',()=>{expect(imageExtension('data:image/jpeg;base64,x')).toBe('jpg');expect(imageExtension('data:image/png;base64,x')).toBe('png');});
