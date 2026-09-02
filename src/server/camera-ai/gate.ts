import { CameraVerification, CameraReferenceVerification, VerificationResult } from './schema';

export function evaluateGate(analysis: CameraVerification | CameraReferenceVerification): VerificationResult {
  const sanitizeMessage = (msg: string, isApproved: boolean): string => {
    if (!msg) return isApproved ? 'Foto verificada com sucesso.' : 'É necessário tirar outra foto.';

    let clean = msg
      .replace(/\{.*\}/g, '')
      .replace(/gpt-[a-z0-9-]+|openai|claude|gemini|deepseek/gi, '')
      .replace(/[\*\_\`\#]/g, '')
      .replace(/\s+/g, ' ')
      .trim();

    if (clean.length > 240) {
      clean = clean.substring(0, 237) + '...';
    }

    return clean || (isApproved ? 'Foto verificada com sucesso.' : 'É necessário tirar outra foto.');
  };

  const v = analysis;
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

  if (isReferenceMode && (!v.reference_match || v.reference_match_confidence < 0.90)) {
    const relevantDifferences = v.reference_differences
      .map((difference) => sanitizeMessage(difference, false))
      .filter(Boolean);
    const evidence = relevantDifferences.join(', ');
    const firstDifference = relevantDifferences[0];

    return {
      ok: true,
      decision: 'retake',
      code: 'reference_mismatch',
      message: firstDifference
        ? `Tire outra foto. ${firstDifference}`
        : 'Tire outra foto. O resultado não corresponde aos critérios relevantes da referência.',
      evidence: evidence || 'O resultado não corresponde aos critérios relevantes da referência.'
    };
  }

  if (!v.target_visible || v.target_identity_confidence < 0.90) {
    return {
      ok: true,
      decision: 'retake',
      code: 'target_missing',
      message: sanitizedMessage,
      evidence: v.negative_visible_evidence.join(', ')
    };
  }

  if (!v.image_quality_usable) {
    return {
      ok: true,
      decision: 'retake',
      code: 'quality_failure',
      message: sanitizedMessage,
      evidence: v.negative_visible_evidence.join(', ')
    };
  }

  if (!v.condition_observable || v.contradictions.length > 0 || v.positive_visible_evidence.length === 0) {
    return {
      ok: true,
      decision: 'not_observable',
      code: 'not_observable',
      message: sanitizedMessage,
      evidence: [...v.negative_visible_evidence, ...v.contradictions].join(', ')
    };
  }

  if (v.condition_met === false) {
    return {
      ok: true,
      decision: 'retake',
      code: 'condition_not_met',
      message: sanitizedMessage,
      evidence: v.negative_visible_evidence.join(', ')
    };
  }

  return {
    ok: true,
    decision: 'retake',
    code: 'uncertain',
    message: sanitizedMessage,
    evidence: v.overall_confidence.toString()
  };
}
