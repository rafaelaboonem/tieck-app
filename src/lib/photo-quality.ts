export type LocalPhotoQualityResult =
  | { ok: true; width?: number; height?: number }
  | {
      ok: false;
      reason: "resolution_too_low" | "too_dark" | "overexposed";
      width?: number;
      height?: number;
    };

/**
 * Verificação local e barata antes do upload.
 *
 * Esta checagem só bloqueia problemas extremos e objetivos. Ela não tenta
 * decidir se a foto atende ao checklist; essa decisão continua no servidor.
 * Quando o navegador não consegue decodificar o arquivo, o fluxo prossegue e
 * a validação binária da Edge Function assume a responsabilidade.
 */
export async function checkLocalPhotoQuality(
  file: File,
  options: { minWidth?: number | null; minHeight?: number | null } = {},
): Promise<LocalPhotoQualityResult> {
  if (typeof createImageBitmap !== "function") return { ok: true };

  let bitmap: ImageBitmap | null = null;
  try {
    bitmap = await createImageBitmap(file);
    const width = bitmap.width;
    const height = bitmap.height;
    const minWidth = Math.max(1, Number(options.minWidth ?? 640));
    const minHeight = Math.max(1, Number(options.minHeight ?? 480));
    if (width < minWidth || height < minHeight) {
      return { ok: false, reason: "resolution_too_low", width, height };
    }

    const sampleWidth = 96;
    const sampleHeight = Math.max(1, Math.round((height / width) * sampleWidth));
    const canvas = document.createElement("canvas");
    canvas.width = sampleWidth;
    canvas.height = sampleHeight;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) return { ok: true, width, height };

    context.drawImage(bitmap, 0, 0, sampleWidth, sampleHeight);
    const pixels = context.getImageData(0, 0, sampleWidth, sampleHeight).data;
    let luminanceTotal = 0;
    let darkPixels = 0;
    let brightPixels = 0;
    const pixelCount = pixels.length / 4;

    for (let index = 0; index < pixels.length; index += 4) {
      const luminance =
        pixels[index] * 0.2126 +
        pixels[index + 1] * 0.7152 +
        pixels[index + 2] * 0.0722;
      luminanceTotal += luminance;
      if (luminance < 18) darkPixels++;
      if (luminance > 248) brightPixels++;
    }

    const average = luminanceTotal / pixelCount;
    if (average < 22 && darkPixels / pixelCount > 0.82) {
      return { ok: false, reason: "too_dark", width, height };
    }
    if (average > 247 && brightPixels / pixelCount > 0.9) {
      return { ok: false, reason: "overexposed", width, height };
    }

    return { ok: true, width, height };
  } catch {
    return { ok: true };
  } finally {
    bitmap?.close();
  }
}
