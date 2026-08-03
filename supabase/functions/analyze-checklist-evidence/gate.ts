// Gate conservador da Camera AI V3 (Fase 2.2).
// Módulo puro: sem Deno, sem rede — usado pelo handler e pelos testes.

import { sanitizeMessage, strList } from "./sanitize.ts";

export type ConditionStatus = "verified" | "not_met" | "not_observable";
export type Decision = "approved" | "retake" | "uncertain" | "technical_failure";
export type Verifiability = "verifiable" | "partially_verifiable" | "not_verifiable";

/** Threshold conservador inicial de confiança. */
export const DEFAULT_CONFIDENCE_THRESHOLD = 0.8;

export type Combined = {
  decision: Decision;
  reason_code: string;
  public_message: string;
  /** Honestidade visual: o que a foto realmente comprova. */
  condition_status: ConditionStatus | null;
  gate: Record<string, boolean>;
  /** Confiança declarada pelo modelo — registrada para calibração, nunca prova. */
  confidence: number | null;
  confidence_threshold: number;
};

export type ObserverFacts = {
  targetVisible: boolean;
  blurry: boolean;
  dark: boolean;
  overexposed: boolean;
  cropped: boolean;
};

export const RETAKE_MESSAGES: Record<string, string> = {
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

export const NOT_OBSERVABLE_MESSAGE =
  "Esta foto não é capaz de comprovar o que foi pedido. É necessária uma conferência de outra forma.";

const LOW_CONFIDENCE_MESSAGE =
  "Não deu para confirmar com segurança. Tire outra foto mais próxima e bem iluminada.";

export function conditionStatusOf(judge: any): ConditionStatus {
  const raw = String(judge?.condition_status ?? "").trim();
  if (raw === "verified" || raw === "not_met" || raw === "not_observable") return raw;
  return judge?.condition_met === true ? "verified" : "not_met";
}

/** Campos obrigatórios do juiz: JSON incompleto nunca pode virar aprovação. */
const REQUIRED_JUDGE_FIELDS = [
  "target_found", "target_visible", "framing_sufficient", "lighting_sufficient",
  "sharpness_sufficient", "quality_sufficient", "condition_met",
];

export function judgeJsonComplete(judge: any): boolean {
  if (!judge || typeof judge !== "object") return false;
  if (typeof judge.decision !== "string") return false;
  return REQUIRED_JUDGE_FIELDS.every((k) => typeof judge[k] === "boolean");
}

export function normalizeThreshold(raw: unknown): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0 || n > 1) return DEFAULT_CONFIDENCE_THRESHOLD;
  return n;
}

/**
 * Verificabilidade genérica do padrão, derivada apenas das condições extraídas —
 * nunca de palavras específicas.
 */
export function normalizeVerifiability(parsed: any): {
  visual_verifiability: Verifiability;
  required_evidence_count: number;
  unverifiable_conditions: string[];
  suggested_photos: string[];
} {
  const unverifiable = strList(parsed?.unverifiable_conditions, 6);
  const conditions = strList(parsed?.conditions, 6);
  const suggested = strList(parsed?.suggested_photos, 4);
  const raw = String(parsed?.visual_verifiability ?? "").trim();
  let level: Verifiability =
    raw === "verifiable" || raw === "partially_verifiable" || raw === "not_verifiable"
      ? (raw as Verifiability)
      : "partially_verifiable";

  if (unverifiable.length > 0 && level === "verifiable") level = "partially_verifiable";
  if (conditions.length > 0 && unverifiable.length >= conditions.length) level = "not_verifiable";

  let count = Number(parsed?.required_evidence_count);
  if (!Number.isFinite(count) || count < 1) count = 1;
  count = Math.min(Math.round(count), 4);
  if (level !== "verifiable" && count < 2) count = 2;

  return {
    visual_verifiability: level,
    required_evidence_count: count,
    unverifiable_conditions: unverifiable,
    suggested_photos: suggested.length ? suggested : level === "verifiable" ? [] : conditions.slice(0, 2),
  };
}

/** Um padrão só pode ser liberado quando toda condição é comprovável por foto. */
export function canRelease(verifiability: Verifiability | null | undefined): boolean {
  return verifiability === "verifiable";
}

export function combine(
  observer: ObserverFacts,
  judge: any,
  options: { confidenceThreshold?: number; verifiability?: Verifiability } = {},
): Combined {
  const threshold = normalizeThreshold(options.confidenceThreshold);
  const confidence = typeof judge?.confidence === "number" && Number.isFinite(judge.confidence)
    ? judge.confidence
    : null;
  const base = { condition_status: null as ConditionStatus | null, confidence, confidence_threshold: threshold };

  // JSON incompleto/inválido nunca aprova.
  if (!judgeJsonComplete(judge)) {
    return {
      ...base,
      decision: "uncertain",
      reason_code: "invalid_judge_response",
      public_message: LOW_CONFIDENCE_MESSAGE,
      gate: {},
    };
  }

  // Padrão que a foto não consegue comprovar por completo nunca aprova.
  if (options.verifiability === "not_verifiable") {
    return {
      ...base,
      decision: "uncertain",
      reason_code: "standard_not_verifiable",
      public_message: NOT_OBSERVABLE_MESSAGE,
      condition_status: "not_observable",
      gate: {},
    };
  }



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
    confidence_sufficient: confidence !== null && confidence >= threshold,
  };

  // Honestidade visual: nada que a foto não mostre pode ser dado como verificado.
  if (status === "not_observable") {
    return {
      ...base,
      decision: "uncertain",
      reason_code: "not_observable",
      public_message: NOT_OBSERVABLE_MESSAGE,
      condition_status: status,
      gate,
    };
  }

  // Discordância explícita entre observador e juiz → incerto, nunca aprovação.
  const observerNegative = !observer.targetVisible || observer.dark || observer.blurry ||
    observer.overexposed || observer.cropped;
  if (judge.decision === "approved" && observerNegative) {
    return {
      ...base,
      decision: "uncertain",
      reason_code: "models_disagree",
      public_message: "Não deu para confirmar. Tire outra foto com melhor enquadramento.",
      condition_status: status,
      gate,
    };
  }

  if (judge.decision === "uncertain") {
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
        ...base,
        decision: "retake",
        reason_code: determinate,
        public_message: RETAKE_MESSAGES[determinate],
        condition_status: status,
        gate,
      };
    }
    return {
      ...base,
      decision: "uncertain",
      reason_code: "insufficient_evidence",
      public_message: "Não deu para confirmar. Tire outra foto com melhor enquadramento.",
      condition_status: status,
      gate,
    };
  }

  // Confiança ausente ou abaixo do threshold nunca aprova.
  if (judge.decision === "approved" && !gate.confidence_sufficient) {
    return {
      ...base,
      decision: "uncertain",
      reason_code: confidence === null ? "confidence_missing" : "confidence_below_threshold",
      public_message: LOW_CONFIDENCE_MESSAGE,
      condition_status: status,
      gate,
    };
  }

  // Verificação parcial: uma foto só não basta para dar como cumprido.
  if (options.verifiability === "partially_verifiable" && Object.values(gate).every(Boolean)) {
    return {
      ...base,
      decision: "uncertain",
      reason_code: "needs_more_evidence",
      public_message: NOT_OBSERVABLE_MESSAGE,
      condition_status: status,
      gate,
    };
  }

  if (Object.values(gate).every(Boolean)) {

    return {
      ...base,
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
    ...base,
    decision: "retake",
    reason_code: code,
    public_message: RETAKE_MESSAGES[code] ?? sanitizeMessage(judge.public_message, "Tire outra foto."),
    condition_status: status,
    gate,
  };
}

/** Falha técnica: contrato fixo, nunca aprovação. */
export function technicalFailure(reasonCode: string, threshold = DEFAULT_CONFIDENCE_THRESHOLD): Combined {
  return {
    decision: "technical_failure",
    reason_code: /^[a-z0-9_]{1,40}$/.test(reasonCode) ? reasonCode : "service_unavailable",
    public_message: "Não foi possível verificar agora. Tente novamente.",
    condition_status: null,
    gate: {},
    confidence: null,
    confidence_threshold: threshold,
  };
}
