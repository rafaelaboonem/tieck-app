// Laboratório privado de padrões visuais (Camera AI V3 — Fase 2, prévia).
// Regras:
//   * verify_jwt = true — nunca aceita responseToken público.
//   * Autorização por workspace (owner) verificada com o JWT do chamador.
//   * Imagens candidatas e frames de câmera ficam SOMENTE em memória: não vão
//     para Storage, não vão para o banco, não entram em logs nem em analytics.
//   * Logs apenas com códigos sanitizados, modelo, duração e status.

// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const MAX_BYTES = 8 * 1024 * 1024;
const MIN_DIM = 64;
const MAX_DIM = 8000;
const CALL_TIMEOUT_MS = 45_000;
const LIVE_TIMEOUT_MS = 12_000;
const PROFILE_VERSION = 1;

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS },
  });
}
const err = (status: number, code: string) => json(status, { error: code });

function fastModel(): string {
  return String(Deno.env.get("CLOUDFLARE_AI_MODEL") ?? "").trim() ||
    "@cf/moondream/moondream3.1-9B-A2B";
}
function finalModel(): string {
  return String(Deno.env.get("CLOUDFLARE_FINAL_VISION_MODEL") ?? "").trim() ||
    "@cf/meta/llama-4-scout-17b-16e-instruct";
}

// ---------------- validação binária ----------------
type Decoded = { bytes: Uint8Array; mime: string; width: number; height: number };

function b64ToBytes(b64: string): Uint8Array {
  const clean = b64.includes(",") ? b64.slice(b64.indexOf(",") + 1) : b64;
  const bin = atob(clean);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function sniff(bytes: Uint8Array): { mime: string; width: number; height: number } | null {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes.length > 24 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
    return { mime: "image/png", width: dv.getUint32(16), height: dv.getUint32(20) };
  }
  if (bytes.length > 4 && bytes[0] === 0xff && bytes[1] === 0xd8) {
    let off = 2;
    while (off + 9 < bytes.length) {
      if (bytes[off] !== 0xff) { off++; continue; }
      const marker = bytes[off + 1];
      const len = dv.getUint16(off + 2);
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        return { mime: "image/jpeg", height: dv.getUint16(off + 5), width: dv.getUint16(off + 7) };
      }
      off += 2 + len;
    }
    return { mime: "image/jpeg", width: MIN_DIM, height: MIN_DIM };
  }
  if (bytes.length > 30 && String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" &&
      String.fromCharCode(...bytes.slice(8, 12)) === "WEBP") {
    return { mime: "image/webp", width: MIN_DIM, height: MIN_DIM };
  }
  return null;
}

function decodeImage(b64: unknown, minDim = 128): Decoded | null {
  if (typeof b64 !== "string" || b64.length < 32) return null;
  let bytes: Uint8Array;
  try { bytes = b64ToBytes(b64); } catch { return null; }
  if (bytes.length > MAX_BYTES) return null;
  const meta = sniff(bytes);
  if (!meta) return null;
  if (meta.width < minDim || meta.height < minDim) return null;
  if (meta.width > MAX_DIM || meta.height > MAX_DIM) return null;
  return { bytes, ...meta };
}

function toDataUrl(img: Decoded): string {
  let s = "";
  const chunk = 0x8000;
  for (let i = 0; i < img.bytes.length; i += chunk) {
    s += String.fromCharCode(...img.bytes.subarray(i, i + chunk));
  }
  return `data:${img.mime};base64,${btoa(s)}`;
}

const PING_IMAGE =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

// ---------------- consumo (tokens → neurônios) ----------------
// Tabela pública do Workers AI (neurônios por milhão de tokens).
const NEURON_RATES: Record<string, { input: number; output: number }> = {
  "@cf/moondream/moondream3.1-9B-A2B": { input: 27273, output: 90909 },
  "@cf/meta/llama-4-scout-17b-16e-instruct": { input: 24545, output: 77273 },
};
const NEURON_FALLBACK = { input: 27273, output: 90909 };
const USD_PER_1K_NEURONS = 0.011;

export type UsageEntry = {
  step: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  neurons: number;
  inferenceMs: number;
};

function usageTokens(payload: any): { input: number; output: number } {
  const u = payload?.result?.usage ?? payload?.usage ?? null;
  const n = (...keys: string[]) => {
    for (const k of keys) {
      const v = u?.[k];
      if (typeof v === "number" && Number.isFinite(v) && v >= 0) return Math.round(v);
    }
    return 0;
  };
  return { input: n("prompt_tokens", "input_tokens"), output: n("completion_tokens", "output_tokens") };
}

function meterPush(meter: UsageEntry[], step: string, model: string, payload: any, ms: number) {
  const { input, output } = usageTokens(payload);
  const rate = NEURON_RATES[model] ?? NEURON_FALLBACK;
  const neurons = (input / 1_000_000) * rate.input + (output / 1_000_000) * rate.output;
  meter.push({
    step,
    model,
    inputTokens: input,
    outputTokens: output,
    neurons: Math.round(neurons * 1000) / 1000,
    inferenceMs: ms,
  });
}

/** Chamada ao provedor com medição de consumo sempre registrada. */
async function cfMetered(
  meter: UsageEntry[],
  step: string,
  model: string,
  body: unknown,
  timeoutMs = CALL_TIMEOUT_MS,
): Promise<any> {
  const started = Date.now();
  try {
    const payload = await cfRun(model, body, timeoutMs);
    meterPush(meter, step, model, payload, Date.now() - started);
    return payload;
  } catch (e) {
    meter.push({ step: `${step}_failed`, model, inputTokens: 0, outputTokens: 0, neurons: 0, inferenceMs: Date.now() - started });
    throw e;
  }
}

function meterTotals(meter: UsageEntry[]) {
  const inputTokens = meter.reduce((a, m) => a + m.inputTokens, 0);
  const outputTokens = meter.reduce((a, m) => a + m.outputTokens, 0);
  const neurons = Math.round(meter.reduce((a, m) => a + m.neurons, 0) * 1000) / 1000;
  return {
    calls: meter.filter((m) => !m.step.endsWith("_failed")).length,
    inputTokens,
    outputTokens,
    neurons,
    estimatedUsd: Math.round((neurons / 1000) * USD_PER_1K_NEURONS * 1e6) / 1e6,
    steps: meter,
  };
}


// ---------------- Cloudflare ----------------
async function cfRun(model: string, body: unknown, timeoutMs = CALL_TIMEOUT_MS): Promise<any> {
  const accountId = String(Deno.env.get("CLOUDFLARE_ACCOUNT_ID") ?? "").trim();
  const apiToken = String(Deno.env.get("CLOUDFLARE_API_TOKEN") ?? "").trim();
  if (!accountId || !apiToken) throw new Error("cloudflare_credentials_missing");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(accountId)}/ai/run/${model}`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${apiToken}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: controller.signal,
      },
    );
    if (!res.ok) throw new Error(`cloudflare_http_${res.status}`);
    const payload = await res.json();
    if (!payload || payload.success === false) throw new Error("cloudflare_invalid_response");
    return payload;
  } finally {
    clearTimeout(timer);
  }
}

function extractModelText(payload: any): string {
  const candidates: unknown[] = [];
  const push = (node: any) => {
    if (!node) return;
    if (typeof node === "string") { candidates.push(node); return; }
    if (typeof node !== "object") return;
    for (const key of ["answer", "caption", "response", "text", "output_text", "description", "result"]) {
      const value = node[key];
      if (typeof value === "string") candidates.push(value);
      else if (value && typeof value === "object") push(value);
    }
    if (Array.isArray(node.choices)) {
      for (const c of node.choices) push(c?.message ?? c);
    }
    if (typeof node.content === "string") candidates.push(node.content);
  };
  push(payload?.result);
  push(payload);
  for (const c of candidates) if (typeof c === "string" && c.trim()) return c;
  return "";
}

function parseJsonLoose(text: string): any | null {
  const first = text.indexOf("{");
  const last = text.lastIndexOf("}");
  if (first === -1 || last <= first) return null;
  try { return JSON.parse(text.slice(first, last + 1)); } catch { return null; }
}

// ---------------- sanitização ----------------
const LEAK_PATTERNS = [
  /prompt/i, /json/i, /schema/i, /system/i, /instru(c|ç)(a|ã)o interna/i,
  /moondream/i, /llama/i, /cloudflare/i, /model/i, /token/i,
];
function sanitizeMessage(raw: unknown, fallback: string): string {
  const s = typeof raw === "string" ? raw.trim() : "";
  if (!s || s.length > 160) return fallback;
  if (LEAK_PATTERNS.some((p) => p.test(s))) return fallback;
  return s;
}

function strList(value: unknown, max = 6): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((v) => typeof v === "string")
    .map((v) => (v as string).trim().slice(0, 120))
    .filter(Boolean)
    .slice(0, max);
}

// ---------------- perfil interno do padrão ----------------
const PROFILE_SCHEMA = {
  type: "object",
  properties: {
    target_phrase: { type: "string" },
    target_phrase_en: { type: "string" },
    requested_condition: { type: "string" },
    observable_signals: { type: "array", items: { type: "string" } },
    contrary_signals: { type: "array", items: { type: "string" } },
    insufficient_view_signals: { type: "array", items: { type: "string" } },
    ambiguous: { type: "boolean" },
  },
  required: ["target_phrase", "target_phrase_en", "requested_condition", "observable_signals", "ambiguous"],
};

/** Reduz o alvo em inglês a uma expressão curta que um detector entende. */
function detectorPhrase(raw: unknown): string {
  let s = String(raw ?? "").toLowerCase();
  s = s.replace(/\([^)]*\)?/g, " ");           // remove parênteses e alternativas
  s = s.split(/\bor\b|\band\b|,|\/|;/)[0];      // fica só na primeira alternativa
  s = s.replace(/\bwith\b.*$/, " ");            // corta complementos ("with lid")
  s = s.replace(/[^a-z\s-]/g, " ").replace(/\s+/g, " ").trim();
  return s.split(" ").slice(0, 3).join(" ").slice(0, 40);
}


async function buildProfile(question: string, referenceSummary: string | null, meter: UsageEntry[]) {
  const prompt =
    `An inspection standard was written by a facility owner in Brazilian Portuguese:\n"${question}"\n\n` +
    `Extract, WITHOUT inventing requirements that are not implied by the sentence:\n` +
    `- target_phrase: the main object or place to be photographed (Portuguese, short).\n` +
    `- target_phrase_en: same target in plain English, 1-3 words, suitable for an object detector.\n` +
    `- requested_condition: the condition that must be true about it.\n` +
    `- observable_signals: things a person could visually confirm to prove the condition.\n` +
    `- contrary_signals: visible things that would prove the condition is NOT met.\n` +
    `- insufficient_view_signals: situations where the photo would not be enough to decide.\n` +
    `- ambiguous: true if the sentence does not clearly define an object AND a verifiable condition.\n` +
    `Reply with a single JSON object and nothing else.` +
    (referenceSummary ? `\nStructural summary of a reference photo of the expected result: ${referenceSummary}` : "");

  let parsed: any = null;
  for (const withSchema of [true, false]) {
    try {
      const payload = await cfMetered(meter, "profile", finalModel(), {
        messages: [{ role: "user", content: prompt }],
        ...(withSchema ? { response_format: { type: "json_schema", json_schema: PROFILE_SCHEMA } } : {}),
        max_tokens: 600,
      });
      const text = extractModelText(payload);
      parsed = parseJsonLoose(text);
      if (parsed) break;
      console.error(`[lab] profile_no_json schema=${withSchema} len=${text.length}`);
    } catch (e) {
      console.error(`[lab] profile_call_failed schema=${withSchema} code=${String((e as Error).message).slice(0, 60)}`);
    }
  }
  if (!parsed) throw new Error("profile_parse_failed");

  const target = String(parsed.target_phrase ?? "").trim().slice(0, 80);
  const condition = String(parsed.requested_condition ?? "").trim().slice(0, 160);
  const ambiguous = parsed.ambiguous === true || !target || !condition;
  return {
    profile: {
      target_phrase: target,
      target_phrase_en: detectorPhrase(parsed.target_phrase_en),
      requested_condition: condition,
      observable_signals: strList(parsed.observable_signals),
      contrary_signals: strList(parsed.contrary_signals),
      insufficient_view_signals: strList(parsed.insufficient_view_signals),
      reference_summary: referenceSummary,
      version: PROFILE_VERSION,
      generated_at: new Date().toISOString(),
    },
    ambiguous,
  };
}

async function describeReference(reference: Decoded, question: string, meter: UsageEntry[]): Promise<string | null> {
  try {
    const payload = await cfMetered(meter, "reference_summary", fastModel(), {
      image: toDataUrl(reference),
      task: "query",
      stream: false,
      question:
        `Describe only what is visible in this reference photo: main object or place, its state, ` +
        `organisation and relevant elements. Context: ${question}`,
      max_tokens: 200,
    });
    const text = extractModelText(payload).trim();
    return text ? text.slice(0, 400) : null;
  } catch {
    return null;
  }
}

// ---------------- localização visual (detect / point / query) ----------------
type Box = { x: number; y: number; w: number; h: number };

function normBox(raw: any): Box | null {
  if (!raw || typeof raw !== "object") return null;
  const num = (...keys: string[]) => {
    for (const k of keys) {
      const v = raw[k];
      if (typeof v === "number" && Number.isFinite(v)) return v;
    }
    return null;
  };
  let x0 = num("x_min", "xmin", "x1", "left", "x");
  let y0 = num("y_min", "ymin", "y1", "top", "y");
  let x1 = num("x_max", "xmax", "x2", "right");
  let y1 = num("y_max", "ymax", "y2", "bottom");
  const w = num("width", "w");
  const h = num("height", "h");
  if (x0 === null || y0 === null) return null;
  if (x1 === null && w !== null) x1 = x0 + w;
  if (y1 === null && h !== null) y1 = y0 + h;
  if (x1 === null || y1 === null) return null;
  // Normaliza escala 0-1 se vier em pixels ou 0-1000.
  const scale = Math.max(x1, y1) > 1.5 ? (Math.max(x1, y1) > 100 ? null : 100) : 1;
  if (scale === null) return null; // pixels: sem dimensões confiáveis, descarta
  const clamp = (v: number) => Math.min(1, Math.max(0, v / scale));
  const bx = clamp(Math.min(x0, x1));
  const by = clamp(Math.min(y0, y1));
  const bw = clamp(Math.max(x0, x1)) - bx;
  const bh = clamp(Math.max(y0, y1)) - by;
  if (bw <= 0.01 || bh <= 0.01) return null;
  return { x: bx, y: by, w: bw, h: bh };
}

function collectBoxes(payload: any): Box[] {
  const out: Box[] = [];
  const visit = (node: any, depth = 0) => {
    if (!node || depth > 5) return;
    if (Array.isArray(node)) { node.forEach((n) => visit(n, depth + 1)); return; }
    if (typeof node !== "object") return;
    const b = normBox(node);
    if (b) out.push(b);
    for (const v of Object.values(node)) visit(v, depth + 1);
  };
  visit(payload?.result ?? payload);
  return out;
}

function collectPoints(payload: any): { x: number; y: number }[] {
  const out: { x: number; y: number }[] = [];
  const visit = (node: any, depth = 0) => {
    if (!node || depth > 5) return;
    if (Array.isArray(node)) { node.forEach((n) => visit(n, depth + 1)); return; }
    if (typeof node !== "object") return;
    if (typeof node.x === "number" && typeof node.y === "number" && node.x <= 1.5 && node.y <= 1.5) {
      out.push({ x: Math.min(1, Math.max(0, node.x)), y: Math.min(1, Math.max(0, node.y)) });
    }
    for (const v of Object.values(node)) visit(v, depth + 1);
  };
  visit(payload?.result ?? payload);
  return out;
}

type LiveState = "searching" | "adjust" | "ready" | "uncertain";
type HintCode =
  | "searching"
  | "target_not_found"
  | "move_closer"
  | "show_full_object"
  | "center_object"
  | "ready"
  | "uncertain";

const HINTS: Record<HintCode, string> = {
  searching: "Procurando o objeto.",
  target_not_found: "Aponte a câmera para o item solicitado.",
  move_closer: "Aproxime um pouco.",
  show_full_object: "Mostre o item por completo.",
  center_object: "Centralize o item.",
  ready: "Enquadramento pronto.",
  uncertain: "Não foi possível orientar agora.",
};

/**
 * Localiza o alvo em um frame temporário. Nunca fabrica coordenadas: quando o
 * modelo não devolve caixa válida, `boxes` volta vazio.
 */
async function locateTarget(frame: Decoded, target: string, meter: UsageEntry[]) {
  const started = Date.now();
  const image = toDataUrl(frame);
  const done = (strategy: "detect" | "point" | "query", found: boolean, boxes: Box[]) => ({
    strategy,
    found,
    boxes,
    inferenceMs: Date.now() - started,
  });

  // 1) detect — única estratégia que produz caixa real
  try {
    const p = await cfMetered(meter, "live_detect", fastModel(), { image, task: "detect", object: target, stream: false }, LIVE_TIMEOUT_MS);
    const boxes = collectBoxes(p)
      .sort((a, b) => b.w * b.h - a.w * a.h)
      .slice(0, 3);
    if (boxes.length) return done("detect", true, boxes);
  } catch { /* segue para point */ }

  // 2) point — confirma presença, sem caixa
  try {
    const p = await cfMetered(meter, "live_point", fastModel(), { image, task: "point", object: target, stream: false }, LIVE_TIMEOUT_MS);
    if (collectPoints(p).length) return done("point", true, []);
  } catch { /* segue para query */ }


  // 3) query — apenas presença
  const p = await cfMetered(meter, "live_query", fastModel(), {
    image,
    task: "query",
    stream: false,
    question: `Is a ${target} clearly visible in this photo? Answer only "yes" or "no".`,
    max_tokens: 32,
  }, LIVE_TIMEOUT_MS);
  const text = extractModelText(p).toLowerCase();
  const yes = /\byes\b|\bsim\b|"?answer"?\s*:\s*"?yes/.test(text) && !/^\s*"?no\b/.test(text.trim());
  return done("query", yes, []);

}

/** Estado e orientação derivados apenas de sinais reais do modelo. */
function liveGuidance(found: boolean, boxes: Box[]): { state: LiveState; hintCode: HintCode } {
  if (!found) return { state: "searching", hintCode: "target_not_found" };
  const box = boxes[0];
  if (!box) return { state: "adjust", hintCode: "center_object" };
  const area = box.w * box.h;
  const touching = box.x <= 0.02 || box.y <= 0.02 || box.x + box.w >= 0.98 || box.y + box.h >= 0.98;
  const offCenter = Math.abs(box.x + box.w / 2 - 0.5) > 0.22 || Math.abs(box.y + box.h / 2 - 0.5) > 0.22;
  if (area < 0.06) return { state: "adjust", hintCode: "move_closer" };
  if (touching) return { state: "adjust", hintCode: "show_full_object" };
  if (offCenter) return { state: "adjust", hintCode: "center_object" };
  return { state: "ready", hintCode: "ready" };
}


// ---------------- etapa 1: Moondream (observador, evidência primeiro) ----------------
async function runObserver(image: Decoded, question: string, profile: any, meter: UsageEntry[]) {
  const started = Date.now();
  const target = String(profile?.target_phrase_en || profile?.target_phrase || "").trim();
  const askedTarget = target ? `The inspector asked for: "${target}".` : "";
  const payload = await cfMetered(meter, "observer", fastModel(), {
    image: toDataUrl(image),
    task: "query",
    reasoning: false,
    stream: false,
    temperature: 0.1,
    question:
      `Report only what you actually see, do not guess. ${askedTarget} ` +
      `1) Name the main object or place actually shown. ` +
      `2) State whether that requested object is present, and whether it is fully inside the frame or cut off. ` +
      `3) State the lighting (dark / normal / overexposed) and whether the photo is blurry. ` +
      `4) List any visible detail that contradicts this expectation: ${question}`,
    max_tokens: 220,
  });
  const text = extractModelText(payload).trim();
  if (!text) throw new Error("observer_empty_response");
  // O observador às vezes responde em JSON: nesse caso os campos valem mais que o texto.
  const obj = parseJsonLoose(text);
  const lower = text.toLowerCase();
  const flag = (keys: string[], re: RegExp): boolean => {
    if (obj) {
      for (const k of keys) {
        const v = obj[k];
        if (typeof v === "boolean") return v;
        if (typeof v === "string" && re.test(v.toLowerCase())) return true;
        if (typeof v === "string") return false;
      }
    }
    return re.test(lower);
  };
  const absentRe = /\bnot (present|visible|shown|there)\b|\bno (visible|sign of)\b|cannot see|isn'?t visible|does not (show|contain)|n(a|ã)o (est(a|á)|h(a|á))/;
  let targetVisible = target ? !absentRe.test(lower) : !/not visible|cannot see/.test(lower);
  if (obj) {
    for (const k of ["present", "target_present", "visible", "target_visible"]) {
      const v = obj[k];
      if (typeof v === "boolean") { targetVisible = v; break; }
    }
  }
  return {
    latencyMs: Date.now() - started,
    observation: text.slice(0, 500),
    blurry: flag(["blurry", "blur", "is_blurry"], /blurry|out of focus|unfocused|motion blur/),
    dark: flag(["dark", "too_dark"], /too dark|very dark|poorly lit|low light|underexposed/) ||
      (typeof obj?.lighting === "string" && /dark|underexposed|low/.test(obj.lighting.toLowerCase())),
    overexposed: flag(["overexposed"], /overexposed|blown out|too bright/) ||
      (typeof obj?.lighting === "string" && /overexposed|too bright/.test(obj.lighting.toLowerCase())),
    cropped: flag(["cropped", "cut_off"], /cut off|cropped|partially visible|only part/),
    targetVisible,
  };
}


// ---------------- etapa 2: Llama 4 Scout (juiz) ----------------
const DECISION_SCHEMA = {
  type: "object",
  properties: {
    visible_description: { type: "string" },
    target_found: { type: "boolean" },
    target_visible: { type: "boolean" },
    framing_sufficient: { type: "boolean" },
    lighting_sufficient: { type: "boolean" },
    sharpness_sufficient: { type: "boolean" },
    quality_sufficient: { type: "boolean" },
    condition_met: { type: "boolean" },
    condition_status: { type: "string", enum: ["verified", "not_met", "not_observable"] },
    supporting_evidence: { type: "array", items: { type: "string" } },
    contrary_evidence: { type: "array", items: { type: "string" } },
    same_place_as_reference: { type: "boolean" },
    same_condition_as_reference: { type: "boolean" },
    decision: { type: "string", enum: ["approved", "retake", "uncertain"] },
    reason_code: {
      type: "string",
      enum: [
        "condition_met",
        "condition_not_met",
        "not_observable",
        "target_not_found",
        "wrong_object",
        "wrong_place",
        "target_not_visible",
        "too_dark",
        "blurry",
        "bad_framing",
        "insufficient_evidence",
      ],
    },
    public_message: { type: "string" },
    confidence: { type: "number" },
  },
  required: [
    "visible_description", "target_found", "target_visible", "framing_sufficient",
    "lighting_sufficient", "sharpness_sufficient", "quality_sufficient", "condition_met",
    "condition_status", "decision", "reason_code", "public_message", "confidence",
  ],
};

async function runJudge(args: {
  image: Decoded;
  question: string;
  facts: string;
  profile: any;
  referenceDescription?: string | null;
  multiImage?: { reference: Decoded } | null;
  meter: UsageEntry[];
}) {
  const started = Date.now();
  const p = args.profile ?? {};
  const instructions =
    `You are a strict visual inspector. Work in this order and never skip a step:\n` +
    `1. Describe only what is visible in the candidate photo.\n` +
    `2. Look for the requested target: "${p.target_phrase ?? args.question}".\n` +
    `3. Judge whether enough of it is visible to decide.\n` +
    `4. List supporting evidence and contrary evidence.\n` +
    `5. Only then decide.\n\n` +
    `Requested condition: ${p.requested_condition ?? args.question}\n` +
    (p.observable_signals?.length ? `Signals that would prove it: ${p.observable_signals.join("; ")}\n` : "") +
    (p.contrary_signals?.length ? `Signals that would disprove it: ${p.contrary_signals.join("; ")}\n` : "") +
    (p.insufficient_view_signals?.length ? `Situations where the photo is not enough: ${p.insufficient_view_signals.join("; ")}\n` : "") +
    `Original standard (Portuguese): ${args.question}\n` +
    `Fast-observer notes about the candidate photo: ${args.facts}\n` +
    (args.referenceDescription ? `Description of a reference photo of the expected result: ${args.referenceDescription}\n` : "") +
    (args.multiImage ? `The FIRST image is the reference of the expected result; the SECOND image is the candidate. Compare condition, organisation and relevant elements. Angle, colour balance and lighting do NOT need to match. Distinguish "same kind of place" from "same condition".\n` : "") +
    `condition_status must be exactly one of: "verified" (the photo itself shows the condition is true), ` +
    `"not_met" (the photo shows it is false), "not_observable" (this photo cannot show it — the fact is hidden, ` +
    `internal, in the past, requires touching, smelling, opening or measuring, or needs another viewpoint). ` +
    `Never claim to have verified something that a single photo cannot show; use "not_observable" instead.\n` +
    `Rules: if the requested target is absent, a different object, a different place, cut off, too dark or unverifiable, you must NOT approve. ` +
    `Never treat high confidence alone as proof. If you are not sure, use "uncertain".\n` +
    `public_message must be one short sentence in Brazilian Portuguese for an operator, with no technical terms. ` +
    `Answer strictly as JSON matching the schema.`;

  const content: any[] = [{ type: "text", text: instructions }];
  if (args.multiImage?.reference) {
    content.push({ type: "image_url", image_url: { url: toDataUrl(args.multiImage.reference) } });
  }
  content.push({ type: "image_url", image_url: { url: toDataUrl(args.image) } });

  const payload = await cfMetered(args.meter, "judge", finalModel(), {
    messages: [{ role: "user", content }],
    response_format: { type: "json_schema", json_schema: DECISION_SCHEMA },
    max_tokens: 700,
  });
  const text = extractModelText(payload);
  const raw = parseJsonLoose(text);
  if (!raw || typeof raw.decision !== "string") throw new Error("judge_parse_failed");
  return { raw, latencyMs: Date.now() - started };
}

// ---------------- gate conservador ----------------
type ConditionStatus = "verified" | "not_met" | "not_observable";

type Combined = {
  decision: "approved" | "retake" | "uncertain" | "technical_failure";
  reason_code: string;
  public_message: string;
  /** Honestidade visual: o que a foto realmente comprova. */
  condition_status: ConditionStatus | null;
  gate: Record<string, boolean>;
};

const RETAKE_MESSAGES: Record<string, string> = {
  target_not_found: "Não encontramos o que foi pedido na foto. Tire outra mostrando o local certo.",
  wrong_object: "A foto mostra outra coisa. Fotografe o item solicitado.",
  wrong_place: "A foto parece ser de outro lugar. Fotografe o local solicitado.",
  target_not_visible: "Mostre o item por completo na foto.",
  too_dark: "A foto está escura. Melhore a iluminação e tente de novo.",
  blurry: "A foto saiu tremida. Segure firme e tire outra.",
  bad_framing: "Aproxime e centralize o item na foto.",
  condition_not_met: "A condição pedida não foi atendida. Ajuste e fotografe de novo.",
  insufficient_evidence: "A foto não mostra o suficiente para confirmar. Tire outra mais próxima.",
};

const NOT_OBSERVABLE_MESSAGE =
  "Esta foto não é capaz de comprovar o que foi pedido. É necessária uma conferência de outra forma.";

function conditionStatusOf(judge: any): ConditionStatus {
  const raw = String(judge?.condition_status ?? "").trim();
  if (raw === "verified" || raw === "not_met" || raw === "not_observable") return raw;
  return judge?.condition_met === true ? "verified" : "not_met";
}

function combine(observer: Awaited<ReturnType<typeof runObserver>>, judge: any): Combined {
  const bool = (v: unknown) => v === true;
  const status = conditionStatusOf(judge);
  const gate = {
    target_found: bool(judge.target_found) && observer.targetVisible,
    target_visible: bool(judge.target_visible),
    framing_sufficient: bool(judge.framing_sufficient) && !observer.cropped,
    lighting_sufficient: bool(judge.lighting_sufficient) && !observer.dark && !observer.overexposed,
    sharpness_sufficient: bool(judge.sharpness_sufficient) && !observer.blurry,
    quality_sufficient: bool(judge.quality_sufficient),
    condition_met: bool(judge.condition_met) && status === "verified",
    no_contrary_evidence: !(Array.isArray(judge.contrary_evidence) && judge.contrary_evidence.length > 0),
    judge_approved: judge.decision === "approved",
  };

  // Honestidade visual: nada que a foto não mostre pode ser dado como verificado.
  if (status === "not_observable") {
    return {
      decision: "uncertain",
      reason_code: "not_observable",
      public_message: NOT_OBSERVABLE_MESSAGE,
      condition_status: status,
      gate,
    };
  }

  // Discordância explícita entre etapas → incerto, nunca aprovação.
  const observerNegative = !observer.targetVisible || observer.dark || observer.blurry ||
    observer.overexposed || observer.cropped;
  if (judge.decision === "approved" && observerNegative) {
    return {
      decision: "uncertain",
      reason_code: "models_disagree",
      public_message: "Não deu para confirmar. Tire outra foto com melhor enquadramento.",
      condition_status: status,
      gate,
    };
  }
  if (judge.decision === "uncertain") {
    // Quando a causa é determinada (alvo ausente, escuro, tremido, condição não atendida),
    // o operador recebe uma ação clara em vez de um "não deu para confirmar".
    const determinate = !gate.target_found
      ? "target_not_found"
      : !gate.lighting_sufficient
        ? "too_dark"
        : !gate.sharpness_sufficient
          ? "blurry"
          : !gate.framing_sufficient
            ? "bad_framing"
            : !gate.target_visible
              ? "target_not_visible"
              : !gate.condition_met
                ? "condition_not_met"
                : null;
    if (determinate) {
      return {
        decision: "retake",
        reason_code: determinate,
        public_message: RETAKE_MESSAGES[determinate],
        condition_status: status,
        gate,
      };
    }
    return {
      decision: "uncertain",
      reason_code: "insufficient_evidence",
      public_message: "Não deu para confirmar. Tire outra foto com melhor enquadramento.",
      condition_status: status,
      gate,
    };
  }


  if (Object.values(gate).every(Boolean)) {
    return {
      decision: "approved",
      reason_code: "condition_met",
      public_message: sanitizeMessage(judge.public_message, "Foto aprovada."),
      condition_status: "verified",
      gate,
    };
  }

  const failed = Object.entries(gate).find(([, v]) => !v)?.[0] ?? "insufficient_evidence";
  const code = !gate.target_found
    ? "target_not_found"
    : !gate.target_visible
      ? "target_not_visible"
      : !gate.lighting_sufficient
        ? "too_dark"
        : !gate.sharpness_sufficient
          ? "blurry"
          : !gate.framing_sufficient
            ? "bad_framing"
            : !gate.condition_met
              ? "condition_not_met"
              : String(judge.reason_code ?? failed);
  return {
    decision: "retake",
    reason_code: code,
    public_message: RETAKE_MESSAGES[code] ?? sanitizeMessage(judge.public_message, "Tire outra foto."),
    condition_status: status,
    gate,
  };
}

// ---------------- concorrência por usuário ----------------
const inFlight = new Set<string>();

// ---------------- orçamento por sessão de câmera ----------------
export const LIVE_CHECKS_PER_SESSION = 3;
export const FINAL_CHECKS_PER_SESSION = 5;
const LIVE_MIN_INTERVAL_MS = 5000;

type Consume = { allowed: boolean; used: number; remaining: number; reason: string };

async function consumeSession(
  svc: any,
  args: { sessionId: string; workspaceId: string; userId: string; kind: "live" | "final" },
): Promise<Consume> {
  const limit = args.kind === "live" ? LIVE_CHECKS_PER_SESSION : FINAL_CHECKS_PER_SESSION;
  const { data, error } = await svc.rpc("vision_session_consume", {
    p_session_id: args.sessionId,
    p_workspace_id: args.workspaceId,
    p_user_id: args.userId,
    p_kind: args.kind,
    p_limit: limit,
    p_min_interval_ms: args.kind === "live" ? LIVE_MIN_INTERVAL_MS : 0,
  });
  if (error) return { allowed: false, used: 0, remaining: 0, reason: "budget_unavailable" };
  const row = Array.isArray(data) ? data[0] : data;
  return {
    allowed: row?.allowed === true,
    used: Number(row?.used ?? 0),
    remaining: Number(row?.remaining ?? 0),
    reason: String(row?.reason ?? "unknown"),
  };
}

/** Telemetria de consumo: números, nunca imagens ou conteúdo do modelo. */
async function recordUsage(
  svc: any,
  args: {
    meter: UsageEntry[];
    workspaceId: string;
    userId: string;
    sessionId: string;
    standardId: string | null;
    action: string;
    decision?: string | null;
  },
) {
  if (!args.meter.length) return;
  const rows = args.meter.map((m) => ({
    workspace_id: args.workspaceId,
    user_id: args.userId,
    session_id: args.sessionId,
    standard_id: args.standardId,
    action: args.action,
    step: m.step,
    model_id: m.model,
    input_tokens: m.inputTokens,
    output_tokens: m.outputTokens,
    estimated_neurons: m.neurons,
    inference_ms: m.inferenceMs,
    decision: args.decision ?? null,
  }));
  const { error } = await svc.from("vision_usage_events").insert(rows);
  if (error) console.error(`[lab] usage_insert_failed code=${String(error.code ?? "unknown").slice(0, 30)}`);
}

function sessionIdOf(body: any): string {
  const s = String(body?.sessionId ?? "").trim();
  return /^[A-Za-z0-9_-]{8,64}$/.test(s) ? s : "";
}


// ---------------- handler ----------------
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (req.method !== "POST") return err(405, "method_not_allowed");

  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.toLowerCase().startsWith("bearer ")) return err(401, "unauthorized");

  const url = Deno.env.get("SUPABASE_URL")!;
  const anon = Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEYS") ?? "";
  const userClient = createClient(url, anon, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: userData } = await userClient.auth.getUser();
  const user = userData?.user;
  if (!user) return err(401, "unauthorized");
  const actorId = user.id;

  let body: any;
  try { body = await req.json(); } catch { return err(400, "invalid_body"); }
  const action = String(body?.action ?? "");

  const svc = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const limits: Record<string, number> = {
    capabilities: 10,
    "profile-standard": 20,
    "live-locate": 120,
    "benchmark-evaluate": 20,
  };
  const { data: rl } = await svc.rpc("hit_public_rate_limit", {
    p_key_hash: `lab:${actorId}`,
    p_action: action || "unknown",
    p_window_seconds: 60,
    p_limit: limits[action] ?? 20,
  });
  const allowed = Array.isArray(rl) ? rl[0]?.allowed : (rl as any)?.allowed;
  if (allowed === false) return err(429, "rate_limited");

  if (action === "capabilities") {
    const out: Record<string, unknown> = { fast: null, final: null };
    for (const [key, model, payload] of [
      ["fast", fastModel(), { image: PING_IMAGE, task: "query", question: "What color dominates this image?", max_tokens: 16 }],
      ["final", finalModel(), { messages: [{ role: "user", content: "Reply with the single word ok." }], max_tokens: 8 }],
    ] as const) {
      const started = Date.now();
      try {
        const p = await cfRun(model, payload as unknown);
        out[key] = { model, ok: true, hasText: extractModelText(p).trim().length > 0, latencyMs: Date.now() - started };
      } catch (e) {
        out[key] = { model, ok: false, code: String((e as Error).message).slice(0, 60), latencyMs: Date.now() - started };
      }
    }
    console.log(`[lab] capabilities user=${actorId.slice(0, 8)}`);
    return json(200, out);
  }

  // autorização por workspace (todas as demais ações)
  const workspaceId = String(body?.workspaceId ?? "");
  if (!workspaceId) return err(400, "workspace_required");
  const { data: ws } = await userClient
    .from("workspaces").select("id").eq("id", workspaceId).maybeSingle();
  if (!ws) return err(403, "forbidden");

  // ---------- perfil interno do padrão ----------
  if (action === "profile-standard") {
    const standardId = String(body?.standardId ?? "");
    if (!standardId) return err(400, "standard_required");
    const { data: standard } = await userClient
      .from("visual_standards")
      .select("id, question, reference_path, workspace_id")
      .eq("id", standardId)
      .eq("workspace_id", workspaceId)
      .maybeSingle();
    if (!standard) return err(403, "forbidden");

    try {
      let referenceSummary: string | null = null;
      if (standard.reference_path) {
        const { data: file } = await svc.storage.from("visual-standards").download(standard.reference_path);
        if (file) {
          const bytes = new Uint8Array(await file.arrayBuffer());
          const meta = sniff(bytes);
          if (meta) referenceSummary = await describeReference({ bytes, ...meta }, standard.question);
        }
      }
      const { profile, ambiguous } = await buildProfile(standard.question, referenceSummary);
      const { error: upErr } = await userClient
        .from("visual_standards")
        .update({
          internal_profile: profile,
          profile_version: PROFILE_VERSION,
          needs_validation: ambiguous,
        })
        .eq("id", standardId);
      if (upErr) throw new Error("profile_save_failed");
      console.log(`[lab] profile ok user=${actorId.slice(0, 8)} ambiguous=${ambiguous}`);
      return json(200, { ok: true, needsValidation: ambiguous, profileVersion: PROFILE_VERSION });
    } catch (e) {
      const code = String((e as Error).message ?? "unknown").slice(0, 60);
      console.error(`[lab] profile_failed user=${actorId.slice(0, 8)} code=${code}`);
      return json(200, { ok: false, code });
    }
  }

  // ---------- localização ao vivo (frame só em memória) ----------
  if (action === "live-locate") {
    const requestId = String(body?.requestId ?? "").slice(0, 40) || null;
    const standardId = String(body?.standardId ?? "");
    if (!standardId) return err(400, "standard_required");
    const { data: std } = await userClient
      .from("visual_standards")
      .select("internal_profile")
      .eq("id", standardId)
      .eq("workspace_id", workspaceId)
      .maybeSingle();
    const stored = (std as any)?.internal_profile;
    // Alvo vem sempre do padrão salvo — nunca do que o cliente enviar.
    const target = String(stored?.target_phrase_en || stored?.target_phrase || "").trim().slice(0, 60);
    if (!target) {
      return json(200, {
        requestId, strategy: "none", found: false, boxes: [], inferenceMs: 0,
        state: "uncertain", hintCode: "no_target_configured",
        hint: "Este padrão ainda não está pronto para orientação na câmera.",
      });
    }
    const frame = decodeImage(body?.frameBase64, MIN_DIM);
    if (!frame) return err(400, "invalid_image");

    const liveKey = `live:${actorId}`;
    if (inFlight.has(liveKey)) return err(409, "already_running");
    inFlight.add(liveKey);
    try {
      const r = await locateTarget(frame, target);
      const g = liveGuidance(r.found, r.boxes);
      return json(200, { requestId, ...r, ...g, hint: HINTS[g.hintCode] });
    } catch (e) {
      const code = String((e as Error).message ?? "unknown").slice(0, 60);
      console.error(`[lab] locate_failed user=${actorId.slice(0, 8)} code=${code}`);
      return json(200, {
        requestId, strategy: "none", found: false, boxes: [], inferenceMs: 0,
        state: "uncertain", hintCode: "uncertain", hint: HINTS.uncertain,
      });
    } finally {
      inFlight.delete(liveKey);
    }
  }


  if (action !== "benchmark-evaluate") return err(400, "unknown_action");

  const question = String(body?.question ?? "").trim();
  if (question.length < 5 || question.length > 300) return err(400, "invalid_question");

  let profile: any = body?.profile && typeof body.profile === "object" ? body.profile : null;
  const standardId = String(body?.standardId ?? "");
  if (!profile && standardId) {
    const { data: std } = await userClient
      .from("visual_standards")
      .select("internal_profile")
      .eq("id", standardId)
      .eq("workspace_id", workspaceId)
      .maybeSingle();
    const stored = (std as any)?.internal_profile;
    if (stored && typeof stored === "object" && stored.target_phrase) profile = stored;
  }

  const image = decodeImage(body?.imageBase64);
  if (!image) return err(400, "invalid_image");
  const reference = body?.referenceBase64 ? decodeImage(body.referenceBase64) : null;
  if (body?.referenceBase64 && !reference) return err(400, "invalid_reference");

  if (inFlight.has(actorId)) return err(409, "already_running");
  inFlight.add(actorId);
  const t0 = Date.now();
  try {
    const observer = await runObserver(image, question, profile);

    let referenceMode: "none" | "multi_image" | "derived" = "none";
    let referenceDescription: string | null = profile?.reference_summary ?? null;
    let judge;
    if (reference) {
      try {
        judge = await runJudge({
          image, question, profile,
          facts: observer.observation,
          multiImage: { reference },
        });
        referenceMode = "multi_image";
      } catch {
        referenceDescription = referenceDescription ?? await describeReference(reference, question);
        judge = await runJudge({ image, question, profile, facts: observer.observation, referenceDescription });
        referenceMode = "derived";
      }
    } else {
      judge = await runJudge({ image, question, profile, facts: observer.observation, referenceDescription });
      if (referenceDescription) referenceMode = "derived";
    }

    const combined = combine(observer, judge.raw);
    console.log(`[lab] evaluate ok user=${actorId.slice(0, 8)} decision=${combined.decision} ms=${Date.now() - t0}`);
    return json(200, {
      observer: {
        observation: observer.observation,
        targetVisible: observer.targetVisible,
        blurry: observer.blurry,
        dark: observer.dark,
        latencyMs: observer.latencyMs,
      },
      judge: {
        decision: judge.raw.decision,
        targetVisible: judge.raw.target_visible ?? null,
        conditionMet: judge.raw.condition_met ?? null,
        qualitySufficient: judge.raw.quality_sufficient ?? null,
        reasonCode: judge.raw.reason_code ?? null,
        observations: [
          ...strList(judge.raw.supporting_evidence, 2),
          ...strList(judge.raw.contrary_evidence, 2),
        ],
        confidence: typeof judge.raw.confidence === "number" ? judge.raw.confidence : null,
        latencyMs: judge.latencyMs,
      },
      combined,
      referenceMode,
      totalLatencyMs: Date.now() - t0,
    });
  } catch (e) {
    const code = String((e as Error).message ?? "unknown").slice(0, 60);
    console.error(`[lab] evaluate_failed user=${actorId.slice(0, 8)} code=${code} ms=${Date.now() - t0}`);
    return json(200, {
      observer: null,
      judge: null,
      combined: {
        decision: "technical_failure",
        reason_code: /^[a-z0-9_]{1,40}$/.test(code) ? code : "service_unavailable",

        public_message: "Não foi possível verificar agora. Tente novamente.",
        gate: {},
      },
      referenceMode: "none",
      totalLatencyMs: Date.now() - t0,
    });
  } finally {
    inFlight.delete(actorId);
  }
});
