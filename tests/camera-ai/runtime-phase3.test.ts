import { describe, it, expect, vi, beforeEach, MockedFunction } from 'vitest';
import { CameraVerification, VerifyPayload, CameraVerificationPolicyV1 } from '../../src/server/camera-ai/schema';
import { verifyCameraRequest, VerifyDependencies, PublicSession, ClaimResult, RateLimitResult } from '../../src/server/camera-ai/verify-handler';
import { createHash } from 'crypto';

describe('Camera AI Phase 3: Runtime & Integrity', () => {
  let deps: VerifyDependencies;
  const mockNow = new Date('2026-08-14T20:00:00Z');

  const validPolicy: CameraVerificationPolicyV1 = {
    version: 1,
    questionHash: '532eaabd9574880dbf76b9b8cc00832c20a6ec113d682299550d7a6e0f345e25', // sha256 of "Test "
    verifiability: 'visual',
    target: 'Test',
    condition: 'present',
    targetDescription: 'D',
    conditionDescription: 'C',
    requiredVisibleEvidence: [],
    rejectionSignals: [],
    notObservableSignals: [],
    summary: 'S',
    source: 'generated'
  };

  const validPayload: VerifyPayload = {
    checklistId: 'c1234567-89ab-cdef-0123-456789abcdef',
    blockId: 'blk-1',
    responseToken: 'token-1',
    idempotencyKey: '00000000-0000-0000-0000-000000000000'
  };

  const validImage = { buffer: new Uint8Array([0xff, 0xd8, 0xff, 0xdb]).buffer, type: 'image/jpeg' };

  beforeEach(() => {
    vi.clearAllMocks();
    deps = {
      mode: 'enabled',
      model: 'gpt-4o-mini',
      requestId: 'test-req-id',
      now: () => mockNow,
      isConfigured: vi.fn().mockReturnValue(true),
      resolveSession: vi.fn().mockResolvedValue({ 
        data: [{ 
          response_id: 'res-1', 
          checklist_id: validPayload.checklistId, 
          workspace_id: 'w123',
          status: 'in_progress',
          published_content: { 
            blocks: [{ 
              id: 'blk-1', 
              type: 'camera', 
              title: 'Test',
              cameraAiPolicy: validPolicy
            }] 
          } 
        } satisfies PublicSession], 
        error: null 
      }),
      claimAttempt: vi.fn().mockResolvedValue({ 
        data: [{ claim_status: 'acquired', attempt_id: 'att-1', current_retry_count: 0 } satisfies ClaimResult], 
        error: null 
      }),
      hitRateLimit: vi.fn().mockResolvedValue({ data: [{ allowed: true } satisfies RateLimitResult], error: null }),
      analyzeImage: vi.fn().mockResolvedValue({ 
        target_visible: true, 
        target_identity_confidence: 0.95,
        condition_observable: true, 
        condition_met: true, 
        image_quality_usable: true,
        positive_visible_evidence: ['approved'],
        negative_visible_evidence: [],
        contradictions: [],
        overall_confidence: 0.95,
        user_message: 'Approved message from AI' 
      } satisfies CameraVerification),
      markFailed: vi.fn().mockResolvedValue({ data: {}, error: null }),
      markCompleted: vi.fn().mockResolvedValue({ data: { id: 'attempt-1' }, error: null }),
      persistEvidence: vi.fn().mockResolvedValue({ evidenceId: 'ev-1', error: null }),
      attachEvidence: vi.fn().mockResolvedValue({ data: [{ confirmed_evidence_id: 'ev-1' }], error: null }),
    };
  });

  it('Bloqueia se a política for malformada ou ausente', async () => {
    (deps.resolveSession as MockedFunction<any>).mockResolvedValue({ 
      data: [{ 
        response_id: 'res-1', 
        checklist_id: validPayload.checklistId, 
        published_content: { 
          blocks: [{ id: 'blk-1', type: 'camera', title: 'Test', cameraAiPolicy: null }] 
        } 
      }], 
      error: null 
    });

    const res = await verifyCameraRequest(validPayload, validImage, deps);
    expect(res.status).toBe(400);
    expect((res.body as any).code).toBe('checklist_update_required');
    expect(deps.analyzeImage).not.toHaveBeenCalled();
  });

  it('Bloqueia se o hash da política divergir da pergunta atual', async () => {
    (deps.resolveSession as MockedFunction<any>).mockResolvedValue({ 
      data: [{ 
        response_id: 'res-1', 
        checklist_id: validPayload.checklistId, 
        published_content: { 
          blocks: [{ 
            id: 'blk-1', 
            type: 'camera', 
            title: 'Changed Question', 
            cameraAiPolicy: validPolicy 
          }] 
        } 
      }], 
      error: null 
    });

    const res = await verifyCameraRequest(validPayload, validImage, deps);
    expect(res.status).toBe(400);
    expect((res.body as any).code).toBe('checklist_update_required');
    expect(deps.analyzeImage).not.toHaveBeenCalled();
  });

  it('Usa o requestId fornecido em todas as respostas de erro e sucesso', async () => {
    const res = await verifyCameraRequest(validPayload, validImage, deps);
    expect(res.body.requestId).toBe('test-req-id');
    
    deps.mode = 'disabled';
    const resErr = await verifyCameraRequest(validPayload, validImage, deps);
    expect(resErr.body.requestId).toBe('test-req-id');
  });

  it('Provider falha: chama markFailed exatamente uma vez', async () => {
    deps.analyzeImage = vi.fn().mockRejectedValue(new Error('AI fail'));
    await expect(verifyCameraRequest(validPayload, validImage, deps)).rejects.toThrow();
    expect(deps.markFailed).toHaveBeenCalledTimes(1);
    expect(deps.markFailed).toHaveBeenCalledWith(expect.objectContaining({ code: 'provider_failure' }));
  });

  it('Aprova e persiste: markCompleted chamado exatamente uma vez', async () => {
    const res = await verifyCameraRequest(validPayload, validImage, deps);
    expect(res.status).toBe(200);
    expect((res.body as any).decision).toBe('approved');
    expect(deps.persistEvidence).toHaveBeenCalledTimes(1);
    expect(deps.markCompleted).toHaveBeenCalledTimes(1);
  });
});
