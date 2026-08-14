import { describe, it, expect, vi, beforeEach } from 'vitest';
import { verifyCameraRequest, VerifyDependencies } from '../../src/server/camera-ai/verify-handler';
import { VerifyPayload } from '../../src/server/camera-ai/schema';

describe('Camera AI Recovery & Explicit Errors', () => {
  const mockDeps: VerifyDependencies = {
    mode: 'enabled',
    model: 'gpt-4o-mini',
    now: () => new Date(),
    isConfigured: () => true,
    resolveSession: vi.fn(),
    claimAttempt: vi.fn(),
    hitRateLimit: vi.fn(),
    analyzeImage: vi.fn(),
    markFailed: vi.fn(),
    markCompleted: vi.fn(),
  };

  const payload: VerifyPayload = {
    checklistId: '00000000-0000-0000-0000-000000000000',
    blockId: 'block-1',
    responseToken: 'valid-token',
    idempotencyKey: '11111111-1111-1111-1111-111111111111',
  };

  // Valid JPEG header
  const jpegBuffer = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 16, 0x4a, 0x46, 0x49, 0x46, 0, 1, 1, 1, 0, 72, 0, 72, 0, 0]).buffer;
  const image = { buffer: jpegBuffer, type: 'image/jpeg' };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return 401 with explicit message for invalid token', async () => {
    (mockDeps.resolveSession as any).mockResolvedValue({ data: null, error: null });
    
    const result = await verifyCameraRequest(payload, image, mockDeps);
    
    expect(result.status).toBe(401);
    expect((result.body as any).code).toBe('unauthorized');
    expect((result.body as any).message).toContain('Sua sessão expirou');
  });

  it('should return 403 with explicit message for checklist mismatch', async () => {
    (mockDeps.resolveSession as any).mockResolvedValue({ 
      data: [{ checklist_id: 'different-id', response_id: 'resp-1' }], 
      error: null 
    });
    
    const result = await verifyCameraRequest(payload, image, mockDeps);
    
    expect(result.status).toBe(403);
    expect((result.body as any).code).toBe('id_mismatch');
    expect((result.body as any).message).toContain('não pertence a este checklist');
  });

  it('should return 404 with explicit message for invalid_block', async () => {
    (mockDeps.resolveSession as any).mockResolvedValue({ 
      data: [{ 
        checklist_id: payload.checklistId, 
        response_id: 'resp-1',
        published_content: { blocks: [] } 
      }], 
      error: null 
    });
    
    const result = await verifyCameraRequest(payload, image, mockDeps);
    
    expect(result.status).toBe(404);
    expect((result.body as any).code).toBe('invalid_block');
    expect((result.body as any).message).toContain('checklist foi atualizado');
  });

  it('should include a requestId in the response', async () => {
    (mockDeps.resolveSession as any).mockResolvedValue({ data: null, error: null });
    const result = await verifyCameraRequest(payload, image, mockDeps);
    expect((result.body as any).requestId).toBeDefined();
  });
});
