import { VerifyPayload, Decision, VerificationResult, PublishedBlock, CameraVerification, CameraVerificationPolicyV1, CameraReferenceVerification } from './schema';
import { createHash } from 'crypto';
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

/**
 * Safely extracts blocks from published_content, supporting both canonical object 
 * and legacy array formats.
 */
export function extractBlocksFromSnapshot(content: any): PublishedBlock[] {
  if (!content) return [];
  
  // 1. Legacy/Buggy format: content is the array itself
  if (Array.isArray(content)) {
    return content as PublishedBlock[];
  }
  
  // 2. Canonical format: { blocks: [...] }
  if (content && typeof content === 'object' && Array.isArray(content.blocks)) {
    return content.blocks as PublishedBlock[];
  }
  
  return [];
}

export interface ClaimResult {
  claim_status: 'acquired' | 'processing' | 'completed' | 'failed';
  attempt_id: string;
  existing_decision?: Decision;
  existing_code?: string;
  existing_evidence?: string;
  existing_evidence_id?: string;
  current_retry_count: number;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining?: number;
}

export interface VerifyDependencies {
  mode: string;
  model: string;
  requestId?: string;
  now: () => Date;
  resolveSession: (token: string) => Promise<{ data: PublicSession[] | null; error: unknown }>;
  claimAttempt: (params: { responseId: string; blockId: string; idempotencyKey: string }) => Promise<{ data: ClaimResult[] | null; error: unknown }>;
  hitRateLimit: (responseId: string) => Promise<{ data: RateLimitResult[] | null; error: unknown }>;
  analyzeImage: (question: string, buffer: ArrayBuffer, mimeType: string, policy?: CameraVerificationPolicyV1) => Promise<CameraVerification>;
  markFailed: (params: { responseId: string; blockId: string; idempotencyKey: string; code: string }) => Promise<{ data: unknown; error: unknown }>;
  markCompleted: (params: {
    responseId: string;
    blockId: string;
    idempotencyKey: string;
    decision: Decision;
    code: string;
    evidence?: string;
    evidenceId?: string;
    model: string;
    durationMs: number;
    at: Date;
  }) => Promise<{ data: { id: string } | null; error: unknown }>;
  attachEvidence: (params: {
    responseId: string;
    blockId: string;
    idempotencyKey: string;
    evidenceId: string;
  }) => Promise<{ data: { confirmed_evidence_id: string }[] | null; error: unknown }>;
  isConfigured: () => boolean;
  persistEvidence: (params: {
    checklistId: string;
    responseId: string;
    blockId: string;
    idempotencyKey: string;
    buffer: ArrayBuffer;
    mimeType: string;
  }) => Promise<{ evidenceId: string | null; error: any }>;
}


export async function verifyCameraRequest(
  payload: VerifyPayload,
  imageFile: { buffer: ArrayBuffer; type: string },
  deps: VerifyDependencies
): Promise<{ status: number; body: VerificationResult | { ok: false; code: string; message?: string; requestId?: string } }> {
  // 0. Use injection-provided requestId or fallback
  const requestId = deps.requestId || Math.random().toString(36).substring(7);

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

  const blocks = extractBlocksFromSnapshot(session.published_content);
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

  const { CameraVerificationPolicyV1Schema } = await import('./schema');
  const question = (String(block.title || '') + ' ' + String(block.description || '')).trim();
  const policy = block.cameraAiPolicy;
  
  // SHA-256 helper inside handler for now to avoid dependency issues during tests if subtle is not available in node
  const expectedHash = createHash('sha256').update(question).digest('hex');
  const policyValidation = CameraVerificationPolicyV1Schema.safeParse(policy);

  if (!policyValidation.success || 
      policyValidation.data.version !== 1 || 
      policyValidation.data.questionHash !== expectedHash) {
    return { 
      status: 400, 
      body: { 
        ok: false, 
        code: 'checklist_update_required', 
        message: 'A pergunta ou critérios da câmera foram alterados. Por favor, recarregue a página.',
        requestId
      } 
    };
  }

  const validatedPolicy = policyValidation.data;


  // 7 & 8. Replay & Atomic Claim
  const { data: claimData, error: claimError } = await deps.claimAttempt({
    responseId: session.response_id,
    blockId: payload.blockId,
    idempotencyKey: payload.idempotencyKey
  });

  if (claimError || !claimData || !claimData.length) {
    return { 
      status: 500, 
      body: { ok: false, code: 'technical_failure', message: 'Falha ao processar idempotência.', requestId } 
    };
  }

  const claim = claimData[0];

  // Replay Storage-Pending Approved Attempt (completed+approved+!evidenceId OR failed+storage_failure)
  const isStoragePending = 
    (claim.claim_status === 'completed' && claim.existing_decision === 'approved' && !claim.existing_evidence_id) ||
    (claim.claim_status === 'failed' && claim.existing_code === 'storage_failure');

  if (isStoragePending) {
    // 12. Persistence Replay (No OpenAI, No Rate Limit)
    const { evidenceId: pId, error: pError } = await deps.persistEvidence({
      checklistId: session.checklist_id,
      responseId: session.response_id,
      blockId: payload.blockId,
      idempotencyKey: payload.idempotencyKey,
      buffer: imageFile.buffer,
      mimeType
    });

    if (pError || !pId) {
      return {
        status: 500,
        body: {
          ok: false,
          code: 'storage_failure',
          message: 'Foto aprovada. Não conseguimos salvá-la ainda.',
          requestId
        }
      };
    }

    // 13. Decision Update (Atomic Attachment)
    const { data: attachData, error: attachError } = await deps.attachEvidence({
      responseId: session.response_id,
      blockId: payload.blockId,
      idempotencyKey: payload.idempotencyKey,
      evidenceId: pId
    });

    const confirmedId = attachData?.[0]?.confirmed_evidence_id;

    if (attachError || !confirmedId) {
      return {
        status: 500,
        body: {
          ok: false,
          code: 'storage_failure',
          message: 'Foto salva, mas falha ao vincular ao checklist.',
          requestId
        }
      };
    }

    return {
      status: 200,
      body: {
        ok: true,
        decision: 'approved',
        code: 'verified',
        message: 'Foto persistida com sucesso.',
        evidence: claim.existing_evidence,
        evidenceId: confirmedId,
        persisted: true,
        requestId
      }
    };
  }

  // Replay Completed (Already has evidenceId)
  if (claim.claim_status === 'completed') {
    return {
      status: 200,
      body: {
        ok: true,
        decision: claim.existing_decision as Decision,
        code: claim.existing_code || 'replayed',
        message: 'Replay da decisão anterior.',
        evidence: claim.existing_evidence || undefined,
        evidenceId: claim.existing_evidence_id || undefined,
        persisted: !!claim.existing_evidence_id,
        requestId
      }
    };
  }

  // Concurrent Processing
  if (claim.claim_status === 'processing') {
    return { 
      status: 409, 
      body: { ok: false, code: 'processing_conflict', message: 'A foto ainda está sendo processada. Tente novamente em instantes.', requestId } 
    };
  }

  if (claim.claim_status !== 'acquired') {
    return { 
      status: 500, 
      body: { ok: false, code: 'technical_failure', message: 'Falha técnica ao iniciar verificação.', requestId } 
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
      body: { ok: false, code: 'rate_limit', message: 'Muitas tentativas.', requestId } 
    };
  }

  // 10. OpenAI
  const startTime = deps.now().getTime();
  let analysis: CameraVerification;
  try {
    analysis = await deps.analyzeImage(question, imageFile.buffer, mimeType, validatedPolicy);
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

  // 12. Final Decision & Persistence (Single Atomic markCompleted)
  let evidenceId: string | undefined;

  if (result.decision === 'approved') {
    const { evidenceId: pId, error: pError } = await deps.persistEvidence({
      checklistId: session.checklist_id,
      responseId: session.response_id,
      blockId: payload.blockId,
      idempotencyKey: payload.idempotencyKey,
      buffer: imageFile.buffer,
      mimeType
    });

    if (pError || !pId) {
      // markCompleted exactly once for Approved+StorageFailure
      const { data: finalUpdate, error: finalError } = await deps.markCompleted({
        responseId: session.response_id,
        blockId: payload.blockId,
        idempotencyKey: payload.idempotencyKey,
        decision: 'approved',
        code: 'storage_pending',
        evidence: result.evidence,
        evidenceId: undefined,
        model: deps.model,
        durationMs: duration,
        at: deps.now()
      });

      if (finalError || !finalUpdate) {
        return { 
          status: 500, 
          body: { ok: false, code: 'persistence_error', message: 'Falha ao confirmar falha de salvamento.', requestId } 
        };
      }

      return {
        status: 500,
        body: {
          ok: false,
          code: 'storage_failure',
          message: 'Foto aprovada. Não conseguimos salvá-la ainda.',
          requestId
        }
      };
    }
    evidenceId = pId;
  }

  // markCompleted exactly once for all new successful/rejected paths
  const { data: finalUpdate, error: finalError } = await deps.markCompleted({
    responseId: session.response_id,
    blockId: payload.blockId,
    idempotencyKey: payload.idempotencyKey,
    decision: result.decision,
    code: result.decision === 'approved' ? 'verified' : result.code,
    evidence: result.evidence,
    evidenceId: evidenceId,
    model: deps.model,
    durationMs: duration,
    at: deps.now()
  });

  if (finalError || !finalUpdate) {
    return { 
      status: 500, 
      body: { 
        ok: false, 
        code: 'persistence_error',
        message: 'Falha ao confirmar decisão da IA.',
        requestId
      } 
    };
  }

  return { 
    status: 200, 
    body: { 
      ...result, 
      evidenceId, 
      persisted: result.decision === 'approved' && !!evidenceId, 
      requestId 
    } 
  };
}
