import { CameraVerification, Decision, VerificationResult } from './schema';

const SPECULATIVE_TERMS = ["parece", "provavelmente", "talvez", "aparenta", "suponho", "possivelmente"];

export function evaluateGate(analysis: CameraVerification): VerificationResult {
  const evidence = analysis.visible_evidence.toLowerCase();
  const hasSpeculativeTerms = SPECULATIVE_TERMS.some(term => evidence.includes(term));

  const isApproved = 
    analysis.target_visible === true &&
    analysis.condition_observable === true &&
    analysis.condition_met === true &&
    analysis.image_quality === "usable" &&
    analysis.confidence >= 0.90 &&
    !hasSpeculativeTerms;

  if (isApproved) {
    return {
      ok: true,
      decision: 'approved',
      code: 'verified',
      message: 'Foto verificada com sucesso.',
      evidence: analysis.visible_evidence.substring(0, 200)
    };
  }

  // Rejeição conservadora (Retake) se:
  // - Alvo não visível
  // - Condição não cumprida (mas observável)
  // - Qualidade ruim
  // - Baixa confiança
  // - Termos especulativos
  if (
    !analysis.target_visible || 
    (analysis.condition_met === false && analysis.condition_observable === true) ||
    analysis.image_quality !== "usable" || 
    analysis.confidence < 0.90 || 
    hasSpeculativeTerms
  ) {
    let message = 'É necessário tirar outra foto.';
    let code = 'retake_required';

    if (analysis.image_quality === 'dark') message = 'A foto está muito escura.';
    if (analysis.image_quality === 'blurry') message = 'A foto está borrada.';
    if (analysis.image_quality === 'cropped') message = 'O objeto está cortado na foto.';
    if (hasSpeculativeTerms) message = 'A foto não é conclusiva (evidência especulativa).';
    if (!analysis.target_visible) message = 'O objeto solicitado não foi identificado na foto.';
    if (analysis.condition_met === false && analysis.condition_observable === true) message = 'A condição solicitada não foi atendida.';

    return {
      ok: true,
      decision: 'retake',
      code,
      message,
      evidence: analysis.visible_evidence.substring(0, 200)
    };
  }

  if (!analysis.condition_observable) {
    return {
      ok: true,
      decision: 'not_observable',
      code: 'not_observable',
      message: 'A condição não pôde ser observada.',
      evidence: analysis.visible_evidence.substring(0, 200)
    };
  }

  return {
    ok: true,
    decision: 'retake',
    code: 'uncertain',
    message: 'Não foi possível verificar a foto.',
    evidence: analysis.visible_evidence.substring(0, 200)
  };
}