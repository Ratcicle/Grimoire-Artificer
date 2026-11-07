import { fingerprintImage } from "./visualDnaSyncUtils";

export function validateImageFile(file: File): void {
  if (!['image/png','image/jpeg','image/webp'].includes(file.type)) throw new Error(`${file.name}: use PNG, JPEG ou WebP.`);
  if (file.size > 20 * 1024 * 1024) throw new Error(`${file.name}: limite de 20 MiB por imagem.`);
  if (file.size === 0) throw new Error(`${file.name}: arquivo vazio.`);
}

// Files are compressed one at a time and the originals are released, so this guards
// against a mistaken selection rather than against memory use.
export const MAX_BATCH_BYTES = 2 * 1024 * 1024 * 1024;

export interface ExistingReferenceRules<T extends { id: string }> {
  /** Records of the current library by lowercase name. */
  byName: Map<string, T>;
  /** True when the record already has the current analysis of a full-size image. */
  isCurrent: (record: T) => boolean;
  /** Name of the record holding each known image, by fingerprint. */
  imageOwners?: Map<string, string>;
}

export interface PreparedReference {
  id: string;
  name: string;
  base64: string;
  status: 'pending';
  operationType?: 'upgrade';
}

export async function prepareReferenceFiles<T extends { id: string } = { id: string }>(
  files: File[],
  reserved: Set<string>,
  compress: (file: File) => Promise<string>,
  options: { existing?: ExistingReferenceRules<T>; onProgress?: (done: number, total: number) => void } = {},
) {
  const items: PreparedReference[] = [];
  const errors: string[] = [];
  let skipped = 0;
  let batchBytes = 0;
  let processed = 0;
  // A name guard cannot see one art saved under two names, and each copy would be a paid analysis.
  const imageOwners = new Map(options.existing?.imageOwners ?? []);
  for (const file of files) {
    const name = file.name.replace(/\.[^.]+$/, '').trim();
    const key = name.toLocaleLowerCase();
    try {
      validateImageFile(file);
      batchBytes += file.size;
      if (batchBytes > MAX_BATCH_BYTES) throw new Error(`${file.name}: limite de 2 GiB por lote.`);
      if (!name || reserved.has(key)) throw new Error(`${file.name}: nome repetido na fila ou no lote.`);
      const record = options.existing?.byName.get(key);
      // Re-selecting the folder resumes the run: finished arts cost nothing again.
      if (record && options.existing?.isCurrent(record)) {
        skipped++;
      } else {
        reserved.add(key);
        try {
          const base64 = await compress(file);
          const fingerprint = fingerprintImage(base64);
          const sameImage = imageOwners.get(fingerprint);
          if (sameImage && sameImage.toLocaleLowerCase() !== key) throw new Error(`${file.name}: imagem idêntica a "${sameImage}".`);
          imageOwners.set(fingerprint, name);
          items.push(record
            ? { id: record.id, name, base64, status: 'pending', operationType: 'upgrade' }
            : { id: crypto.randomUUID(), name, base64, status: 'pending' });
        } catch (error) { reserved.delete(key); throw error; }
      }
    } catch (error) { errors.push(error instanceof Error ? error.message : `${file.name}: preparação falhou.`); }
    options.onProgress?.(++processed, files.length);
  }
  return { items, errors, skipped };
}

export function imageExtension(dataUrl: string) {
  const mime = /^data:([^;,]+)/i.exec(dataUrl)?.[1].toLowerCase();
  return mime === 'image/jpeg' ? 'jpg' : mime === 'image/webp' ? 'webp' : 'png';
}

/** Reads pixel dimensions from the JPEG or PNG header, without decoding the image. */
export function getDataUrlImageSize(dataUrl: string | undefined): { width: number; height: number } | null {
  const match = /^data:image\/(jpeg|png);base64,/.exec(dataUrl ?? '');
  if (!match) return null;
  let bytes: string;
  // A multiple of 4 base64 characters always decodes, even when cut mid-image.
  try { bytes = atob(dataUrl!.slice(match[0].length, match[0].length + 87380)); }
  catch { return null; }
  const byte = (index: number) => bytes.charCodeAt(index);
  const u16 = (index: number) => (byte(index) << 8) | byte(index + 1);
  if (match[1] === 'png') {
    if (bytes.length < 24) return null;
    return { width: (u16(16) << 16) | u16(18), height: (u16(20) << 16) | u16(22) };
  }
  let offset = 2;
  while (offset + 9 < bytes.length) {
    if (byte(offset) !== 0xff) { offset++; continue; }
    const marker = byte(offset + 1);
    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
      return { width: u16(offset + 7), height: u16(offset + 5) };
    }
    offset += 2 + u16(offset + 2);
  }
  return null;
}

// Cloud copies are at most 180 px. A logged-in device receives them in place of the
// image the art was analyzed from, and reanalyzing one would describe a blurry copy.
const THUMBNAIL_MAX_SIDE = 200;
const THUMBNAIL_MAX_DATA_URL = 200_000;

export function isThumbnailImage(dataUrl: string | undefined): boolean {
  if (!dataUrl || dataUrl.length > THUMBNAIL_MAX_DATA_URL) return false;
  const size = getDataUrlImageSize(dataUrl);
  return !!size && Math.max(size.width, size.height) <= THUMBNAIL_MAX_SIDE;
}
