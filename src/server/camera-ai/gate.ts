import { CameraVerification, CameraReferenceVerification, VerificationResult } from './schema';

export function evaluateGate(analysis: CameraVerification | CameraReferenceVerification): VerificationResult {
  // 1. Sanitize user_message
  const sanitizeMessage = (msg: string, isApproved: boolean): string => {
    if (!msg) return isApproved ? 'Foto verificada com sucesso.' : 'É necessário tirar outra foto.';
    
    // Remove technical jargon, model names, JSON-like structures, and markdown
    let clean = msg
      .replace(/\{.*\}/g, '') // remove JSON
      .replace(/gpt-[a-z0-9-]+|openai|claude|gemini|deepseek/gi, '') // remove model names
      .replace(/[\*\_\`\#]/g, '') // remove markdown
      .replace(/\s+/g, ' ')
      .trim();
    
    // Limit to 240 chars
    if (clean.length > 240) {
      clean = clean.substring(0, 237) + '...';
    }
    
    return clean || (isApproved ? 'Foto verificada com sucesso.' : 'É necessário tirar outra foto.');
  };

  const v = analysis;

  // 2. Reference mode specific logic
  const isReferenceMode = 'reference_match' in v;
  const referencePassed = isReferenceMode 
    ? (v.reference_match === true && v.reference_match_confidence >= 0.90)
    : true;

  const isApproved = 
    referencePassed &&
    v.target_visible === true &&
    v.target_identity_confidence >= 0.90 &&
    v.condition_observable === true &&
    v.condition_met === true &&
    v.image_quality_usable === true &&
    v.positive_visible_evidence.length > 0 &&
    v.contradictions.length === 0 &&
    v.overall_confidence >= 0.90;

  const sanitizedMessage = sanitizeMessage(v.user_message, isApproved);

  if (isApproved) {
    return {
      ok: true,
      decision: 'approved',
      code: 'verified',
      message: sanitizedMessage,
      evidence: v.positive_visible_evidence.join(', ').substring(0, 500)
    };
  }

  // 3. Fail-Closed Mapping

  // Reference mismatch
  if (isReferenceMode && (!v.reference_match || v.reference_match_confidence < 0.90)) {
    return {
      ok: true,
      decision: 'retake',
      code: 'reference_mismatch',
      message: sanitizedMessage,
      evidence: v.reference_differences?.join(', ') || 'A foto não coincide com o padrão de referência esperado.'
    };
  }

  // Objeto ausente ou incorreto
  if (!v.target_visible || v.target_identity_confidence < 0.90) {
    return {
      ok: true,
      decision: 'retake',
      code: 'target_missing',
      message: sanitizedMessage,
      evidence: v.negative_visible_evidence.join(', ')
    };
  }

  // Qualidade insuficiente
  if (!v.image_quality_usable) {
    return {
      ok: true,
      decision: 'retake',
      code: 'quality_failure',
      message: sanitizedMessage,
      evidence: v.negative_visible_evidence.join(', ')
    };
  }

  // Condição não observável ou impossível de verificar
  if (!v.condition_observable || v.contradictions.length > 0 || v.positive_visible_evidence.length === 0) {
    return {
      ok: true,
      decision: 'not_observable',
      code: 'not_observable',
      message: sanitizedMessage,
      evidence: [...v.negative_visible_evidence, ...v.contradictions].join(', ')
    };
  }

  // Condição visivelmente não atendida
  if (v.condition_met === false) {
    return {
      ok: true,
      decision: 'retake',
      code: 'condition_not_met',
      message: sanitizedMessage,
      evidence: v.negative_visible_evidence.join(', ')
    };
  }

  // Fallback para Retake (Baixa confiança ou outros motivos)
  return {
    ok: true,
    decision: 'retake',
    code: 'uncertain',
    message: sanitizedMessage,
    evidence: v.overall_confidence.toString()
  };
}
