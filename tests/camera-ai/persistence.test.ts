import { describe, it, expect, vi, beforeEach, MockedFunction } from 'vitest';
import { CameraVerification, VerifyPayload } from '../../src/server/camera-ai/schema';
import { verifyCameraRequest, VerifyDependencies, PublicSession, ClaimResult } from '../../src/server/camera-ai/verify-handler';

describe('Camera AI Persistence & Replay', () => {
  let deps: VerifyDependencies;
  const mockNow = new Date('2026-08-14T04:30:00Z');

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
      now: () => mockNow,
      isConfigured: vi.fn().mockReturnValue(true),
      resolveSession: vi.fn().mockResolvedValue({ 
        data: [{ 
          response_id: 'res-1', 
          checklist_id: validPayload.checklistId, 
          workspace_id: 'w123',
          status: 'in_progress',
          published_content: { 
            blocks: [{ id: 'blk-1', type: 'camera', title: 'Test' }] 
          } 
        } satisfies PublicSession], 
        error: null 
      }),
      claimAttempt: vi.fn().mockResolvedValue({ 
        data: [{ 
          claim_status: 'acquired', 
          attempt_id: 'att-1', 
          current_retry_count: 0,
          existing_decision: null,
          existing_code: null,
          existing_evidence: null,
          existing_evidence_id: null
        } satisfies ClaimResult], 
        error: null 
      }),
      hitRateLimit: vi.fn().mockResolvedValue({ data: [{ allowed: true }], error: null }),
      analyzeImage: vi.fn().mockResolvedValue({ 
        confidence: 0.95, 
        target_visible: true, 
        condition_observable: true, 
        condition_met: true, 
        image_quality: 'usable', 
        visible_evidence: 'approved', 
        user_message: 'approved' 
      } satisfies CameraVerification),
      markFailed: vi.fn().mockResolvedValue({ data: {}, error: null }),
      markCompleted: vi.fn().mockResolvedValue({ data: { id: 'attempt-1' }, error: null }),
      persistEvidence: vi.fn().mockResolvedValue({ evidenceId: 'ev-1', error: null }),
    };
  });

  it('foto aprovada + Storage OK -> retorna evidenceId e persisted=true', async () => {
    const res = await verifyCameraRequest(validPayload, validImage, deps);
    expect(res.status).toBe(200);
    const body = res.body as any;
    expect(body.decision).toBe('approved');
    expect(body.evidenceId).toBe('ev-1');
    expect(body.persisted).toBe(true);
    expect(deps.persistEvidence).toHaveBeenCalled();
    expect(deps.analyzeImage).toHaveBeenCalledTimes(1);
    expect(deps.markCompleted).toHaveBeenCalled();
  });

  it('foto rejeitada -> nenhum upload é realizado', async () => {
    (deps.analyzeImage as MockedFunction<any>).mockResolvedValue({ 
      confidence: 0.95, 
      target_visible: false, 
      condition_observable: false, 
      condition_met: false, 
      image_quality: 'usable', 
      visible_evidence: 'rejeitado', 
      user_message: 'rejeitado' 
    });
    const res = await verifyCameraRequest(validPayload, validImage, deps);
    expect((res.body as any).decision).toBe('retake');
    expect(deps.persistEvidence).not.toHaveBeenCalled();
    expect(deps.markCompleted).toHaveBeenCalled();
  });

  it('foto aprovada + falha no Storage -> retorna storage_failure e marca como storage_pending', async () => {
    (deps.persistEvidence as MockedFunction<any>).mockResolvedValue({ evidenceId: null, error: new Error('Storage fail') });
    const res = await verifyCameraRequest(validPayload, validImage, deps);
    expect(res.status).toBe(500);
    expect((res.body as any).code).toBe('storage_failure');
    // We now mark completed with storage_pending instead of failed
    expect(deps.markCompleted).toHaveBeenCalledWith(expect.objectContaining({ code: 'storage_pending' }));
  });

  it('retry (replay) de tentativa aprovada com evidenceId -> retorna replay sem chamar OpenAI', async () => {
    (deps.claimAttempt as MockedFunction<any>).mockResolvedValue({ 
      data: [{ 
        claim_status: 'completed', 
        attempt_id: 'a1', 
        current_retry_count: 0, 
        existing_decision: 'approved', 
        existing_code: 'verified',
        existing_evidence_id: 'ev-existing'
      }], 
      error: null 
    });
    
    const res = await verifyCameraRequest(validPayload, validImage, deps);
    expect(res.status).toBe(200);
    const body = res.body as any;
    expect(body.evidenceId).toBe('ev-existing');
    expect(body.persisted).toBe(true);
    expect(deps.analyzeImage).not.toHaveBeenCalled();
    expect(deps.persistEvidence).not.toHaveBeenCalled();
  });

  it('retry (replay) de storage_pending -> executa persistEvidence mas NÃO analyzeImage', async () => {
    (deps.claimAttempt as MockedFunction<any>).mockResolvedValue({ 
      data: [{ 
        claim_status: 'completed', 
        attempt_id: 'a-pending', 
        current_retry_count: 1, 
        existing_decision: 'approved', 
        existing_code: 'storage_pending',
        existing_evidence: 'AI already said yes',
        existing_evidence_id: null
      }], 
      error: null 
    });
    
    const res = await verifyCameraRequest(validPayload, validImage, deps);
    
    expect(res.status).toBe(200);
    const body = res.body as any;
    expect(body.persisted).toBe(true);
    expect(body.evidenceId).toBe('ev-1');
    expect(deps.analyzeImage).not.toHaveBeenCalled();
    expect(deps.persistEvidence).toHaveBeenCalledTimes(1);
    expect(deps.markCompleted).toHaveBeenCalledWith(expect.objectContaining({
      code: 'verified',
      evidenceId: 'ev-1'
    }));
  });
});
