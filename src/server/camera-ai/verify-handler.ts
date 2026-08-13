import { VerifyPayload, Decision, VerificationResult, PublishedBlock } from './schema';
import { validateImageBuffer } from './image-validation';
import { evaluateGate } from './gate';

export interface VerifyDependencies {
  mode: string;
  openai: any; // Using any for simplicity in mock injection, but typed as OpenAI in real usage
  model: string;
  supabaseAdmin: any;
  now: () => Date;
  resolveSession: (token: string) => Promise<{ data: any; error: any }>;
  claimAttempt: (params: { responseId: string; blockId: string; idempotencyKey: string }) => Promise<{ data: any; error: any }>;
  hitRateLimit: (responseId: string) => Promise<{ data: any; error: any }>;
  analyzeImage: (openai: any, model: string, question: string, buffer: ArrayBuffer, mimeType: string) => Promise<any>;
  markFailed: (params: { responseId: string; blockId: string; idempotencyKey: string; code: string }) => Promise<any>;
  markCompleted: (params: {
    responseId: string;
    blockId: string;
    idempotencyKey: string;
    decision: Decision;
    code: string;
    evidence?: string;
    model: string;
    durationMs: number;
    at: Date;
  }) => Promise<{ data: any; error: any }>;
}

export async function verifyCameraRequest(
  payload: VerifyPayload,
  imageFile: { buffer: ArrayBuffer; type: string },
  deps: VerifyDependencies
): Promise<{ status: number; body: VerificationResult | { ok: false; code: string; message?: string } }> {
  // 1. CAMERA_AI_MODE
  if (deps.mode !== 'enabled') {
    return { 
      status: 503, 
      body: { ok: false, code: 'camera_ai_disabled', message: 'IA desativada.' } 
    };
  }

  // 2. Server-only config verification (should be passed by deps)
  if (!deps.supabaseAdmin) {
    return { 
      status: 503, 
      body: { ok: false, code: 'config_missing', message: 'Configuração do servidor ausente.' } 
    };
  }

  // 4. Binary Image Validation
  const imgVal = await validateImageBuffer(imageFile.buffer, imageFile.type);
  if (!imgVal.valid) {
    return { 
      status: 400, 
      body: { ok: false, code: imgVal.code || 'invalid', message: imgVal.message || '' } 
    };
  }

  // 5. Session Hash & Expiration
  const { data: sessionData, error: sessionError } = await deps.resolveSession(payload.responseToken);
  if (sessionError || !sessionData || !sessionData.length) {
    return { 
      status: 401, 
      body: { ok: false, code: 'unauthorized', message: 'Sessão inválida ou expirada.' } 
    };
  }
  const session = sessionData[0];

  // 6. Checklist & Block Validation
  if (session.checklist_id !== payload.checklistId) {
    return { 
      status: 403, 
      body: { ok: false, code: 'id_mismatch' } 
    };
  }

  const blocks: PublishedBlock[] = session.published_content?.blocks || [];
  const block = blocks.find((b) => b.id === payload.blockId);

  if (!block || block.type !== 'camera') {
    return { 
      status: 404, 
      body: { ok: false, code: 'invalid_block' } 
    };
  }

  const question = (String(block.title || '') + ' ' + String(block.description || '')).trim();

  // 7 & 8. Replay & Atomic Claim
  const { data: claimData, error: claimError } = await deps.claimAttempt({
    responseId: session.response_id,
    blockId: payload.blockId,
    idempotencyKey: payload.idempotencyKey
  });

  if (claimError || !claimData || !claimData.length) {
    return { 
      status: 500, 
      body: { ok: false, code: 'technical_failure' } 
    };
  }

  const claim = claimData[0];

  // Replay Completed
  if (claim.claim_status === 'completed') {
    return {
      status: 200,
      body: {
        ok: true,
        decision: claim.existing_decision as Decision,
        code: claim.existing_code,
        message: 'Replay da decisão anterior.',
        evidence: claim.existing_evidence
      }
    };
  }

  // Concurrent Processing
  if (claim.claim_status === 'processing') {
    return { 
      status: 409, 
      body: { ok: false, code: 'processing_conflict' } 
    };
  }

  if (claim.claim_status !== 'acquired') {
    return { 
      status: 500, 
      body: { ok: false, code: 'technical_failure' } 
    };
  }

  // 9. Rate Limit (for truly new attempts)
  const { data: limitData, error: limitError } = await deps.hitRateLimit(session.response_id);
  if (limitError || !limitData || !limitData[0]?.allowed) {
    await deps.markFailed({
      responseId: session.response_id,
      blockId: payload.blockId,
      idempotencyKey: payload.idempotencyKey,
      code: 'rate_limit'
    });
    return { 
      status: 429, 
      body: { ok: false, code: 'rate_limit', message: 'Muitas tentativas.' } 
    };
  }

  // 10. OpenAI
  const startTime = deps.now().getTime();
  let analysis;
  try {
    analysis = await deps.analyzeImage(deps.openai, deps.model, question, imageFile.buffer, imgVal.mimeType || '');
  } catch (aiError) {
    await deps.markFailed({
      responseId: session.response_id,
      blockId: payload.blockId,
      idempotencyKey: payload.idempotencyKey,
      code: 'provider_failure'
    });
    throw aiError;
  }

  const duration = deps.now().getTime() - startTime;
  
  // 11. Gate
  const result = evaluateGate(analysis);

  // 12. Final Persistence Confirmation
  const { data: finalUpdate, error: finalError } = await deps.markCompleted({
    responseId: session.response_id,
    blockId: payload.blockId,
    idempotencyKey: payload.idempotencyKey,
    decision: result.decision,
    code: result.code,
    evidence: result.evidence,
    model: deps.model,
    durationMs: duration,
    at: deps.now()
  });

  if (finalError || !finalUpdate) {
    return { 
      status: 500, 
      body: { 
        ok: false, 
        decision: 'technical_failure', 
        code: 'persistence_error',
        message: 'Falha ao confirmar persistência.'
      } 
    };
  }

  // 13. Sanitized Response
  return { status: 200, body: result };
}
