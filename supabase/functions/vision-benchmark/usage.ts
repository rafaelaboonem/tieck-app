// Medição de consumo (tokens → neurônios) do Workers AI.
// Módulo puro: importável pelo handler Deno e pelos testes unitários.

/**
 * Tabela pública do Workers AI — NEURÔNIOS POR MILHÃO DE TOKENS.
 * Valores literais, nunca em escala reduzida.
 */
export const NEURON_RATES: Record<string, { input: number; output: number }> = {
  "@cf/moondream/moondream3.1-9B-A2B": { input: 27273, output: 90909 },
  "@cf/meta/llama-4-scout-17b-16e-instruct": { input: 24545, output: 77273 },
};
export const NEURON_FALLBACK = { input: 27273, output: 90909 };

/** Franquia diária gratuita da conta Cloudflare (neurônios/dia). */
export const FREE_DAILY_NEURONS = 10_000;
/** Preço de tabela por 1.000 neurônios — valor teórico, não faturado. */
export const USD_PER_1K_NEURONS = 0.011;

export type UsageEntry = {
  step: string;
  model: string;
  /** null quando o provedor não devolveu usage — nunca zero silencioso. */
  inputTokens: number | null;
  outputTokens: number | null;
  neurons: number | null;
  usageMissing: boolean;
  inferenceMs: number;
};

export type UsageTotals = {
  calls: number;
  inputTokens: number | null;
  outputTokens: number | null;
  neurons: number | null;
  usageMissing: boolean;
  theoreticalUsd: number | null;
  freeDailyNeurons: number;
  steps: UsageEntry[];
};

/** Lê o usage do envelope do Cloudflare. Retorna null quando ausente. */
export function usageTokens(payload: unknown): { input: number; output: number } | null {
  const p = payload as Record<string, any> | null;
  const u = p?.result?.usage ?? p?.usage ?? null;
  if (!u || typeof u !== "object") return null;
  const n = (...keys: string[]): number | null => {
    for (const k of keys) {
      const v = (u as Record<string, unknown>)[k];
      if (typeof v === "number" && Number.isFinite(v) && v >= 0) return Math.round(v);
    }
    return null;
  };
  const input = n("prompt_tokens", "input_tokens");
  const output = n("completion_tokens", "output_tokens");
  if (input === null && output === null) return null;
  return { input: input ?? 0, output: output ?? 0 };
}

export function neuronsFor(model: string, input: number, output: number): number {
  const rate = NEURON_RATES[model] ?? NEURON_FALLBACK;
  const neurons = (input / 1_000_000) * rate.input + (output / 1_000_000) * rate.output;
  return Math.round(neurons * 1000) / 1000;
}

export function buildUsageEntry(step: string, model: string, payload: unknown, ms: number): UsageEntry {
  const tokens = usageTokens(payload);
  if (!tokens) {
    return {
      step, model,
      inputTokens: null, outputTokens: null, neurons: null,
      usageMissing: true, inferenceMs: ms,
    };
  }
  return {
    step,
    model,
    inputTokens: tokens.input,
    outputTokens: tokens.output,
    neurons: neuronsFor(model, tokens.input, tokens.output),
    usageMissing: false,
    inferenceMs: ms,
  };
}

export function failedUsageEntry(step: string, model: string, ms: number): UsageEntry {
  return {
    step: `${step}_failed`, model,
    inputTokens: null, outputTokens: null, neurons: null,
    usageMissing: true, inferenceMs: ms,
  };
}

export function meterTotals(meter: UsageEntry[]): UsageTotals {
  const known = meter.filter((m) => !m.usageMissing);
  const usageMissing = meter.some((m) => m.usageMissing && !m.step.endsWith("_failed"));
  const inputTokens = known.reduce((a, m) => a + (m.inputTokens ?? 0), 0);
  const outputTokens = known.reduce((a, m) => a + (m.outputTokens ?? 0), 0);
  const neurons = Math.round(known.reduce((a, m) => a + (m.neurons ?? 0), 0) * 1000) / 1000;
  return {
    calls: meter.filter((m) => !m.step.endsWith("_failed")).length,
    inputTokens: known.length ? inputTokens : null,
    outputTokens: known.length ? outputTokens : null,
    neurons: known.length ? neurons : null,
    usageMissing,
    // Valor computacional teórico — o faturamento real depende do consumo
    // diário total da conta Cloudflare e da franquia gratuita.
    theoreticalUsd: known.length ? Math.round((neurons / 1000) * USD_PER_1K_NEURONS * 1e6) / 1e6 : null,
    freeDailyNeurons: FREE_DAILY_NEURONS,
    steps: meter,
  };
}
