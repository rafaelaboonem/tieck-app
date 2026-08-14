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
      attachEvidence: vi.fn().mockResolvedValue({ data: [{ confirmed_evidence_id: 'ev-1' }], error: null }),
    };
  });

  it('1. Tentativa antiga failed/storage_failure (mesmo decision NULL) é recuperada como replay', async () => {
    (deps.claimAttempt as MockedFunction<any>).mockResolvedValue({ 
      data: [{ 
        claim_status: 'failed', 
        attempt_id: 'att-old', 
        current_retry_count: 2,
        existing_decision: null, // s88u9p case
        existing_code: 'storage_failure',
        existing_evidence: 'Some old evidence',
        existing_evidence_id: null
      }], 
      error: null 
    });
    
    const res = await verifyCameraRequest(validPayload, validImage, deps);
    
    expect(res.status).toBe(200);
    expect(deps.analyzeImage).not.toHaveBeenCalled(); // Sem OpenAI
    expect(deps.persistEvidence).toHaveBeenCalled();
    expect(deps.attachEvidence).toHaveBeenCalled();
    expect((res.body as any).persisted).toBe(true);
  });

  it('2. Retry de storage_pending não executa OpenAI nem Rate Limit', async () => {
    (deps.claimAttempt as MockedFunction<any>).mockResolvedValue({ 
      data: [{ 
        claim_status: 'completed', 
        attempt_id: 'att-pending', 
        current_retry_count: 1,
        existing_decision: 'approved',
        existing_code: 'storage_pending',
        existing_evidence: 'Approved text',
        existing_evidence_id: null
      }], 
      error: null 
    });
    
    await verifyCameraRequest(validPayload, validImage, deps);
    
    expect(deps.analyzeImage).not.toHaveBeenCalled();
    expect(deps.hitRateLimit).not.toHaveBeenCalled();
    expect(deps.persistEvidence).toHaveBeenCalled();
  });

  it('3. Falha ao anexar evidence_id no banco nunca retorna persisted: true', async () => {
    (deps.attachEvidence as MockedFunction<any>).mockResolvedValue({ data: null, error: 'DB Error' });
    
    const res = await verifyCameraRequest(validPayload, validImage, deps);
    
    expect(res.status).toBe(500);
    expect(!!(res.body as any).persisted).toBe(false);
    expect((res.body as any).code).toBe('storage_failure');
  });

  it('4. Replays concorrentes: se attachEvidence retornar ID preexistente, retorna sucesso', async () => {
     (deps.claimAttempt as MockedFunction<any>).mockResolvedValue({ 
      data: [{ 
        claim_status: 'completed', 
        attempt_id: 'att-concurrent', 
        current_retry_count: 5,
        existing_decision: 'approved',
        existing_code: 'storage_pending',
        existing_evidence: 'Evidence',
        existing_evidence_id: null
      }], 
      error: null 
    });
    
    // Simula que outro processo ganhou a corrida de update
    (deps.attachEvidence as MockedFunction<any>).mockResolvedValue({ 
      data: [{ confirmed_evidence_id: 'ev-already-there' }], 
      error: null 
    });
    
    const res = await verifyCameraRequest(validPayload, validImage, deps);
    expect(res.status).toBe(200);
    expect((res.body as any).evidenceId).toBe('ev-already-there');
  });
});