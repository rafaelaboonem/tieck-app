// Validação binária real: assinatura, formato, dimensões.
// Não confia em fileName/mimeType/extensão declarados pelo cliente.

export type ImageKind = "jpeg" | "png" | "webp";

export interface ImageInfo {
  kind: ImageKind;
  mime: "image/jpeg" | "image/png" | "image/webp";
  width: number;
  height: number;
  bytes: number;
}

export type ImageValidationError =
  | "empty"
  | "too_large"
  | "unsupported_format"
  | "malformed_image"
  | "invalid_dimensions"
  | "below_min_resolution";

export interface ValidateOptions {
  maxBytes: number;
  minWidth?: number | null;
  minHeight?: number | null;
}

export function validateImage(
  buf: Uint8Array,
  opts: ValidateOptions,
): { ok: true; info: ImageInfo } | { ok: false; error: ImageValidationError } {
  if (!buf.length) return { ok: false, error: "empty" };
  if (buf.length > opts.maxBytes) return { ok: false, error: "too_large" };

  const kind = detectKind(buf);
  if (!kind) return { ok: false, error: "unsupported_format" };

  const dims = kind === "png"
    ? readPngDims(buf)
    : kind === "jpeg"
      ? readJpegDims(buf)
      : readWebpDims(buf);

  if (!dims) return { ok: false, error: "malformed_image" };
  if (dims.w <= 0 || dims.h <= 0) return { ok: false, error: "invalid_dimensions" };

  if (opts.minWidth && dims.w < opts.minWidth) return { ok: false, error: "below_min_resolution" };
  if (opts.minHeight && dims.h < opts.minHeight) return { ok: false, error: "below_min_resolution" };

  return {
    ok: true,
    info: {
      kind,
      mime: kind === "jpeg" ? "image/jpeg" : kind === "png" ? "image/png" : "image/webp",
      width: dims.w,
      height: dims.h,
      bytes: buf.length,
    },
  };
}

function detectKind(b: Uint8Array): ImageKind | null {
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "jpeg";
  if (
    b.length >= 8 &&
    b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 &&
    b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a
  ) return "png";
  if (
    b.length >= 12 &&
    b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 &&
    b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50
  ) return "webp";
  return null;
}

function readPngDims(b: Uint8Array): { w: number; h: number } | null {
  // IHDR: 8 (signature) + 4 (len) + 4 (type "IHDR") = data starts at offset 16
  if (b.length < 24) return null;
  if (b[12] !== 0x49 || b[13] !== 0x48 || b[14] !== 0x44 || b[15] !== 0x52) return null;
  const w = (b[16] << 24) | (b[17] << 16) | (b[18] << 8) | b[19];
  const h = (b[20] << 24) | (b[21] << 16) | (b[22] << 8) | b[23];
  return { w: w >>> 0, h: h >>> 0 };
}

function readJpegDims(b: Uint8Array): { w: number; h: number } | null {
  let i = 2;
  while (i + 8 < b.length) {
    if (b[i] !== 0xff) return null;
    let marker = b[i + 1];
    // skip padding 0xFF bytes
    while (marker === 0xff && i + 1 < b.length) {
      i++;
      marker = b[i + 1];
    }
    // Standalone markers (no length): 0x01, 0xD0-0xD9
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      i += 2;
      continue;
    }
    if (i + 3 >= b.length) return null;
    const segLen = (b[i + 2] << 8) | b[i + 3];
    // SOF markers: C0-CF, exceto C4 (DHT), C8 (JPG), CC (DAC)
    const isSof =
      marker >= 0xc0 && marker <= 0xcf &&
      marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
    if (isSof) {
      if (i + 9 >= b.length) return null;
      const h = (b[i + 5] << 8) | b[i + 6];
      const w = (b[i + 7] << 8) | b[i + 8];
      return { w, h };
    }
    i += 2 + segLen;
  }
  return null;
}

function readWebpDims(b: Uint8Array): { w: number; h: number } | null {
  // 12..15 = fourCC do primeiro chunk: "VP8 ", "VP8L", "VP8X"
  const fourcc = String.fromCharCode(b[12], b[13], b[14], b[15]);
  if (fourcc === "VP8 ") {
    // Simple lossy: procurar start code 9D 01 2A
    for (let i = 20; i < Math.min(b.length - 6, 40); i++) {
      if (b[i] === 0x9d && b[i + 1] === 0x01 && b[i + 2] === 0x2a) {
        const w = ((b[i + 4] << 8) | b[i + 3]) & 0x3fff;
        const h = ((b[i + 6] << 8) | b[i + 5]) & 0x3fff;
        return { w, h };
      }
    }
    return null;
  }
  if (fourcc === "VP8L") {
    // offset 20 = 0x2f signature; 21..24 = 32 bits packed
    if (b.length < 25 || b[20] !== 0x2f) return null;
    const b0 = b[21], b1 = b[22], b2 = b[23], b3 = b[24];
    const w = (((b1 & 0x3f) << 8) | b0) + 1;
    const h = (((b3 & 0x0f) << 10) | (b2 << 2) | ((b1 & 0xc0) >> 6)) + 1;
    return { w, h };
  }
  if (fourcc === "VP8X") {
    // canvas dims em 24, 25, 26 (width-1 LE24) e 27, 28, 29 (height-1 LE24)
    if (b.length < 30) return null;
    const w = 1 + (b[24] | (b[25] << 8) | (b[26] << 16));
    const h = 1 + (b[27] | (b[28] << 8) | (b[29] << 16));
    return { w, h };
  }
  return null;
}