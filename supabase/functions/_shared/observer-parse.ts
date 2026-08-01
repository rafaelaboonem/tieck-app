// Parser das respostas do observador visual.
// Regra: JSON estruturado tem prioridade absoluta e valores booleanos são
// respeitados literalmente (true/false). O fallback textual só é usado quando
// a resposta NÃO é um JSON válido. Campo ausente/indefinido = desconhecido.

// deno-lint-ignore-file no-explicit-any

export function parseJsonLoose(text: string): any | null {
  const first = text.indexOf("{");
  const last = text.lastIndexOf("}");
  if (first === -1 || last <= first) return null;
  try {
    const parsed = JSON.parse(text.slice(first, last + 1));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export interface ObserverFlags {
  structured: boolean;
  blurry: boolean;
  dark: boolean;
  overexposed: boolean;
  cropped: boolean;
  targetVisible: boolean;
  targetVisibleKnown: boolean;
}

const BLURRY_RE = /blurry|out of focus|unfocused|motion blur/;
const DARK_RE = /too dark|very dark|poorly lit|low light|underexposed/;
const BRIGHT_RE = /overexposed|blown out|too bright/;
const CROPPED_RE = /cut off|cropped|partially visible|only part/;
const ABSENT_RE =
  /\bnot (present|visible|shown|there)\b|\bno (visible|sign of)\b|cannot see|isn'?t visible|does not (show|contain)|n(a|ã)o (est(a|á)|h(a|á))/;

/** Lê um booleano a partir de aliases. Retorna null quando ausente/indefinido. */
function boolField(obj: any, keys: string[], truthyRe?: RegExp): boolean | null {
  if (!obj || typeof obj !== "object") return null;
  for (const k of keys) {
    if (!(k in obj)) continue;
    const v = obj[k];
    if (typeof v === "boolean") return v;
    if (typeof v === "number") return Number.isFinite(v) ? v !== 0 : null;
    if (typeof v === "string") {
      const s = v.trim().toLowerCase();
      if (["true", "yes", "sim"].includes(s)) return true;
      if (["false", "no", "não", "nao", "none"].includes(s)) return false;
      if (["", "unknown", "n/a", "null"].includes(s)) return null;
      return truthyRe ? truthyRe.test(s) : null;
    }
    return null; // null / objeto / array => desconhecido
  }
  return null;
}

export function parseObserver(text: string, target: string): ObserverFlags {
  const obj = parseJsonLoose(text);
  const lower = text.toLowerCase();
  const fromText = (re: RegExp) => (obj ? false : re.test(lower));
  const lighting = typeof obj?.lighting === "string" ? obj.lighting.toLowerCase() : null;

  const blurry = boolField(obj, ["photo_blurry", "is_blurry", "blurry", "blur", "image_blurry"], BLURRY_RE)
    ?? fromText(BLURRY_RE);

  const darkField = boolField(obj, ["too_dark", "is_dark", "dark", "photo_dark"], DARK_RE);
  const dark = darkField ?? (lighting ? /dark|underexposed|low/.test(lighting) : fromText(DARK_RE));

  const overField = boolField(obj, ["overexposed", "is_overexposed", "too_bright"], BRIGHT_RE);
  const overexposed = overField ?? (lighting ? /overexposed|too bright/.test(lighting) : fromText(BRIGHT_RE));

  const cropped = boolField(obj, ["cropped", "is_cropped", "cut_off", "partially_visible"], CROPPED_RE)
    ?? fromText(CROPPED_RE);

  const presentField = boolField(obj, [
    "object_present", "target_present", "present", "target_visible", "visible", "object_visible",
  ]);
  const targetVisible = presentField !== null
    ? presentField
    : (target ? !ABSENT_RE.test(lower) : !/not visible|cannot see/.test(lower));

  return {
    structured: !!obj,
    blurry,
    dark,
    overexposed,
    cropped,
    targetVisible,
    targetVisibleKnown: presentField !== null,
  };
}
