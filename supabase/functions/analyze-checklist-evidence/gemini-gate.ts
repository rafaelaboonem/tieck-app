// Contrato estruturado e decisão do servidor para o provedor google_gemini.
// Módulo PURO: sem Deno, sem rede, sem imagens — importável pelos testes.
//
// Princípio: o servidor NUNCA aceita `suggested_decision` do modelo.
// Aprovação só existe quando todas as travas passam. Na dúvida, nunca aprova.

import { RETAKE_MESSAGES, type ConditionStatus, type Decision } from "./gate.ts";

/** Limiar de aprovação da Fase 3A — conservador por decisão do proprietário. */
export const GEMINI_APPROVAL_THRESHOLD = 0.9;

export type ImageQuality = "good" | "dark" | "blurry" | "cropped" | "unusable";

export interface GeminiCondition {
  condition: string;
  status: ConditionStatus;
  confidence: number;
  visible_evidence: string;
}

export interface GeminiPayload {
  target_visible: boolean;
  target_confidence: number;
  image_quality: ImageQuality;
  reference_comparable: boolean;
  conditions: GeminiCondition[];
  overall_confidence: number;
  suggested_decision: "approved" | "retake" | "uncertain";
  public_message: string;
  bounding_boxes?: { x: number; y: number; w: number; h: number }[];
}

export interface GeminiVerdict {
  decision: Decision;
  reason_code: string;
  public_message: string;
  condition_status: ConditionStatus | null;
  confidence: number | null;
  confidence_threshold: number;
  /** Cada trava avaliada pelo servidor — auditável, nunca vinda do modelo. */
  gate: Record<string, boolean>;
  /** Verdadeiro quando o servidor discordou de suggested_decision. */
  overridden: boolean;
}

const QUALITIES: ImageQuality[] = ["good", "dark", "blurry", "cropped", "unusable"];
const STATUSES: ConditionStatus[] = ["verified", "not_met", "not_observable"];

const LOW_CONFIDENCE_MESSAGE =
  "Não deu para confirmar com segurança. Tire outra foto mais próxima e bem iluminada.";
const NOT_OBSERVABLE_MESSAGE =
  "Esta foto não é capaz de comprovar o que foi pedido. É necessária uma conferência de outra forma.";
const REFERENCE_MESSAGE =
  "Não deu para comparar com o resultado esperado. Fotografe o mesmo local por inteiro.";

/**
 * Linguagem especulativa: evidência que apenas supõe nunca comprova.
 * Cobre português e inglês, pois o modelo pode responder em qualquer um.
 */
const SPECULATIVE = new RegExp(
  [
    "provavelmente", "possivelmente", "presumivelmente", "aparentemente", "supostamente",
    "parece", "aparenta", "deve estar", "deveria estar", "talvez", "imagino", "acredito",
    "n[aã]o d[aá] para ver", "n[aã]o [eé] poss[ií]vel ver", "assumindo", "presumo",
    "likely", "probably", "seems", "appears", "assume", "assuming", "might be",
    "may be", "should be", "possibly", "presumably", "cannot see", "can'?t see",
    "not visible", "unclear",
  ].join("|"),
  "i",
);

export function isSpeculative(text: string): boolean {
  return SPECULATIVE.test(text);
}

function isProbability(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 1;
}

/**
 * Valida o JSON estruturado. Campo obrigatório ausente ou inválido é
 * falha técnica — jamais preenchemos valores inventados.
 */
export function validateGeminiPayload(raw: unknown): GeminiPayload | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;

  if (typeof o.target_visible !== "boolean") return null;
  if (!isProbability(o.target_confidence)) return null;
  if (typeof o.image_quality !== "string" || !QUALITIES.includes(o.image_quality as ImageQuality)) return null;
  if (typeof o.reference_comparable !== "boolean") return null;
  if (!isProbability(o.overall_confidence)) return null;
  if (
    typeof o.suggested_decision !== "string" ||
    !["approved", "retake", "uncertain"].includes(o.suggested_decision)
  ) return null;
  if (typeof o.public_message !== "string" || !o.public_message.trim()) return null;
  if (!Array.isArray(o.conditions) || o.conditions.length === 0) return null;

  const conditions: GeminiCondition[] = [];
  for (const c of o.conditions as unknown[]) {
    if (!c || typeof c !== "object") return null;
    const k = c as Record<string, unknown>;
    if (typeof k.condition !== "string" || !k.condition.trim()) return null;
    if (typeof k.status !== "string" || !STATUSES.includes(k.status as ConditionStatus)) return null;
    if (!isProbability(k.confidence)) return null;
    if (typeof k.visible_evidence !== "string") return null;
    conditions.push({
      condition: k.condition.trim().slice(0, 200),
      status: k.status as ConditionStatus,
      confidence: k.confidence,
      visible_evidence: k.visible_evidence.trim().slice(0, 300),
    });
  }

  const boxes = Array.isArray(o.bounding_boxes)
    ? (o.bounding_boxes as unknown[])
      .map((b) => {
        if (!b || typeof b !== "object") return null;
        const r = b as Record<string, unknown>;
        const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
        const x = n(r.x), y = n(r.y), w = n(r.w ?? r.width), h = n(r.h ?? r.height);
        if (x === null || y === null || w === null || h === null) return null;
        if (w <= 0 || h <= 0 || x < 0 || y < 0 || x > 1 || y > 1 || w > 1 || h > 1) return null;
        return { x, y, w, h };
      })
      .filter((b): b is { x: number; y: number; w: number; h: number } => b !== null)
      .slice(0, 4)
    : [];

  return {
    target_visible: o.target_visible,
    target_confidence: o.target_confidence,
    image_quality: o.image_quality as ImageQuality,
    reference_comparable: o.reference_comparable,
    conditions,
    overall_confidence: o.overall_confidence,
    suggested_decision: o.suggested_decision as GeminiPayload["suggested_decision"],
    public_message: o.public_message.trim().slice(0, 200),
    ...(boxes.length ? { bounding_boxes: boxes } : {}),
  };
}

/** Estado agregado das condições: o pior caso sempre prevalece. */
export function overallConditionStatus(conditions: GeminiCondition[]): ConditionStatus {
  if (conditions.some((c) => c.status === "not_observable")) return "not_observable";
  if (conditions.some((c) => c.status === "not_met")) return "not_met";
  return "verified";
}

/**
 * Decisão calculada pelo servidor. `suggested_decision` entra apenas como
 * sinal — nunca como autorização.
 */
export function decideGemini(
  payload: GeminiPayload,
  options: { hasReference: boolean; threshold?: number; referenceCount?: number; standardVersion?: string; snapshotVersion?: string },
): GeminiVerdict {
  const threshold = typeof options.threshold === "number" &&
      options.threshold > 0 && options.threshold <= 1
    ? options.threshold
    : GEMINI_APPROVAL_THRESHOLD;

  const status = overallConditionStatus(payload.conditions);
  const verified = payload.conditions.filter((c) => c.status === "verified");

  const evidenceOk = verified.every((c) => typeof c.visible_evidence === "string" && c.visible_evidence.trim().length > 0);
  const evidenceNotSpeculative = verified.every((c) => !isSpeculative(c.visible_evidence));

  // Trava conservadora real: ALL must be true
  const gate: Record<string, boolean> = {
    observable: status !== "not_observable",
    target_present: payload.target_visible === true,
    reference_match: payload.reference_comparable === true,
    condition_met: status === "verified",
    image_quality_usable: payload.image_quality === "good",
    overall_confidence_sufficient: payload.overall_confidence >= threshold,
    visible_evidence_present: evidenceOk && evidenceNotSpeculative,
    references_valid: (options.referenceCount ?? 0) === 2,
    provider_valid: true, // Chamador garante
    model_valid: true, // Chamador garante
    version_match: options.standardVersion === options.snapshotVersion,
  };

  const base = {
    condition_status: status,
    confidence: payload.overall_confidence,
    confidence_threshold: threshold,
    gate,
  };

  const verdict = (decision: Decision, reason_code: string, public_message: string): GeminiVerdict => ({
    ...base,
    decision,
    reason_code,
    public_message,
    overridden: payload.suggested_decision !== decision,
  });

  // 1) Versão ou configuração inválida
  if (!gate.references_valid) return verdict("uncertain", "standard_not_configured", "Padrão visual mal configurado.");
  if (!gate.version_match) return verdict("uncertain", "standard_version_mismatch", "O checklist precisa ser republicado.");

  // 2) Imagem inutilizável ou com defeito conhecido
  if (!gate.image_quality_usable) {
    const code = payload.image_quality === "dark" ? "too_dark" :
                 payload.image_quality === "blurry" ? "blurry" :
                 payload.image_quality === "cropped" ? "bad_framing" : "image_quality";
    return verdict("retake", code, RETAKE_MESSAGES[code] || "Qualidade da imagem insuficiente.");
  }

  // 3) Alvo ausente ou reconhecido com pouca certeza
  if (!gate.target_present) return verdict("retake", "target_not_found", RETAKE_MESSAGES.target_not_found);

  // 4) Referência existente mas incomparável
  if (!gate.reference_match) return verdict("retake", "wrong_subject", REFERENCE_MESSAGE);

  // 5) Condição impossível de observar
  if (!gate.observable) return verdict("uncertain", "not_observable", NOT_OBSERVABLE_MESSAGE);

  // 6) Condição comprovadamente não atendida
  if (!gate.condition_met) return verdict("retake", "condition_not_met", RETAKE_MESSAGES.condition_not_met);

  // 7) Evidência ausente ou especulativa
  if (!gate.visible_evidence_present) return verdict("uncertain", "insufficient_evidence", NOT_OBSERVABLE_MESSAGE);

  // 8) Confiança insuficiente
  if (!gate.overall_confidence_sufficient) return verdict("retake", "low_confidence", LOW_CONFIDENCE_MESSAGE);

  // Decisão final: somente aprovado se TODOS os portões estiverem abertos
  if (Object.values(gate).every(Boolean)) {
    const msg = payload.public_message && !isSpeculative(payload.public_message)
      ? payload.public_message
      : "Foto aprovada.";
    return verdict("approved", "condition_met", msg);
  }

  return verdict("uncertain", "insufficient_evidence", LOW_CONFIDENCE_MESSAGE);
}

