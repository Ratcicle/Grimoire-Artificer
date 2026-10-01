export function validateImageFile(file: File): void {
  if (!['image/png','image/jpeg','image/webp'].includes(file.type)) throw new Error(`${file.name}: use PNG, JPEG ou WebP.`);
  if (file.size > 20 * 1024 * 1024) throw new Error(`${file.name}: limite de 20 MiB por imagem.`);
  if (file.size === 0) throw new Error(`${file.name}: arquivo vazio.`);
}

export async function prepareReferenceFiles(files: File[], reserved: Set<string>, compress: (file:File)=>Promise<string>) {
  const items: {id:string;name:string;base64:string;status:'pending'}[] = [];
  const errors: string[] = [];
  let batchBytes = 0;
  for (const file of files) {
    const name = file.name.replace(/\.[^.]+$/, '').trim();
    const key = name.toLocaleLowerCase();
    try {
      validateImageFile(file);
      batchBytes += file.size;
      if (batchBytes > 100 * 1024 * 1024) throw new Error(`${file.name}: limite de 100 MiB por lote.`);
      if (!name || reserved.has(key)) throw new Error(`${file.name}: nome já reservado na biblioteca ou no lote.`);
      reserved.add(key);
      try { items.push({id:crypto.randomUUID(),name,base64:await compress(file),status:'pending'}); }
      catch(error) {reserved.delete(key);throw error;}
    } catch (error) {errors.push(error instanceof Error ? error.message : `${file.name}: preparação falhou.`);}
  }
  return {items,errors};
}
export function imageExtension(dataUrl: string) {
  const mime = /^data:([^;,]+)/i.exec(dataUrl)?.[1].toLowerCase();
  return mime === 'image/jpeg' ? 'jpg' : mime === 'image/webp' ? 'webp' : 'png';
}
