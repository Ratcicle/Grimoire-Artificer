import { validateImageFile } from "./imagePreparation";
export const compressImage = (file: File, maxWidth = 512, maxHeight = 512, quality = 0.8): Promise<string> => {
  return new Promise((resolve, reject) => {
    try { validateImageFile(file); } catch (error) { reject(error); return; }
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        try {
          if (!img.width || !img.height || img.width * img.height > 40_000_000) { reject(new Error("Imagem vazia ou maior que 40 megapixels.")); return; }
          let width = img.width;
          let height = img.height;

          if (width > maxWidth || height > maxHeight) {
            const ratio = Math.min(maxWidth / width, maxHeight / height);
            width = width * ratio;
            height = height * ratio;
          }

          const canvas = document.createElement("canvas");
          canvas.width = Math.max(1, Math.round(width));
          canvas.height = Math.max(1, Math.round(height));
          const ctx = canvas.getContext("2d");

          if (ctx) {
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            resolve(canvas.toDataURL("image/jpeg", quality));
          } else {
            reject(new Error("Canvas context not available"));
          }
        } catch (error) { reject(error); }
      };
      img.onerror = (err) => reject(err);
      img.src = event.target?.result as string;
    };
    reader.onerror = (err) => reject(err);
  });
};

export interface ThumbnailResult {
  success: boolean;
  thumbnail?: string;
  error?: string;
}

export const createThumbnail = (base64Str: string, maxWidth = 180, maxHeight = 180, quality = 0.6): Promise<ThumbnailResult> => {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      try {
        let width = img.width;
        let height = img.height;

        if (width > maxWidth || height > maxHeight) {
          const ratio = Math.min(maxWidth / width, maxHeight / height);
          width = width * ratio;
          height = height * ratio;
        }

        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(width));
        canvas.height = Math.max(1, Math.round(height));
        const ctx = canvas.getContext("2d");

        if (ctx) {
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          resolve({ success: true, thumbnail: canvas.toDataURL("image/jpeg", quality) });
        } else {
          resolve({ success: false, error: "Canvas context not available" });
        }
      } catch (error) { resolve({success:false,error:error instanceof Error ? error.message : 'Thumbnail preparation failed'}); }
    };
    img.onerror = () => {
      resolve({ success: false, error: "Image loading failed" });
    };
    img.src = base64Str;
  });
};
