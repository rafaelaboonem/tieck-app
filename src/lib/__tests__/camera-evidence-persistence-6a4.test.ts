import { describe, it, expect, vi } from 'vitest';
import { verifyCameraRequest, VerifyDependencies, PublicSession, ClaimResult, RateLimitResult } from '../../server/camera-ai/verify-handler';
import { VerifyPayload, PublishedBlock, CameraVerification, CameraReferenceVerification } from '../../server/camera-ai/schema';
import { createHash } from 'crypto';
import { isActionableCameraNonApproval, ACTIONABLE_RETAKE_CODES } from '../camera-ai/actionable-non-approval';
import { buildHomeCameraAttention, type HomeCameraAttempt, type HomeCameraResponse } from '../home-camera-attention';

const QUESTION = 'Test Question';
const NEW = '2026-08-02T00:00:00Z';
const OLD = '2026-08-01T00:00:00Z';

const validPolicy = () => ({
  version: 1,
  questionHash: createHash('sha256').update(QUESTION).digest('hex'),
  source: 'generated' as const,
  verifiability: 'visual' as const,
  target: 'target',
  condition: 'condition',
  targetDescription: 'td',
  conditionDescription: 'cd',
  requiredVisibleEvidence: [],
  rejectionSignals: [],
  notObservableSignals: [],
  summary: 'summary'
});

const baseBlock: PublishedBlock = {
  id: 'blk-1',
  type: 'camera',
  title: QUESTION,
  mode: 'auto',
  cameraAiPolicy: validPolicy() as any
};

const payload: VerifyPayload = {
  checklistId: 'chk-123',
  blockId: 'blk-1',
  responseToken: 'token-123',
  idempotencyKey: 'idem-123'
};

const image = { buffer: new Uint8Array([0xff, 0xd8, 0xff, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]).buffer, type: 'image/jpeg' };

const approvedAnalysis = (over: Partial<CameraVerification> = {}): CameraVerification => ({
  target_visible: true,
  target_identity_confidence: 0.95,
  condition_observable: true,
  condition_met: true,
  image_quality_usable: true,
  positive_visible_evidence: ['evidência positiva'],
  negative_visible_evidence: [],
  contradictions: [],
  overall_confidence: 0.95,
  user_message: 'Aprovado pela IA',
  ...over
});

const makeDeps = (overrides: Partial<VerifyDependencies> = {}, block: PublishedBlock = baseBlock): VerifyDependencies => ({
  mode: 'enabled',
  model: 'gpt-4o-mini',
  requestId: 'test-req',
  now: () => new Date('2026-08-18T10:00:00Z'),
  isConfigured: () => true,
  resolveSession: vi.fn().mockResolvedValue({
    data: [{
      response_id: 'resp-123',
      checklist_id: 'chk-123',
      workspace_id: 'ws-1',
      status: 'in_progress',
      published_content: { blocks: [block] }
    } satisfies PublicSession],
    error: null
  }),
  claimAttempt: vi.fn().mockResolvedValue({ data: [{ claim_status: 'acquired', attempt_id: 'att-1', current_retry_count: 0 } satisfies ClaimResult], error: null }),
  hitRateLimit: vi.fn().mockResolvedValue({ data: [{ allowed: true } satisfies RateLimitResult], error: null }),
  analyzeImage: vi.fn().mockResolvedValue(approvedAnalysis()),
  analyzeImageWithReference: vi.fn(),
  loadReferenceImage: vi.fn(),
  markFailed: vi.fn().mockResolvedValue({ data: {}, error: null }),
  markCompleted: vi.fn().mockResolvedValue({ data: { id: 'attempt-1' }, error: null }),
  attachEvidence: vi.fn().mockResolvedValue({ data: [{ confirmed_evidence_id: 'ev-1' }], error: null }),
  persistEvidence: vi.fn().mockResolvedValue({ evidenceId: 'ev-1', error: null }),
  ...overrides
});

describe('Camera AI 6A.4 — persistência de evidência por decisão', () => {
  it('A) approved → persiste exatamente como antes (evidenceId + persisted true)', async () => {
    const deps = makeDeps();
    const res = await verifyCameraRequest(payload, image, deps);
    expect(res.status).toBe(200);
    expect(deps.persistEvidence).toHaveBeenCalledTimes(1);
    expect(deps.markCompleted).toHaveBeenCalledWith(expect.objectContaining({
      decision: 'approved',
      code: 'verified',
      evidenceId: 'ev-1'
    }));
    expect((res.body as any).persisted).toBe(true);
    expect((res.body as any).evidenceId).toBe('ev-1');
  });

  it('B) condition_not_met → persiste imagem e liga evidenceId ao attempt', async () => {
    const deps = makeDeps({ analyzeImage: vi.fn().mockResolvedValue(approvedAnalysis({ condition_met: false })) });
    const res = await verifyCameraRequest(payload, image, deps);
    expect(res.status).toBe(200);
    expect(deps.persistEvidence).toHaveBeenCalledTimes(1);
    expect(deps.persistEvidence).toHaveBeenCalledWith(expect.objectContaining({
      checklistId: 'chk-123',
      responseId: 'resp-123',
      blockId: 'blk-1',
      idempotencyKey: 'idem-123'
    }));
    expect(deps.markCompleted).toHaveBeenCalledWith(expect.objectContaining({
      decision: 'retake',
      code: 'condition_not_met',
      evidenceId: 'ev-1'
    }));
    expect((res.body as any).decision).toBe('retake');
    expect((res.body as any).code).toBe('condition_not_met');
    expect((res.body as any).evidenceId).toBe('ev-1');
    expect((res.body as any).persisted).toBe(true);
  });

  it('C) reference_mismatch (reference mode) → persiste', async () => {
    const refBuffer = new Uint8Array([0xff, 0xd8, 0xff, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);
    const refMeta = {
      version: 1,
      storagePath: 'ref.jpg',
      mimeType: 'image/jpeg',
      sha256: createHash('sha256').update(refBuffer).digest('hex'),
      sizeBytes: refBuffer.byteLength
    };
    const block: PublishedBlock = {
      ...baseBlock,
      mode: 'reference',
      cameraReference: refMeta as any
    };
    const deps = makeDeps({
      loadReferenceImage: vi.fn().mockResolvedValue({ buffer: refBuffer.buffer, mimeType: 'image/jpeg' }),
      analyzeImageWithReference: vi.fn().mockResolvedValue({
        reference_match: false,
        reference_match_confidence: 0.4,
        reference_differences: ['ângulo diferente'],
        ...approvedAnalysis({ condition_met: true }),
      } satisfies CameraReferenceVerification)
    }, block);

    const res = await verifyCameraRequest(payload, image, deps);
    expect(res.status).toBe(200);
    expect(deps.analyzeImageWithReference).toHaveBeenCalled();
    expect(deps.persistEvidence).toHaveBeenCalledTimes(1);
    expect(deps.markCompleted).toHaveBeenCalledWith(expect.objectContaining({
      decision: 'retake',
      code: 'reference_mismatch',
      evidenceId: 'ev-1'
    }));
    expect((res.body as any).code).toBe('reference_mismatch');
    expect((res.body as any).persisted).toBe(true);
  });

  it('D) target_missing → persiste', async () => {
    const deps = makeDeps({ analyzeImage: vi.fn().mockResolvedValue(approvedAnalysis({ target_visible: false })) });
    const res = await verifyCameraRequest(payload, image, deps);
    expect(res.status).toBe(200);
    expect((res.body as any).code).toBe('target_missing');
    expect(deps.persistEvidence).toHaveBeenCalledTimes(1);
    expect(deps.markCompleted).toHaveBeenCalledWith(expect.objectContaining({ evidenceId: 'ev-1' }));
  });

  it('E) quality_failure → NÃO persiste', async () => {
    const deps = makeDeps({ analyzeImage: vi.fn().mockResolvedValue(approvedAnalysis({ image_quality_usable: false })) });
    const res = await verifyCameraRequest(payload, image, deps);
    expect(res.status).toBe(200);
    expect((res.body as any).code).toBe('quality_failure');
    expect(deps.persistEvidence).not.toHaveBeenCalled();
    expect(deps.markCompleted).toHaveBeenCalledWith(expect.objectContaining({ evidenceId: undefined }));
    expect((res.body as any).persisted).toBe(false);
  });

  it('F) uncertain → NÃO persiste', async () => {
    const deps = makeDeps({ analyzeImage: vi.fn().mockResolvedValue(approvedAnalysis({ overall_confidence: 0.5 })) });
    const res = await verifyCameraRequest(payload, image, deps);
    expect(res.status).toBe(200);
    expect((res.body as any).code).toBe('uncertain');
    expect(deps.persistEvidence).not.toHaveBeenCalled();
  });

  it('G) not_observable → NÃO persiste como evidência operacional', async () => {
    const deps = makeDeps({ analyzeImage: vi.fn().mockResolvedValue(approvedAnalysis({ condition_observable: false })) });
    const res = await verifyCameraRequest(payload, image, deps);
    expect(res.status).toBe(200);
    expect((res.body as any).decision).toBe('not_observable');
    expect(deps.persistEvidence).not.toHaveBeenCalled();
  });

  it('H) technical_failure → nunca persiste (provider falha → markFailed, sem persistência)', async () => {
    expect(isActionableCameraNonApproval({ status: 'completed', decision: 'technical_failure', code: 'provider_failure' })).toBe(false);
    const deps = makeDeps({ analyzeImage: vi.fn().mockRejectedValue(new Error('AI down')) });
    await expect(verifyCameraRequest(payload, image, deps)).rejects.toThrow();
    expect(deps.markFailed).toHaveBeenCalledWith(expect.objectContaining({ code: 'provider_failure' }));
    expect(deps.persistEvidence).not.toHaveBeenCalled();
  });
});

describe('Camera AI 6A.4 — storage failure de non-approval degrada para texto', () => {
  it('I) retake acionável + storage failure → decisão preservada, persisted=false, sem 500', async () => {
    const deps = makeDeps({
      analyzeImage: vi.fn().mockResolvedValue(approvedAnalysis({ condition_met: false, negative_visible_evidence: ['evidência negativa'] })),
      persistEvidence: vi.fn().mockResolvedValue({ evidenceId: null, error: new Error('storage down') })
    });
    const res = await verifyCameraRequest(payload, image, deps);
    expect(res.status).toBe(200);
    expect((res.body as any).ok).toBe(true);
    expect((res.body as any).decision).toBe('retake');
    expect((res.body as any).code).toBe('condition_not_met');
    expect((res.body as any).persisted).toBe(false);
    expect((res.body as any).evidenceId).toBeUndefined();
    expect((res.body as any).code).not.toBe('storage_failure');
    expect(deps.markCompleted).toHaveBeenCalledTimes(1);
    expect(deps.markCompleted).toHaveBeenCalledWith(expect.objectContaining({
      decision: 'retake',
      code: 'condition_not_met',
      evidence: 'evidência negativa',
      evidenceId: undefined
    }));
  });

  it('J) retake acionável + persist success → persisted=true e evidenceId retornado', async () => {
    const deps = makeDeps({ analyzeImage: vi.fn().mockResolvedValue(approvedAnalysis({ condition_met: false })) });
    const res = await verifyCameraRequest(payload, image, deps);
    expect(res.status).toBe(200);
    expect((res.body as any).persisted).toBe(true);
    expect((res.body as any).evidenceId).toBe('ev-1');
  });

  it('I2) reference_mismatch + storage failure → decision/code preservados', async () => {
    const refBuffer = new Uint8Array([0xff, 0xd8, 0xff, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);
    const block: PublishedBlock = {
      ...baseBlock,
      mode: 'reference',
      cameraReference: {
        version: 1,
        storagePath: 'ref.jpg',
        mimeType: 'image/jpeg',
        sha256: createHash('sha256').update(refBuffer).digest('hex'),
        sizeBytes: refBuffer.byteLength
      } as any
    };
    const deps = makeDeps({
      loadReferenceImage: vi.fn().mockResolvedValue({ buffer: refBuffer.buffer, mimeType: 'image/jpeg' }),
      analyzeImageWithReference: vi.fn().mockResolvedValue({
        reference_match: false,
        reference_match_confidence: 0.4,
        reference_differences: ['x'],
        ...approvedAnalysis()
      } satisfies CameraReferenceVerification),
      persistEvidence: vi.fn().mockResolvedValue({ evidenceId: null, error: new Error('boom') })
    }, block);
    const res = await verifyCameraRequest(payload, image, deps);
    expect(res.status).toBe(200);
    expect((res.body as any).decision).toBe('retake');
    expect((res.body as any).code).toBe('reference_mismatch');
    expect((res.body as any).persisted).toBe(false);
    expect(deps.markCompleted).toHaveBeenCalledWith(expect.objectContaining({ code: 'reference_mismatch', evidenceId: undefined }));
  });
});

describe('Camera AI 6A.4 — replay e idempotência', () => {
  it('S) replay completed acionável com evidenceId → não chama OpenAI, retorna evidenceId existente', async () => {
    const deps = makeDeps({
      claimAttempt: vi.fn().mockResolvedValue({
        data: [{
          claim_status: 'completed',
          attempt_id: 'att-1',
          current_retry_count: 2,
          existing_decision: 'retake',
          existing_code: 'condition_not_met',
          existing_evidence: 'evidência textual antiga',
          existing_evidence_id: 'ev-1'
        } satisfies ClaimResult],
        error: null
      })
    });
    const res = await verifyCameraRequest(payload, image, deps);
    expect(res.status).toBe(200);
    expect(deps.analyzeImage).not.toHaveBeenCalled();
    expect(deps.persistEvidence).not.toHaveBeenCalled();
    expect((res.body as any).decision).toBe('retake');
    expect((res.body as any).code).toBe('condition_not_met');
    expect((res.body as any).evidenceId).toBe('ev-1');
    expect((res.body as any).persisted).toBe(true);
  });

  it('S2) replay completed approved com evidenceId → retorna approved sem nova análise', async () => {
    const deps = makeDeps({
      claimAttempt: vi.fn().mockResolvedValue({
        data: [{
          claim_status: 'completed',
          attempt_id: 'att-1',
          current_retry_count: 1,
          existing_decision: 'approved',
          existing_code: 'verified',
          existing_evidence: 'ok',
          existing_evidence_id: 'ev-1'
        } satisfies ClaimResult],
        error: null
      })
    });
    const res = await verifyCameraRequest(payload, image, deps);
    expect(res.status).toBe(200);
    expect(deps.analyzeImage).not.toHaveBeenCalled();
    expect((res.body as any).decision).toBe('approved');
    expect((res.body as any).evidenceId).toBe('ev-1');
  });

  it('T) retries com idempotency keys diferentes → cada tentativa persiste sua própria evidência', async () => {
    const deps = makeDeps({ analyzeImage: vi.fn().mockResolvedValue(approvedAnalysis({ condition_met: false })) });
    const res1 = await verifyCameraRequest(payload, image, deps);
    expect(res1.status).toBe(200);
    const res2 = await verifyCameraRequest({ ...payload, idempotencyKey: 'idem-456' }, image, deps);
    expect(res2.status).toBe(200);
    expect(deps.persistEvidence).toHaveBeenCalledTimes(2);
    expect(deps.persistEvidence).toHaveBeenNthCalledWith(1, expect.objectContaining({ idempotencyKey: 'idem-123' }));
    expect(deps.persistEvidence).toHaveBeenNthCalledWith(2, expect.objectContaining({ idempotencyKey: 'idem-456' }));
    expect(deps.markCompleted).toHaveBeenCalledTimes(2);
  });
});

describe('Camera AI 6A.4 — semântica compartilhada (helper única)', () => {
  it('ACTIONABLE_RETAKE_CODES são exatamente os 3 acionáveis', () => {
    expect([...ACTIONABLE_RETAKE_CODES].sort()).toEqual(['condition_not_met', 'reference_mismatch', 'target_missing']);
  });

  it('helper rejeita todos os códigos não acionáveis (fail-closed)', () => {
    for (const code of ['quality_failure', 'uncertain', 'not_observable', 'provider_failure', 'storage_failure', null, '']) {
      expect(isActionableCameraNonApproval({ status: 'completed', decision: 'retake', code })).toBe(false);
    }
    expect(isActionableCameraNonApproval({ status: 'failed', decision: 'rejected', code: null })).toBe(false);
    expect(isActionableCameraNonApproval({ status: 'completed', decision: 'not_observable', code: null })).toBe(false);
    expect(isActionableCameraNonApproval({ status: 'processing', decision: 'retake', code: 'condition_not_met' })).toBe(false);
  });
});

describe('Camera AI 6A.4 — Home agrupa POR BLOCO (response_id + block_id)', () => {
  const attempt = (over: Partial<HomeCameraAttempt> & { id: string; response_id: string }): HomeCameraAttempt => ({
    block_id: 'blk-1',
    status: 'completed',
    decision: 'retake',
    code: 'condition_not_met',
    completed_at: NEW,
    updated_at: NEW,
    created_at: NEW,
    ...over
  });
  const response = (over: Partial<HomeCameraResponse> & { id: string; checklist_id: string }): HomeCameraResponse => ({
    submitted_at: NEW,
    created_at: NEW,
    ...over
  });

  it('L) retake antigo com evidence A + approved novo com evidence B (mesmo bloco) → sem prioridade velha', () => {
    const attempts = [
      attempt({ id: 'a-old', response_id: 'r1', evidence_id: 'ev-A', block_id: 'b1', code: 'condition_not_met', completed_at: OLD }),
      attempt({ id: 'a-new', response_id: 'r1', evidence_id: 'ev-B', block_id: 'b1', decision: 'approved', code: 'verified', completed_at: NEW }),
    ];
    expect(buildHomeCameraAttention(['c1'], [response({ id: 'r1', checklist_id: 'c1' })], attempts)).toEqual([]);
  });

  it('M) approved antigo + retake acionável novo (mesmo bloco) → prioridade aparece', () => {
    const attempts = [
      attempt({ id: 'a-old', response_id: 'r1', evidence_id: 'ev-A', block_id: 'b1', decision: 'approved', code: 'verified', completed_at: OLD }),
      attempt({ id: 'a-new', response_id: 'r1', evidence_id: 'ev-B', block_id: 'b1', code: 'condition_not_met', completed_at: NEW }),
    ];
    expect(buildHomeCameraAttention(['c1'], [response({ id: 'r1', checklist_id: 'c1' })], attempts)).toEqual([
      { checklistId: 'c1', rejectedCount: 1, latestSubmittedAt: NEW },
    ]);
  });

  it('N) dois blocos Camera com latest retake acionável → count 2', () => {
    const attempts = [
      attempt({ id: 'a1', response_id: 'r1', block_id: 'b1', code: 'condition_not_met' }),
      attempt({ id: 'a2', response_id: 'r1', block_id: 'b2', code: 'target_missing' }),
      attempt({ id: 'a3', response_id: 'r1', block_id: 'b3', decision: 'approved', code: 'verified' }),
    ];
    expect(buildHomeCameraAttention(['c1'], [response({ id: 'r1', checklist_id: 'c1' })], attempts)).toEqual([
      { checklistId: 'c1', rejectedCount: 2, latestSubmittedAt: NEW },
    ]);
  });
});