import { CameraVerification, Decision, VerificationResult } from './schema';

export function evaluateGate(analysis: CameraVerification): VerificationResult {
  const isApproved = 
    analysis.target_visible === true &&
    analysis.target_identity_confidence >= 0.90 &&
    analysis.condition_observable === true &&
    analysis.condition_met === true &&
    analysis.image_quality_usable === true &&
    analysis.positive_visible_evidence.length > 0 &&
    analysis.contradictions.length === 0 &&
    analysis.overall_confidence >= 0.90;

  if (isApproved) {
    return {
      ok: true,
      decision: 'approved',
      code: 'verified',
      message: analysis.user_message || 'Foto verificada com sucesso.',
      evidence: analysis.positive_visible_evidence.join(', ').substring(0, 500)
    };
  }

  // Mapeamento Fail-Closed
  let code = 'retake_required';
  let message = analysis.user_message || 'É necessário tirar outra foto.';

  // Objeto ausente ou incorreto
  if (!analysis.target_visible || analysis.target_identity_confidence < 0.90) {
    return {
      ok: true,
      decision: 'retake',
      code: 'target_missing',
      message: analysis.user_message || 'O objeto solicitado não foi identificado na foto.',
      evidence: analysis.negative_visible_evidence.join(', ')
    };
  }

  // Qualidade insuficiente
  if (!analysis.image_quality_usable) {
    return {
      ok: true,
      decision: 'retake',
      code: 'quality_failure',
      message: analysis.user_message || 'A qualidade da foto não é suficiente. Procure iluminação e nitidez.',
      evidence: analysis.negative_visible_evidence.join(', ')
    };
  }

  // Condição não observável ou impossível de verificar
  if (!analysis.condition_observable || analysis.contradictions.length > 0 || analysis.positive_visible_evidence.length === 0) {
    return {
      ok: true,
      decision: 'not_observable',
      code: 'not_observable',
      message: analysis.user_message || 'Não foi possível confirmar a condição. Tente mostrar o item completo.',
      evidence: [...analysis.negative_visible_evidence, ...analysis.contradictions].join(', ')
    };
  }

  // Condição visivelmente não atendida
  if (analysis.condition_met === false) {
    return {
      ok: true,
      decision: 'retake',
      code: 'condition_not_met',
      message: analysis.user_message || 'A condição solicitada não foi atendida.',
      evidence: analysis.negative_visible_evidence.join(', ')
    };
  }

  // Fallback para Retake (Baixa confiança ou outros motivos)
  return {
    ok: true,
    decision: 'retake',
    code: 'uncertain',
    message: analysis.user_message || 'A foto não é conclusiva. Tente novamente.',
    evidence: analysis.overall_confidence.toString()
  };
}