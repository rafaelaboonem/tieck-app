// deno-lint-ignore-file no-explicit-any
import { decideGemini, GeminiPayload } from "./gemini-gate.ts";

function testCase(name: string, payload: Partial<GeminiPayload>, options: any, expectedDecision: string) {
  const fullPayload: GeminiPayload = {
    target_visible: true,
    target_confidence: 0.95,
    image_quality: "good",
    reference_comparable: true,
    overall_confidence: 0.95,
    suggested_decision: "approved",
    public_message: "Test message",
    conditions: [
      { condition: "test", status: "verified", confidence: 0.95, visible_evidence: "visible" }
    ],
    ...payload
  };
  
  const result = decideGemini(fullPayload, {
    referenceCount: 2,
    threshold: 0.9,
    standardVersion: "1",
    snapshotVersion: "1",
    ...options
  });
  
  if (result.decision === expectedDecision) {
    console.log(`✅ [PASS] ${name}`);
    return true;
  } else {
    console.error(`❌ [FAIL] ${name} | Expected: ${expectedDecision}, Got: ${result.decision} | Reason: ${result.reason_code}`);
    return false;
  }
}

console.log("Running Gate Tests...");
let passed = 0;
let total = 0;

const run = (n: string, p: any, o: any, e: string) => {
  total++;
  if (testCase(n, p, o, e)) passed++;
};

// 1. Todos os campos true + confiança 0.95 → approved
run("1. All true", {}, {}, "approved");

// 2. Foto irrelevante, target_present false, confiança 0.99 → retake
run("2. target_visible false", { target_visible: false, overall_confidence: 0.99 }, {}, "retake");

// 3. reference_match false, confiança 0.99 → retake
run("3. reference_comparable false", { reference_comparable: false, overall_confidence: 0.99 }, {}, "retake");

// 4. condition_met false (not_met), confiança 0.99 → retake
run("4. condition status not_met", { 
  conditions: [{ condition: "test", status: "not_met", confidence: 0.99, visible_evidence: "no evidence" }]
}, {}, "retake");

// 5. observable false (not_observable) → uncertain
run("5. condition status not_observable", { 
  conditions: [{ condition: "test", status: "not_observable", confidence: 0.99, visible_evidence: "hidden" }]
}, {}, "uncertain");

// 6. Confiança 0.85 (abaixo de 0.9) → retake (low_confidence)
run("6. confidence 0.85 < 0.9", { overall_confidence: 0.85 }, { threshold: 0.9 }, "retake");

// 7. visible_evidence vazio → uncertain
run("7. visible_evidence empty", { 
  conditions: [{ condition: "test", status: "verified", confidence: 0.99, visible_evidence: "" }]
}, {}, "uncertain");

// 8. Apenas uma referência → uncertain (standard_not_configured)
run("8. Only one reference", {}, { referenceCount: 1 }, "uncertain");

// 9. Versão divergente → uncertain (standard_version_mismatch)
run("9. Version mismatch", {}, { standardVersion: "2", snapshotVersion: "1" }, "uncertain");

// 10. Resposta do modelo diz approved, mas target_present false → retake
run("10. suggested approved but target false", { suggested_decision: "approved", target_visible: false }, {}, "retake");

// 11. Imagem dark → retake
run("11. image_quality dark", { image_quality: "dark" }, {}, "retake");

// 12. Especulativo em visible_evidence → uncertain
run("12. speculative evidence", {
    conditions: [{ condition: "test", status: "verified", confidence: 0.99, visible_evidence: "Parece estar limpo" }]
}, {}, "uncertain");

console.log(`\nTests completed: ${passed}/${total} passed.`);
if (passed !== total) Deno.exit(1);
