// Provedor visual google_gemini (Camera AI V3 — Fase 3A, somente Laboratório).
//
// Regras inegociáveis:
//   * chave lida SOMENTE de Deno.env.get("GEMINI_API_KEY");
//   * nunca aceita chave vinda do frontend;
//   * nunca registra chave, imagem, base64, prompt completo ou resposta bruta;
//   * uma única chamada multimodal (referência + candidata) por decisão final;
//   * saída obrigatoriamente estruturada em JSON validado por schema.

// deno-lint-ignore-file no-explicit-any
import { GEMINI_MODEL_ID } from "./vision-provider.ts";

const ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models";

export class GeminiError extends Error {}

export type GeminiImage = { mime: string; base64: string };

export type GeminiCall = {
  raw: unknown;
  tokens: { input: number; output: number; cached: number } | null;
  inferenceMs: number;
  model: string;
};

/** Schema estruturado exigido do modelo. Campo faltando = falha técnica. */
export const GEMINI_RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    target_visible: { type: "BOOLEAN" },
    target_confidence: { type: "NUMBER" },
    image_quality: { type: "STRING", enum: ["good", "dark", "blurry", "cropped", "unusable"] },
    reference_comparable: { type: "BOOLEAN" },
    conditions: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          condition: { type: "STRING" },
          status: { type: "STRING", enum: ["verified", "not_met", "not_observable"] },
          confidence: { type: "NUMBER" },
          visible_evidence: { type: "STRING" },
        },
        required: ["condition", "status", "confidence", "visible_evidence"],
      },
    },
    overall_confidence: { type: "NUMBER" },
    suggested_decision: { type: "STRING", enum: ["approved", "retake", "uncertain"] },
    public_message: { type: "STRING" },
    bounding_boxes: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          x: { type: "NUMBER" }, y: { type: "NUMBER" },
          w: { type: "NUMBER" }, h: { type: "NUMBER" },
        },
        required: ["x", "y", "w", "h"],
      },
    },
  },
  required: [
    "target_visible", "target_confidence", "image_quality", "reference_comparable",
    "conditions", "overall_confidence", "suggested_decision", "public_message",
  ],
} as const;

/** Instrução da análise única. Não inclui imagens nem chaves. */
export function buildInstruction(args: {
  question: string;
  profile: any;
  conditions: string[];
  hasReference: boolean;
}): string {
  const p = args.profile ?? {};
  return [
    "You are a strict visual inspector for a facility checklist. Judge ONLY what is visible.",
    args.hasReference
      ? 'Two images are provided. The image labelled "REFERENCE" shows the expected state. ' +
        'The image labelled "CANDIDATE" is the photo under inspection. ' +
        "The reference does NOT require identical angle, lighting, framing or composition; " +
        "use it only to understand the expected state. Every verdict must be based on the CANDIDATE image."
      : "One image is provided, labelled CANDIDATE. It is the photo under inspection.",
    `Inspection standard, written in Brazilian Portuguese: "${args.question}"`,
    p.target_phrase ? `Main target to find: ${p.target_phrase}` : "",
    p.requested_condition ? `Requested condition: ${p.requested_condition}` : "",
    args.conditions.length
      ? `Verifiable conditions, judge each one separately:\n- ${args.conditions.join("\n- ")}`
      : "Derive the conditions contained in the standard and judge each one separately.",
    p.observable_signals?.length ? `Signals that would prove a condition: ${p.observable_signals.join("; ")}` : "",
    p.contrary_signals?.length ? `Signals that would disprove a condition: ${p.contrary_signals.join("; ")}` : "",
    "",
    "Rules for each condition:",
    '- "verified" only when the CANDIDATE image itself shows it is true;',
    '- "not_met" when the CANDIDATE image shows it is false;',
    '- "not_observable" when this photo cannot show it (hidden, internal, past, requires opening, ' +
      "touching, smelling, measuring, or another viewpoint).",
    "- visible_evidence must describe ONLY what is actually visible in the CANDIDATE image.",
    "- Never speculate. Do not write 'probably', 'seems', 'appears', 'should be' or equivalents.",
    "- Never infer a hidden state from the reference image.",
    "- confidence is your own certainty from 0 to 1.",
    "",
    "image_quality describes the CANDIDATE image only.",
    "reference_comparable is true only when the candidate shows the same kind of place or object as the reference; " +
      (args.hasReference ? "" : "with no reference provided, set it to true."),
    "bounding_boxes are optional and normalised 0-1; include them only when you really localise the target.",
    "public_message: one short sentence in Brazilian Portuguese for an operator, no technical terms.",
    "Answer strictly with the JSON object required by the schema.",
  ].filter(Boolean).join("\n");
}

/**
 * Uma única chamada multimodal. Devolve o JSON já parseado (sem validar
 * semanticamente: a validação de contrato vive em gemini-gate.ts).
 */
export async function callGemini(args: {
  instruction: string;
  reference: GeminiImage | null;
  candidate: GeminiImage;
  timeoutMs: number;
}): Promise<GeminiCall> {
  const key = String(Deno.env.get("GEMINI_API_KEY") ?? "").trim();
  if (!key) throw new GeminiError("gemini_key_missing");

  const parts: any[] = [{ text: args.instruction }];
  if (args.reference) {
    parts.push({ text: "REFERENCE image (expected state):" });
    parts.push({ inlineData: { mimeType: args.reference.mime, data: args.reference.base64 } });
  }
  parts.push({ text: "CANDIDATE image (photo under inspection):" });
  parts.push({ inlineData: { mimeType: args.candidate.mime, data: args.candidate.base64 } });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), args.timeoutMs);
  const started = Date.now();
  try {
    const res = await fetch(
      `${ENDPOINT}/${GEMINI_MODEL_ID}:generateContent`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": key },
        body: JSON.stringify({
          contents: [{ role: "user", parts }],
          generationConfig: {
            temperature: 0,
            responseMimeType: "application/json",
            responseSchema: GEMINI_RESPONSE_SCHEMA,
            maxOutputTokens: 1200,
          },
        }),
        signal: controller.signal,
      },
    );
    const inferenceMs = Date.now() - started;
    if (!res.ok) throw new GeminiError(`gemini_http_${res.status}`);
    const payload = await res.json();
    const text = String(
      payload?.candidates?.[0]?.content?.parts?.map((p: any) => p?.text ?? "").join("") ?? "",
    ).trim();
    if (!text) throw new GeminiError("gemini_empty_response");
    let raw: unknown;
    try {
      raw = JSON.parse(text);
    } catch {
      throw new GeminiError("gemini_invalid_json");
    }
    const u = payload?.usageMetadata ?? null;
    const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? Math.round(v) : null);
    const input = n(u?.promptTokenCount);
    const output = n(u?.candidatesTokenCount);
    return {
      raw,
      tokens: input === null && output === null
        ? null
        : { input: input ?? 0, output: output ?? 0, cached: n(u?.cachedContentTokenCount) ?? 0 },
      inferenceMs,
      model: GEMINI_MODEL_ID,
    };
  } catch (e) {
    if (e instanceof GeminiError) throw e;
    throw new GeminiError(
      (e as Error)?.name === "AbortError" ? "gemini_timeout" : "gemini_request_failed",
    );
  } finally {
    clearTimeout(timer);
  }
}
