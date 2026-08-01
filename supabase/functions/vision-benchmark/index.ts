// Laboratório privado de padrões visuais (Camera AI V3 — Fase 1).
// Regras:
//   * verify_jwt = true — nunca aceita responseToken público.
//   * Autorização por workspace (owner) verificada com o JWT do chamador.
//   * Imagens candidatas ficam SOMENTE em memória: não vão para Storage,
//     não vão para o banco, não entram em logs nem em analytics.
//   * Logs apenas com códigos sanitizados, modelo, duração e status.

// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const MAX_BYTES = 8 * 1024 * 1024;
const MIN_DIM = 128;
const MAX_DIM = 8000;
const CALL_TIMEOUT_MS = 45_000;

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
  // PNG
  if (bytes.length > 24 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
    return { mime: "image/png", width: dv.getUint32(16), height: dv.getUint32(20) };
  }
  // JPEG
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
  // WEBP
  if (bytes.length > 30 && String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" &&
      String.fromCharCode(...bytes.slice(8, 12)) === "WEBP") {
    return { mime: "image/webp", width: MIN_DIM, height: MIN_DIM };
  }
  return null;
}

function decodeImage(b64: unknown): Decoded | null {
  if (typeof b64 !== "string" || b64.length < 32) return null;
  let bytes: Uint8Array;
  try { bytes = b64ToBytes(b64); } catch { return null; }
  if (bytes.length > MAX_BYTES) return null;
  const meta = sniff(bytes);
  if (!meta) return null;
  if (meta.width < MIN_DIM || meta.height < MIN_DIM) return null;
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

// ---------------- Cloudflare ----------------
async function cfRun(model: string, body: unknown): Promise<any> {
  const accountId = String(Deno.env.get("CLOUDFLARE_ACCOUNT_ID") ?? "").trim();
  const apiToken = String(Deno.env.get("CLOUDFLARE_API_TOKEN") ?? "").trim();
  if (!accountId || !apiToken) throw new Error("cloudflare_credentials_missing");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CALL_TIMEOUT_MS);
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

// ---------------- etapa 1: Moondream (observador) ----------------
const OBSERVER_QUESTION =
  "Describe briefly: the main object or place visible, whether it is fully visible, " +
  "the framing, the lighting, and whether the photo is blurry.";

async function runObserver(image: Decoded, question: string) {
  const started = Date.now();
  const payload = await cfRun(fastModel(), {
    image: Array.from(image.bytes),
    task: "query",
    question: `${OBSERVER_QUESTION} Context: ${question}`,
    max_tokens: 200,
  });
  const text = extractModelText(payload).trim();
  if (!text) throw new Error("observer_empty_response");
  const lower = text.toLowerCase();
  return {
    latencyMs: Date.now() - started,
    observation: text.slice(0, 400),
    blurry: /blur|out of focus|unfocused/.test(lower),
    dark: /dark|too dim|poorly lit|low light|underexposed/.test(lower),
    targetVisible: !/not visible|cannot see|no visible|unclear|obscured/.test(lower),
  };
}

// ---------------- etapa 2: Llama 4 Scout (juiz) ----------------
const DECISION_SCHEMA = {
  type: "object",
  properties: {
    decision: { type: "string", enum: ["approved", "retake", "uncertain"] },
    target_visible: { type: "boolean" },
    condition_met: { type: "boolean" },
    quality_sufficient: { type: "boolean" },
    reason_code: {
      type: "string",
      enum: [
        "condition_met",
        "condition_not_met",
        "target_not_visible",
        "too_dark",
        "blurry",
        "bad_framing",
        "insufficient_evidence",
      ],
    },
    public_message: { type: "string" },
    observations: { type: "array", items: { type: "string" } },
    confidence: { type: "number" },
  },
  required: [
    "decision", "target_visible", "condition_met", "quality_sufficient",
    "reason_code", "public_message", "confidence",
  ],
};

async function runJudge(args: {
  image: Decoded;
  question: string;
  facts: string;
  referenceDescription?: string | null;
  multiImage?: { reference: Decoded } | null;
}) {
  const started = Date.now();
  const content: any[] = [
    {
      type: "text",
      text:
        `Task question: ${args.question}\n` +
        `Fast-observer facts: ${args.facts}\n` +
        (args.referenceDescription ? `Reference (derived description of the expected result): ${args.referenceDescription}\n` : "") +
        `Judge the candidate photo. Answer strictly as JSON matching the schema. ` +
        `public_message must be a short sentence in Brazilian Portuguese for an operator, ` +
        `with no technical terms. If evidence is insufficient, never approve.`,
    },
  ];
  if (args.multiImage?.reference) {
    content.push({ type: "image_url", image_url: { url: toDataUrl(args.multiImage.reference) } });
  }
  content.push({ type: "image_url", image_url: { url: toDataUrl(args.image) } });

  const payload = await cfRun(finalModel(), {
    messages: [{ role: "user", content }],
    response_format: { type: "json_schema", json_schema: DECISION_SCHEMA },
    max_tokens: 500,
  });
  const text = extractModelText(payload);
  const parsed = parseJsonLoose(text);
  if (!parsed || typeof parsed.decision !== "string") throw new Error("judge_invalid_json");
  return { latencyMs: Date.now() - started, raw: parsed };
}

async function describeReference(reference: Decoded, question: string): Promise<string> {
  const payload = await cfRun(fastModel(), {
    image: Array.from(reference.bytes),
    task: "query",
    question: `Describe the expected correct state shown in this reference photo, related to: ${question}`,
    max_tokens: 160,
  });
  return extractModelText(payload).trim().slice(0, 400);
}

// ---------------- decisão combinada ----------------
type Combined = {
  decision: "approved" | "retake" | "uncertain" | "technical_failure";
  reason_code: string;
  public_message: string;
};

function combine(observer: Awaited<ReturnType<typeof runObserver>>, judge: any): Combined {
  const decision = judge.decision;
  const insufficient = observer.blurry || observer.dark || !observer.targetVisible ||
    judge.quality_sufficient === false || judge.target_visible === false;

  if (insufficient) {
    return {
      decision: "retake",
      reason_code: !observer.targetVisible || judge.target_visible === false
        ? "target_not_visible"
        : observer.dark ? "too_dark" : observer.blurry ? "blurry" : String(judge.reason_code ?? "insufficient_evidence"),
      public_message: sanitizeMessage(judge.public_message, "Tire outra foto, mais próxima e bem iluminada."),
    };
  }
  if (decision === "approved" && judge.condition_met === true) {
    return {
      decision: "approved",
      reason_code: "condition_met",
      public_message: sanitizeMessage(judge.public_message, "Foto aprovada."),
    };
  }
  if (decision === "retake") {
    return {
      decision: "retake",
      reason_code: String(judge.reason_code ?? "condition_not_met"),
      public_message: sanitizeMessage(judge.public_message, "Tire outra foto."),
    };
  }
  return {
    decision: "uncertain",
    reason_code: "insufficient_evidence",
    public_message: "Não foi possível concluir com segurança.",
  };
}

// ---------------- concorrência por usuário ----------------
const inFlight = new Set<string>();

// ---------------- handler ----------------
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (req.method !== "POST") return err(405, "method_not_allowed");

  // Modo diagnóstico interno: exige segredo de servidor (nunca público, nunca no frontend).
  const diagSecret = String(Deno.env.get("LAB_DIAG_TOKEN") ?? "").trim();
  const diagMode = diagSecret.length > 0 && req.headers.get("x-diag-token") === diagSecret;

  const authHeader = req.headers.get("Authorization") ?? "";
  if (!diagMode && !authHeader.toLowerCase().startsWith("bearer ")) return err(401, "unauthorized");

  const url = Deno.env.get("SUPABASE_URL")!;
  const anon = Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEYS") ?? "";
  const userClient = createClient(url, anon, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: userData } = await userClient.auth.getUser();
  const user = userData?.user;
  if (!user && !diagMode) return err(401, "unauthorized");
  const actorId = user?.id ?? "diag";

  let body: any;
  try { body = await req.json(); } catch { return err(400, "invalid_body"); }
  const action = String(body?.action ?? "");

  // rate limit por usuário
  const svc = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: rl } = await svc.rpc("hit_public_rate_limit", {
    p_key_hash: `lab:${actorId}`,
    p_action: action || "unknown",
    p_window_seconds: 60,
    p_limit: action === "capabilities" ? 10 : 20,
  });
  const allowed = Array.isArray(rl) ? rl[0]?.allowed : (rl as any)?.allowed;
  if (allowed === false) return err(429, "rate_limited");


  if (action === "capabilities") {
    const out: Record<string, unknown> = { fast: null, final: null };
    for (const [key, model, payload] of [
      ["fast", fastModel(), { image: [], task: "query", question: "ping", max_tokens: 8 }],
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

  if (action !== "benchmark-evaluate") return err(400, "unknown_action");

  // autorização por workspace
  const workspaceId = String(body?.workspaceId ?? "");
  if (!workspaceId) return err(400, "workspace_required");
  const { data: ws } = await userClient
    .from("workspaces").select("id").eq("id", workspaceId).maybeSingle();
  if (!ws) return err(403, "forbidden");

  const question = String(body?.question ?? "").trim();
  if (question.length < 5 || question.length > 300) return err(400, "invalid_question");

  const image = decodeImage(body?.imageBase64);
  if (!image) return err(400, "invalid_image");
  const reference = body?.referenceBase64 ? decodeImage(body.referenceBase64) : null;
  if (body?.referenceBase64 && !reference) return err(400, "invalid_reference");

  if (inFlight.has(actorId)) return err(409, "already_running");
  inFlight.add(actorId);
  const t0 = Date.now();
  try {
    const observer = await runObserver(image, question);

    let referenceMode: "none" | "multi_image" | "derived" = "none";
    let referenceDescription: string | null = null;
    let judge;
    if (reference) {
      try {
        judge = await runJudge({
          image, question,
          facts: observer.observation,
          multiImage: { reference },
        });
        referenceMode = "multi_image";
      } catch {
        referenceDescription = await describeReference(reference, question);
        judge = await runJudge({ image, question, facts: observer.observation, referenceDescription });
        referenceMode = "derived";
      }
    } else {
      judge = await runJudge({ image, question, facts: observer.observation });
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
        observations: Array.isArray(judge.raw.observations)
          ? judge.raw.observations.slice(0, 4).map((o: unknown) => sanitizeMessage(o, "")).filter(Boolean)
          : [],
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
        reason_code: code,
        public_message: "Não foi possível analisar agora. Tente novamente.",
      },
      referenceMode: "none",
      totalLatencyMs: Date.now() - t0,
    });
  } finally {
    inFlight.delete(actorId);
  }
});
