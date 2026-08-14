import { describe, it, expect, vi, beforeEach, MockedFunction } from 'vitest';
import { CameraVerification, VerifyPayload } from '../../src/server/camera-ai/schema';
import { verifyCameraRequest, VerifyDependencies, PublicSession, ClaimResult } from '../../src/server/camera-ai/verify-handler';

describe('Camera AI Final Recovery & Integrity', () => {
  let deps: VerifyDependencies;
  const mockNow = new Date('2026-08-14T04:50:00Z');

  const validPayload: VerifyPayload = {
    checklistId: 'c1234567-89ab-cdef-0123-456789abcdef',
    blockId: 'blk-1',
    responseToken: 'token-1',
    idempotencyKey: '00000000-0000-0000-0000-000000000000'
  };
  // JPEG magic bytes
  const validImage = { buffer: new Uint8Array([0xff, 0xd8, 0xff, 0xdb, 0x00, 0x00]).buffer, type: 'image/jpeg' };

  beforeEach(() => {
    vi.clearAllMocks();
    let markCompletedCalls = 0;
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
            blocks: [{ 
              id: 'blk-1', 
              type: 'camera', 
              title: 'Test',
              cameraAiPolicy: {
                version: 1,
                questionHash: '94ee059335e587e501cc4bf90613e0814f00a7b08bc7c648fd865a2af6a22cc2', // hash of "Test "
                verifiability: 'visual',
                target: 'Test',
                condition: 'present',
                summary: 'test',
                source: 'generated',
                requiredVisibleEvidence: [],
                rejectionSignals: [],
                notObservableSignals: []
              }
            }] 
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
        target_visible: true,
        target_identity_confidence: 0.95,
        condition_observable: true,
        condition_met: true,
        image_quality_usable: true,
        positive_visible_evidence: ['approved'],
        negative_visible_evidence: [],
        contradictions: [],
        overall_confidence: 0.95,
        user_message: 'approved' 
      } satisfies CameraVerification),
      markFailed: vi.fn().mockResolvedValue({ data: {}, error: null }),
      markCompleted: vi.fn().mockImplementation(async () => {
        markCompletedCalls++;
        if (markCompletedCalls > 1) {
          return { data: null, error: 'Second call failed' };
        }
        return { data: { id: 'attempt-1' }, error: null };
      }),
      persistEvidence: vi.fn().mockResolvedValue({ evidenceId: 'ev-1', error: null }),
      attachEvidence: vi.fn().mockResolvedValue({ data: [{ confirmed_evidence_id: 'ev-1' }], error: null }),
      persistEvidenceCount: () => (deps.persistEvidence as any).mock.calls.length,
      markCompletedCount: () => (deps.markCompleted as any).mock.calls.length,
    } as any;
  });

  it('A. Aprovação nova: acquired -> markCompleted exatamente 1 vez', async () => {
    const res = await verifyCameraRequest(validPayload, validImage, deps);
    
    expect(res.status).toBe(200);
    expect(deps.analyzeImage).toHaveBeenCalledTimes(1);
    expect(deps.persistEvidence).toHaveBeenCalledTimes(1);
    expect(deps.markCompleted).toHaveBeenCalledTimes(1);
    expect(deps.attachEvidence).not.toHaveBeenCalled();
    expect((res.body as any).persisted).toBe(true);
  });

  it('B. Rejeição (retake): acquired -> markCompleted exatamente 1 vez, 0 persistEvidence', async () => {
    (deps.analyzeImage as MockedFunction<any>).mockResolvedValue({ 
      target_visible: false,
      target_identity_confidence: 0.5,
      condition_observable: true,
      condition_met: true,
      image_quality_usable: true,
      positive_visible_evidence: [],
      negative_visible_evidence: ['wrong'],
      contradictions: [],
      overall_confidence: 0.95,
      user_message: 'retake'
    } satisfies CameraVerification);
    
    const res = await verifyCameraRequest(validPayload, validImage, deps);
    
    expect(res.status).toBe(200);
    expect((res.body as any).decision).toBe('retake');
    expect(deps.persistEvidence).not.toHaveBeenCalled();
    expect(deps.markCompleted).toHaveBeenCalledTimes(1);
    expect(deps.attachEvidence).not.toHaveBeenCalled();
  });

  it('C. Rejeição (not_observable): acquired -> markCompleted exatamente 1 vez', async () => {
    (deps.analyzeImage as MockedFunction<any>).mockResolvedValue({ 
      target_visible: true,
      target_identity_confidence: 0.95,
      condition_observable: false,
      condition_met: true,
      image_quality_usable: true,
      positive_visible_evidence: [],
      negative_visible_evidence: [],
      contradictions: ['obstructed'],
      overall_confidence: 0.95,
      user_message: 'not_observable'
    } satisfies CameraVerification);
    
    const res = await verifyCameraRequest(validPayload, validImage, deps);
    
    expect(res.status).toBe(200);
    expect((res.body as any).decision).toBe('not_observable');
    expect(deps.markCompleted).toHaveBeenCalledTimes(1);
  });

  it('D. Replay storage_pending: 0 OpenAI, 0 markCompleted, 1 attachEvidence', async () => {
    (deps.claimAttempt as MockedFunction<any>).mockResolvedValue({ 
      data: [{ 
        claim_status: 'completed', attempt_id: 'att-pending', current_retry_count: 1,
        existing_decision: 'approved', existing_code: 'storage_pending',
        existing_evidence: 'AI already said yes', existing_evidence_id: null
      }], 
      error: null 
    });
    
    const res = await verifyCameraRequest(validPayload, validImage, deps);
    
    expect(res.status).toBe(200);
    expect(deps.analyzeImage).not.toHaveBeenCalled();
    expect(deps.hitRateLimit).not.toHaveBeenCalled();
    expect(deps.markCompleted).not.toHaveBeenCalled();
    expect(deps.persistEvidence).toHaveBeenCalledTimes(1);
    expect(deps.attachEvidence).toHaveBeenCalledTimes(1);
  });

  it('E. Replay failed/storage_failure: reconhecido pela RPC como Replay', async () => {
    (deps.claimAttempt as MockedFunction<any>).mockResolvedValue({ 
      data: [{ 
        claim_status: 'failed', attempt_id: 'att-legacy', current_retry_count: 2,
        existing_decision: 'approved', existing_code: 'storage_failure',
        existing_evidence: 'Legacy AI decision', existing_evidence_id: null
      }], 
      error: null 
    });
    
    const res = await verifyCameraRequest(validPayload, validImage, deps);
    
    expect(res.status).toBe(200);
    expect(deps.analyzeImage).not.toHaveBeenCalled();
    expect(deps.attachEvidence).toHaveBeenCalledTimes(1);
  });

  it('F. Falha no Banco (markCompleted retorna null) -> technical_failure', async () => {
    (deps.markCompleted as MockedFunction<any>).mockResolvedValue({ data: null, error: null });
    
    const res = await verifyCameraRequest(validPayload, validImage, deps);
    
    expect(res.status).toBe(500);
    expect((res.body as any).code).toBe('persistence_error');
    expect(!!(res.body as any).persisted).toBe(false);
  });

  it('G. Teste de Dupla Finalização (Stateful): Falharia se chamasse 2x', async () => {
    // markCompleted calls are limited to 1 in implementation above.
    // verifyCameraRequest is now structured to call it once per path.
    const res = await verifyCameraRequest(validPayload, validImage, deps);
    expect(res.status).toBe(200);
    expect(deps.markCompleted).toHaveBeenCalledTimes(1);
  });
});