import { VerifyPayload, Decision, VerificationResult, PublishedBlock, CameraVerification } from './schema';
import { validateImageBuffer } from './image-validation';
import { evaluateGate } from './gate';

export interface PublicSession {
  response_id: string;
  checklist_id: string;
  workspace_id: string;
  status: string;
  published_content: {
    blocks: PublishedBlock[];
  };
}

export interface ClaimResult {
  claim_status: 'acquired' | 'processing' | 'completed' | 'failed';
  attempt_id: string;
  existing_decision?: Decision;
  existing_code?: string;
  existing_evidence?: string;
  current_retry_count: number;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining?: number;
}

export interface VerifyDependencies {
  mode: string;
  model: string;
  now: () => Date;
  resolveSession: (token: string) => Promise<{ data: PublicSession[] | null; error: unknown }>;
  claimAttempt: (params: { responseId: string; blockId: string; idempotencyKey: string }) => Promise<{ data: ClaimResult[] | null; error: unknown }>;
  hitRateLimit: (responseId: string) => Promise<{ data: RateLimitResult[] | null; error: unknown }>;
  analyzeImage: (question: string, buffer: ArrayBuffer, mimeType: string) => Promise<CameraVerification>;
  markFailed: (params: { responseId: string; blockId: string; idempotencyKey: string; code: string }) => Promise<{ data: unknown; error: unknown }>;
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
  }) => Promise<{ data: { id: string } | null; error: unknown }>;
  isConfigured: () => boolean;
}


export async function verifyCameraRequest(
  payload: VerifyPayload,
  imageFile: { buffer: ArrayBuffer; type: string },
  deps: VerifyDependencies
): Promise<{ status: number; body: VerificationResult | { ok: false; code: string; message?: string } }> {
  // requestId random para logs e resposta
  const requestId = Math.random().toString(36).substring(7);

  // 1. CAMERA_AI_MODE
  if (deps.mode !== 'enabled') {
    return { 
      status: 503, 
      body: { ok: false, code: 'camera_ai_disabled', message: 'IA desativada.', requestId } 
    };
  }

  // 2. Server-only config verification
  if (!deps.isConfigured()) {
    return { 
      status: 503, 
      body: { ok: false, code: 'config_missing', message: 'Configuração do servidor ausente.', requestId } 
    };
  }

  // 4. Binary Image Validation
  const imgVal = await validateImageBuffer(imageFile.buffer, imageFile.type);
  if (!imgVal.valid) {
    return { 
      status: 400, 
      body: { 
        ok: false, 
        code: imgVal.code || 'invalid_payload', 
        message: imgVal.message || 'Não foi possível validar os dados da foto.',
        requestId 
      } 
    };
  }
  const mimeType = imgVal.mimeType || 'image/jpeg';

  // 5. Session Hash & Expiration
  const { data: sessionData, error: sessionError } = await deps.resolveSession(payload.responseToken);
  if (sessionError || !sessionData || !sessionData.length) {
    return { 
      status: 401, 
      body: { 
        ok: false, 
        code: 'unauthorized', 
        message: 'Sua sessão expirou. Estamos iniciando uma nova.',
        requestId
      } 
    };
  }
  const session = sessionData[0];

  // 6. Checklist & Block Validation
  if (session.checklist_id !== payload.checklistId) {
    return { 
      status: 403, 
      body: { 
        ok: false, 
        code: 'id_mismatch', 
        message: 'A sessão não pertence a este checklist.',
        requestId
      } 
    };
  }

  const blocks: PublishedBlock[] = session.published_content?.blocks || [];
  const block = blocks.find((b) => b.id === payload.blockId);

  if (!block || block.type !== 'camera') {
    return { 
      status: 404, 
      body: { 
        ok: false, 
        code: 'invalid_block', 
        message: 'Este checklist foi atualizado. Recarregue a página.',
        requestId
      } 
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
        code: claim.existing_code || 'replayed',
        message: 'Replay da decisão anterior.',
        evidence: claim.existing_evidence || undefined
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
      requestId
    });
    return { 
      status: 429, 
      body: { ok: false, code: 'rate_limit', message: 'Muitas tentativas.', requestId } 
    };
  }

  // 10. OpenAI
  const startTime = deps.now().getTime();
  let analysis: CameraVerification;
  try {
    analysis = await deps.analyzeImage(question, imageFile.buffer, mimeType);
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
