import { CameraVerification, Decision, VerificationResult } from './schema';

export function evaluateGate(analysis: CameraVerification): VerificationResult {
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

  const isApproved = 
    analysis.target_visible === true &&
    analysis.target_identity_confidence >= 0.90 &&
    analysis.condition_observable === true &&
    analysis.condition_met === true &&
    analysis.image_quality_usable === true &&
    analysis.positive_visible_evidence.length > 0 &&
    analysis.contradictions.length === 0 &&
    analysis.overall_confidence >= 0.90;

  const sanitizedMessage = sanitizeMessage(analysis.user_message, isApproved);

  if (isApproved) {
    return {
      ok: true,
      decision: 'approved',
      code: 'verified',
      message: sanitizedMessage,
      evidence: analysis.positive_visible_evidence.join(', ').substring(0, 500)
    };
  }

  // Mapeamento Fail-Closed
  let code = 'retake_required';
  let message = sanitizedMessage;

  // Objeto ausente ou incorreto
  if (!analysis.target_visible || analysis.target_identity_confidence < 0.90) {
    return {
      ok: true,
      decision: 'retake',
      code: 'target_missing',
      message: sanitizedMessage,
      evidence: analysis.negative_visible_evidence.join(', ')
    };
  }

  // Qualidade insuficiente
  if (!analysis.image_quality_usable) {
    return {
      ok: true,
      decision: 'retake',
      code: 'quality_failure',
      message: sanitizedMessage,
      evidence: analysis.negative_visible_evidence.join(', ')
    };
  }

  // Condição não observável ou impossível de verificar
  if (!analysis.condition_observable || analysis.contradictions.length > 0 || analysis.positive_visible_evidence.length === 0) {
    return {
      ok: true,
      decision: 'not_observable',
      code: 'not_observable',
      message: sanitizedMessage,
      evidence: [...analysis.negative_visible_evidence, ...analysis.contradictions].join(', ')
    };
  }

  // Condição visivelmente não atendida
  if (analysis.condition_met === false) {
    return {
      ok: true,
      decision: 'retake',
      code: 'condition_not_met',
      message: sanitizedMessage,
      evidence: analysis.negative_visible_evidence.join(', ')
    };
  }

  // Fallback para Retake (Baixa confiança ou outros motivos)
  return {
    ok: true,
    decision: 'retake',
    code: 'uncertain',
    message: sanitizedMessage,
    evidence: analysis.overall_confidence.toString()
  };
}