// Validação da Fase 3A SEM inferência real: nenhuma imagem, nenhuma rede.
// Comprova que o servidor decide e nunca obedece a `suggested_decision`.

import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { decideGemini, isSpeculative, validateGeminiPayload } from "./gemini-gate.ts";
import { buildGeminiUsageEntry, geminiCostUsd, meterTotals } from "./usage.ts";
import { buildInstruction, GEMINI_RESPONSE_SCHEMA } from "./providers/gemini.ts";
import { normalizeProvider } from "./providers/vision-provider.ts";

const good = {
  target_visible: true,
  target_confidence: 0.97,
  image_quality: "good",
  reference_comparable: true,
  conditions: [
    { condition: "bancada sem resíduos", status: "verified", confidence: 0.96, visible_evidence: "a bancada está vazia e sem manchas" },
  ],
  overall_confidence: 0.95,
  suggested_decision: "approved",
  public_message: "Foto aprovada.",
};

Deno.test("payload completo é aceito e aprova", () => {
  const p = validateGeminiPayload(good)!;
  assert(p);
  const v = decideGemini(p, { hasReference: true });
  assertEquals(v.decision, "approved");
  assertEquals(v.overridden, false);
});

Deno.test("campo faltando invalida o contrato", () => {
  const { target_confidence: _omit, ...rest } = good as Record<string, unknown>;
  assertEquals(validateGeminiPayload(rest), null);
});

Deno.test("servidor rejeita suggested_decision inconsistente", () => {
  const p = validateGeminiPayload({ ...good, overall_confidence: 0.55 })!;
  const v = decideGemini(p, { hasReference: true });
  assert(v.decision !== "approved");
  assertEquals(v.overridden, true);
});

Deno.test("confiança abaixo do limiar nunca aprova", () => {
  const p = validateGeminiPayload({ ...good, target_confidence: 0.7 })!;
  assertEquals(decideGemini(p, { hasReference: true }).decision, "uncertain");
});

Deno.test("evidência especulativa nunca aprova", () => {
  assert(isSpeculative("a bancada provavelmente está limpa"));
  const p = validateGeminiPayload({
    ...good,
    conditions: [{ ...good.conditions[0], visible_evidence: "parece limpa" }],
  })!;
  assert(decideGemini(p, { hasReference: true }).decision !== "approved");
});

Deno.test("condição não observável não aprova nem reprova", () => {
  const p = validateGeminiPayload({
    ...good,
    conditions: [{ ...good.conditions[0], status: "not_observable" }],
  })!;
  const v = decideGemini(p, { hasReference: true });
  assertEquals(v.decision, "uncertain");
  assertEquals(v.condition_status, "not_observable");
});

Deno.test("imagem ruim sempre pede nova foto", () => {
  for (const [q, code] of [["dark", "too_dark"], ["blurry", "blurry"], ["cropped", "bad_framing"]]) {
    const p = validateGeminiPayload({ ...good, image_quality: q })!;
    const v = decideGemini(p, { hasReference: true });
    assertEquals(v.decision, "retake");
    assertEquals(v.reason_code, code);
  }
});

Deno.test("referência incomparável bloqueia aprovação", () => {
  const p = validateGeminiPayload({ ...good, reference_comparable: false })!;
  assertEquals(decideGemini(p, { hasReference: true }).decision, "uncertain");
});

Deno.test("as duas imagens são identificadas na instrução", () => {
  const text = buildInstruction({ question: "A pia está limpa?", profile: null, conditions: [], hasReference: true });
  assert(text.includes("REFERENCE"));
  assert(text.includes("CANDIDATE"));
  assert(!text.includes("base64"));
});

Deno.test("schema exige os campos do contrato", () => {
  for (const k of ["target_visible", "target_confidence", "image_quality", "conditions", "overall_confidence"]) {
    assert((GEMINI_RESPONSE_SCHEMA.required as readonly string[]).includes(k));
  }
});

Deno.test("telemetria separa tokens de neurônios", () => {
  const entry = buildGeminiUsageEntry({
    step: "gemini_evaluate",
    model: "gemini-3.6-flash",
    tokens: { input: 1000, output: 200, cached: 0 },
    inferenceMs: 900,
  });
  assertEquals(entry.provider, "google_gemini");
  assertEquals(entry.neurons, null);
  assert((entry.costUsd ?? 0) > 0);
  const totals = meterTotals([entry]);
  assertEquals(totals.neurons, null);
  assertEquals(totals.providers.length, 1);
  assert(geminiCostUsd({ input: 1000, output: 200, cached: 0 }) > 0);
});

Deno.test("provedor nunca é definido livremente pelo cliente", () => {
  assertEquals(normalizeProvider("qualquer-coisa"), "google_gemini");
  assertEquals(normalizeProvider("cloudflare"), "cloudflare");
});
