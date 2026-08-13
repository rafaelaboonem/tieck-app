import { z } from 'zod';

export interface ImageValidationResult {
  valid: boolean;
  code?: string;
  message?: string;
  mimeType?: string;
}

const MAX_SIZE_BYTES = 3 * 1024 * 1024; // 3MB

/**
 * Validates image using declared MIME and magic bytes.
 */
export async function validateImageBuffer(buffer: ArrayBuffer, declaredMime: string): Promise<ImageValidationResult> {
  if (buffer.byteLength === 0) {
    return { valid: false, code: 'empty_file', message: 'O arquivo está vazio.' };
  }

  if (buffer.byteLength > MAX_SIZE_BYTES) {
    return { valid: false, code: 'file_too_large', message: 'A imagem deve ter no máximo 3MB.' };
  }

  const uint8 = new Uint8Array(buffer.slice(0, 4));
  let detectedMime = '';

  // Magic bytes check
  if (uint8[0] === 0xff && uint8[1] === 0xd8 && uint8[2] === 0xff) {
    detectedMime = 'image/jpeg';
  } else if (uint8[0] === 0x89 && uint8[1] === 0x50 && uint8[2] === 0x4e && uint8[3] === 0x47) {
    detectedMime = 'image/png';
  } else if (uint8[0] === 0x52 && uint8[1] === 0x49 && uint8[2] === 0x46 && uint8[3] === 0x46) {
    // RIFF header for WebP
    const webpHeader = new Uint8Array(buffer.slice(8, 12));
    if (webpHeader[0] === 0x57 && webpHeader[1] === 0x45 && webpHeader[2] === 0x42 && webpHeader[3] === 0x50) {
      detectedMime = 'image/webp';
    }
  }

  if (!detectedMime) {
    return { valid: false, code: 'invalid_format', message: 'Formato de imagem não reconhecido.' };
  }

  const allowedMimes = ['image/jpeg', 'image/png', 'image/webp'];
  if (!allowedMimes.includes(detectedMime)) {
    return { valid: false, code: 'unsupported_format', message: 'Formato não suportado. Use JPEG, PNG ou WebP.' };
  }

  // Check mismatch between declared and detected (security)
  if (declaredMime !== detectedMime) {
    return { valid: false, code: 'mime_mismatch', message: 'Extensão do arquivo não condiz com o conteúdo.' };
  }

  return { valid: true, mimeType: detectedMime };
}
