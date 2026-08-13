import { CameraAIStructuredOutput, CameraAIVerifyResult } from "./types";

/**
 * Deterministic Gate: Decides if the analysis result is a solid "approved"
 */
export function evaluateGate(
  analysis: CameraAIStructuredOutput,
  requestId: string
): CameraAIVerifyResult {
  const isApproved =
    analysis.target_present === true &&
    analysis.condition_observable === true &&
    analysis.condition_met === true &&
    analysis.image_quality_usable === true &&
    analysis.confidence >= 0.9 &&
    analysis.model_decision === "approved" &&
    !!analysis.visible_evidence &&
    !containsSpeculativeLanguage(analysis.visible_evidence);

  if (isApproved) {
    return {
      ok: true,
      decision: "approved",
      message: analysis.user_message,
      confidence: analysis.confidence,
      requestId,
    };
  }

  // Mapping logic
  let decision: CameraAIVerifyResult["decision"] = "retake";
  
  if (analysis.condition_observable === false || analysis.model_decision === "not_observable") {
    decision = "not_observable";
  }

  return {
    ok: true, // Verification happened, even if decision is not approved
    decision,
    message: analysis.user_message,
    confidence: analysis.confidence,
    requestId,
  };
}

function containsSpeculativeLanguage(text: string): boolean {
  const speculativeTerms = [
    "parece",
    "provavelmente",
    "talvez",
    "pode ser",
    "presumo",
    "imagino",
    "possível",
    "seems",
    "probably",
    "maybe",
    "likely",
  ];
  const lowerText = text.toLowerCase();
  return speculativeTerms.some((term) => lowerText.includes(term));
}
