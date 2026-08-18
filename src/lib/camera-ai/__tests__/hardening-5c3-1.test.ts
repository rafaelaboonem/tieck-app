import { describe, it, expect, vi } from 'vitest';
import { verifyCameraRequest, VerifyDependencies } from '../../../server/camera-ai/verify-handler';
import { VerifyPayload, PublishedBlock } from '../../../server/camera-ai/schema';
import { createHash } from 'crypto';

const mockDeps = (overrides: Partial<VerifyDependencies> = {}): VerifyDependencies => ({
  mode: 'enabled',
  model: 'gpt-4o-mini',
  requestId: 'test-req',
  now: () => new Date('2026-08-18T10:00:00Z'),
  isConfigured: () => true,
  resolveSession: vi.fn().mockResolvedValue({
    data: [{
      response_id: 'resp-123',
      checklist_id: 'chk-123',
      published_content: {
        blocks: []
      }
    }],
    error: null
  }),
  claimAttempt: vi.fn().mockResolvedValue({ data: [{ claim_status: 'acquired', attempt_id: 'att-123' }], error: null }),
  hitRateLimit: vi.fn().mockResolvedValue({ data: [{ allowed: true }], error: null }),
  analyzeImage: vi.fn(),
  analyzeImageWithReference: vi.fn(),
  loadReferenceImage: vi.fn(),
  markFailed: vi.fn().mockResolvedValue({ data: {}, error: null }),
  markCompleted: vi.fn().mockResolvedValue({ data: { id: 'done' }, error: null }),
  attachEvidence: vi.fn(),
  persistEvidence: vi.fn().mockResolvedValue({ evidenceId: 'ev-123', error: null }),
  ...overrides
});

const validPolicy = (question: string) => ({
  version: 1,
  questionHash: createHash('sha256').update(question).digest('hex'),
  source: 'generated',
  verifiability: 'visual',
  target: 'target',
  condition: 'condition',
  targetDescription: 'td',
  conditionDescription: 'cd',
  requiredVisibleEvidence: [],
  rejectionSignals: [],
  notObservableSignals: [],
  summary: 'summary'
});

describe('Verify Handler 5C.3.1 - Reference Mode Hardening', () => {
  const payload: VerifyPayload = {
    checklistId: 'chk-123',
    blockId: 'blk-1',
    responseToken: 'token-123',
    idempotencyKey: 'idem-123'
  };

  const image = { buffer: new Uint8Array([0xff, 0xd8, 0xff, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]).buffer, type: 'image/jpeg' };

  it('should FAIL-CLOSED if mode is reference but cameraReference is missing', async () => {
    const block: PublishedBlock = {
      id: 'blk-1',
      type: 'camera',
      title: 'Test Question',
      mode: 'reference',
      cameraAiPolicy: validPolicy('Test Question') as any
    };

    const deps = mockDeps({
      resolveSession: vi.fn().mockResolvedValue({
        data: [{
          response_id: 'resp-123',
          checklist_id: 'chk-123',
          published_content: { blocks: [block] }
        }],
        error: null
      })
    });

    const result = await verifyCameraRequest(payload, image, deps);
    expect(result.status).toBe(400);
    expect(result.body.code).toBe('reference_unavailable');
    expect(deps.analyzeImage).not.toHaveBeenCalled();
    expect(deps.analyzeImageWithReference).not.toHaveBeenCalled();
  });

  it('should FAIL-CLOSED if SHA-256 mismatch in reference image', async () => {
    const refMeta = {
      version: 1,
      storagePath: 'ref.jpg',
      mimeType: 'image/jpeg',
      sha256: 'correct-sha-but-we-will-provide-wrong-buffer-later',
      sizeBytes: 10
    };

    const block: PublishedBlock = {
      id: 'blk-1',
      type: 'camera',
      title: 'Test',
      mode: 'reference',
      cameraAiPolicy: validPolicy('Test') as any,
      cameraReference: refMeta as any
    };

    const deps = mockDeps({
      resolveSession: vi.fn().mockResolvedValue({
        data: [{
          response_id: 'resp-123',
          checklist_id: 'chk-123',
          published_content: { blocks: [block] }
        }],
        error: null
      }),
      loadReferenceImage: vi.fn().mockResolvedValue({
        buffer: new Uint8Array([0xff, 0xd8, 0xff, 0x00, 1, 1, 1, 1, 1, 1]).buffer, // Valid JPEG header but wrong content
        mimeType: 'image/jpeg'
      })
    });

    const result = await verifyCameraRequest(payload, image, deps);
    expect(result.status).toBe(400);
    expect(result.body.code).toBe('reference_corrupted');
    expect(deps.analyzeImageWithReference).not.toHaveBeenCalled();
  });

  it('should use analyzeImage in AUTO mode even if reference is missing', async () => {
    const block: PublishedBlock = {
      id: 'blk-1',
      type: 'camera',
      title: 'Auto Test',
      mode: 'auto',
      cameraAiPolicy: validPolicy('Auto Test') as any
    };

    const deps = mockDeps({
      resolveSession: vi.fn().mockResolvedValue({
        data: [{
          response_id: 'resp-123',
          checklist_id: 'chk-123',
          published_content: { blocks: [block] }
        }],
        error: null
      }),
      analyzeImage: vi.fn().mockResolvedValue({ 
        overall_confidence: 1, 
        user_message: 'ok',
        target_visible: true,
        target_identity_confidence: 1,
        condition_observable: true,
        condition_met: true,
        image_quality_usable: true,
        positive_visible_evidence: [],
        negative_visible_evidence: [],
        contradictions: []
      })
    });

    const result = await verifyCameraRequest(payload, image, deps);
    expect(result.status).toBe(200);
    expect(deps.analyzeImage).toHaveBeenCalled();
  });

  it('should distinguish reference_unavailable from provider_failure', async () => {
     const block: PublishedBlock = {
      id: 'blk-1',
      type: 'camera',
      title: 'Ref Test',
      mode: 'reference',
      cameraAiPolicy: validPolicy('Ref Test') as any,
      cameraReference: {
        version: 1,
        storagePath: 'missing.jpg',
        mimeType: 'image/jpeg',
        sha256: 'a'.repeat(64),
        sizeBytes: 10
      } as any
    };

    const deps = mockDeps({
      resolveSession: vi.fn().mockResolvedValue({
        data: [{
          response_id: 'resp-123',
          checklist_id: 'chk-123',
          published_content: { blocks: [block] }
        }],
        error: null
      }),
      loadReferenceImage: vi.fn().mockRejectedValue(new Error('Storage error'))
    });

    const result = await verifyCameraRequest(payload, image, deps);
    expect(result.body.code).toBe('reference_unavailable');
    expect(deps.markFailed).toHaveBeenCalledWith(expect.objectContaining({ response_id: 'resp-123', code: 'reference_unavailable' }));
  });
});
