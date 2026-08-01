// Medição de consumo por provedor.
// Módulo puro: importável pelo handler Deno e pelos testes unitários.
//
// Cloudflare mede em NEURÔNIOS. Gemini mede em TOKENS com preço por milhão.
// As duas contabilidades nunca são somadas na mesma métrica.

import type { VisionProvider } from "./providers/vision-provider.ts";

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

/** Preço teórico do Gemini em USD por 1 milhão de tokens (configurável). */
export type TokenRate = { input: number; output: number; cached: number };
export const GEMINI_DEFAULT_RATE: TokenRate = { input: 0.3, output: 2.5, cached: 0.075 };

export type UsageEntry = {
  step: string;
  provider: VisionProvider;
  model: string;
  /** null quando o provedor não devolveu usage — nunca zero silencioso. */
  inputTokens: number | null;
  outputTokens: number | null;
  cachedTokens: number | null;
  /** Somente Cloudflare. */
  neurons: number | null;
  /** Custo teórico em USD (Gemini) — Cloudflare usa neurônios. */
  costUsd: number | null;
  usageMissing: boolean;
  inferenceMs: number;
};

export type ProviderTotals = {
  provider: VisionProvider;
  calls: number;
  inputTokens: number | null;
  outputTokens: number | null;
  cachedTokens: number | null;
  neurons: number | null;
  costUsd: number | null;
  inferenceMs: number;
};

export type UsageTotals = {
  calls: number;
  inputTokens: number | null;
  outputTokens: number | null;
  cachedTokens: number | null;
  neurons: number | null;
  costUsd: number | null;
  usageMissing: boolean;
  theoreticalUsd: number | null;
  freeDailyNeurons: number;
  steps: UsageEntry[];
  providers: ProviderTotals[];
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

/** Custo teórico do Gemini a partir da tabela configurável. */
export function geminiCostUsd(
  tokens: { input: number; output: number; cached: number },
  rate: TokenRate = GEMINI_DEFAULT_RATE,
): number {
  const billableInput = Math.max(0, tokens.input - tokens.cached);
  const usd = (billableInput / 1e6) * rate.input +
    (tokens.cached / 1e6) * rate.cached +
    (tokens.output / 1e6) * rate.output;
  return Math.round(usd * 1e8) / 1e8;
}

export function buildUsageEntry(step: string, model: string, payload: unknown, ms: number): UsageEntry {
  const tokens = usageTokens(payload);
  if (!tokens) {
    return {
      step, provider: "cloudflare", model,
      inputTokens: null, outputTokens: null, cachedTokens: null,
      neurons: null, costUsd: null,
      usageMissing: true, inferenceMs: ms,
    };
  }
  return {
    step,
    provider: "cloudflare",
    model,
    inputTokens: tokens.input,
    outputTokens: tokens.output,
    cachedTokens: null,
    neurons: neuronsFor(model, tokens.input, tokens.output),
    costUsd: null,
    usageMissing: false,
    inferenceMs: ms,
  };
}

/** Entrada de consumo do Gemini (tokens + custo teórico, nunca neurônios). */
export function buildGeminiUsageEntry(args: {
  step: string;
  model: string;
  tokens: { input: number; output: number; cached: number } | null;
  inferenceMs: number;
  rate?: TokenRate;
}): UsageEntry {
  if (!args.tokens) {
    return {
      step: args.step, provider: "google_gemini", model: args.model,
      inputTokens: null, outputTokens: null, cachedTokens: null,
      neurons: null, costUsd: null,
      usageMissing: true, inferenceMs: args.inferenceMs,
    };
  }
  return {
    step: args.step,
    provider: "google_gemini",
    model: args.model,
    inputTokens: args.tokens.input,
    outputTokens: args.tokens.output,
    cachedTokens: args.tokens.cached,
    neurons: null,
    costUsd: geminiCostUsd(args.tokens, args.rate),
    usageMissing: false,
    inferenceMs: args.inferenceMs,
  };
}

export function failedUsageEntry(
  step: string,
  model: string,
  ms: number,
  provider: VisionProvider = "cloudflare",
): UsageEntry {
  return {
    step: `${step}_failed`, provider, model,
    inputTokens: null, outputTokens: null, cachedTokens: null,
    neurons: null, costUsd: null,
    usageMissing: true, inferenceMs: ms,
  };
}

function sum(entries: UsageEntry[], key: "inputTokens" | "outputTokens" | "cachedTokens" | "neurons" | "costUsd") {
  return entries.reduce((a, m) => a + (m[key] ?? 0), 0);
}

function providerTotals(provider: VisionProvider, entries: UsageEntry[]): ProviderTotals {
  const known = entries.filter((m) => !m.usageMissing);
  return {
    provider,
    calls: entries.filter((m) => !m.step.endsWith("_failed")).length,
    inputTokens: known.length ? sum(known, "inputTokens") : null,
    outputTokens: known.length ? sum(known, "outputTokens") : null,
    cachedTokens: known.length ? sum(known, "cachedTokens") : null,
    neurons: known.length ? Math.round(sum(known, "neurons") * 1000) / 1000 : null,
    costUsd: known.length ? Math.round(sum(known, "costUsd") * 1e8) / 1e8 : null,
    inferenceMs: entries.reduce((a, m) => a + m.inferenceMs, 0),
  };
}

export function meterTotals(meter: UsageEntry[]): UsageTotals {
  const known = meter.filter((m) => !m.usageMissing);
  const usageMissing = meter.some((m) => m.usageMissing && !m.step.endsWith("_failed"));
  const neurons = Math.round(sum(known, "neurons") * 1000) / 1000;
  const costUsd = Math.round(sum(known, "costUsd") * 1e8) / 1e8;
  const providers = [...new Set(meter.map((m) => m.provider))]
    .map((p) => providerTotals(p, meter.filter((m) => m.provider === p)));
  return {
    calls: meter.filter((m) => !m.step.endsWith("_failed")).length,
    inputTokens: known.length ? sum(known, "inputTokens") : null,
    outputTokens: known.length ? sum(known, "outputTokens") : null,
    cachedTokens: known.length ? sum(known, "cachedTokens") : null,
    neurons: known.length ? neurons : null,
    costUsd: known.length ? costUsd : null,
    usageMissing,
    // Valor computacional teórico do Cloudflare — o faturamento real depende do
    // consumo diário total da conta e da franquia gratuita.
    theoreticalUsd: known.length ? Math.round((neurons / 1000) * USD_PER_1K_NEURONS * 1e6) / 1e6 : null,
    freeDailyNeurons: FREE_DAILY_NEURONS,
    steps: meter,
    providers,
  };
}
