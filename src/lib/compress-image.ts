// Compress large images (esp. iPhone HEIC photos) via canvas → JPEG.
// Returns null on unsupported formats (caller falls back to original file).
export async function compressImage(file: File, maxDim = 1920, quality = 0.82): Promise<File | null> {
  return new Promise((resolve) => {
    try {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        try {
          let { width, height } = img;
          const scale = Math.min(1, maxDim / Math.max(width, height));
          width = Math.round(width * scale);
          height = Math.round(height * scale);
          const canvas = document.createElement("canvas");
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext("2d");
          if (!ctx) { URL.revokeObjectURL(url); return resolve(null); }
          ctx.drawImage(img, 0, 0, width, height);
          canvas.toBlob(
            (blob) => {
              URL.revokeObjectURL(url);
              if (!blob) return resolve(null);
              const baseName = file.name.replace(/\.[^.]+$/, "") || "image";
              resolve(new File([blob], `${baseName}.jpg`, { type: "image/jpeg" }));
            },
            "image/jpeg",
            quality,
          );
        } catch {
          URL.revokeObjectURL(url);
          resolve(null);
        }
      };
      img.onerror = () => { URL.revokeObjectURL(url); resolve(null); };
      img.src = url;
    } catch {
      resolve(null);
    }
  });
}
