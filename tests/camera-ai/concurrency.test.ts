import { describe, it, expect, vi, beforeEach } from 'vitest';
import { VerifyPayload } from '../../src/server/camera-ai/schema';
import { verifyCameraRequest, VerifyDependencies, PublicSession } from '../../src/server/camera-ai/verify-handler';

describe('Camera AI Storage Concurrency & Cleanup', () => {
  let deps: VerifyDependencies;
  const mockNow = new Date('2026-08-14T05:00:00Z');

  const validPayload: VerifyPayload = {
    checklistId: 'c123',
    blockId: 'blk-1',
    responseToken: 'token-1',
    idempotencyKey: '00000000-0000-0000-0000-000000000000'
  };
  // valid JPEG magic bytes: 0xFF 0xD8 0xFF 0xDB
  const validImage = { buffer: new Uint8Array([0xff, 0xd8, 0xff, 0xdb, 0x00, 0x00]).buffer, type: 'image/jpeg' };

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
          checklist_id: 'c123', 
          workspace_id: 'w1',
          status: 'in_progress',
          published_content: { blocks: [{ id: 'blk-1', type: 'camera' }] } 
        } satisfies PublicSession], 
        error: null 
      }),
      claimAttempt: vi.fn().mockResolvedValue({ data: [{ claim_status: 'acquired', attempt_id: 'a1', current_retry_count: 0 }], error: null }),
      hitRateLimit: vi.fn().mockResolvedValue({ data: [{ allowed: true }], error: null }),
      analyzeImage: vi.fn().mockResolvedValue({ decision: 'approved', confidence: 1, target_visible: true, condition_observable: true, condition_met: true, image_quality: 'usable', visible_evidence: 'ok', user_message: 'ok' }),
      markFailed: vi.fn().mockResolvedValue({ data: {}, error: null }),
      markCompleted: vi.fn().mockResolvedValue({ data: { id: 'a1' }, error: null }),
      persistEvidence: vi.fn().mockResolvedValue({ evidenceId: 'ev-1', error: null }),
      attachEvidence: vi.fn().mockResolvedValue({ data: [{ confirmed_evidence_id: 'ev-1' }], error: null }),
    };
  });

  it('E. Corrida no Storage: upload retorna 409, falha no banco -> retorna storage_failure', async () => {
    deps.persistEvidence = vi.fn().mockResolvedValue({ evidenceId: null, error: 'DB Error after conflict' });
    const res = await verifyCameraRequest(validPayload, validImage, deps);
    expect(res.status).toBe(500);
    expect((res.body as any).code).toBe('storage_failure');
  });
});