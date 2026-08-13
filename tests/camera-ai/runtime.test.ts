import { describe, it, expect, vi, beforeEach } from 'vitest';
import { evaluateGate } from '../../src/server/camera-ai/gate';
import { validateImageBuffer } from '../../src/server/camera-ai/image-validation';
import { CameraVerification, PublishedBlock } from '../../src/server/camera-ai/schema';
import { verifyCameraRequest, VerifyDependencies } from '../../src/server/camera-ai/verify-handler';
import fs from 'fs';
import path from 'path';

describe('Camera AI Server Runtime', () => {
  let deps: VerifyDependencies;
  const mockNow = new Date('2026-08-13T20:00:00Z');

  beforeEach(() => {
    vi.clearAllMocks();
    deps = {
      mode: 'enabled',
      openai: {},
      model: 'gpt-4o-mini',
      supabaseAdmin: {},
      now: () => mockNow,
      resolveSession: vi.fn().mockResolvedValue({ 
        data: [{ 
          response_id: 'res-1', 
          checklist_id: 'chk-1', 
          published_content: { 
            blocks: [{ id: 'blk-1', type: 'camera', title: 'Test' }] 
          } 
        }], 
        error: null 
      }),
      claimAttempt: vi.fn().mockResolvedValue({ data: [{ claim_status: 'acquired' }], error: null }),
      hitRateLimit: vi.fn().mockResolvedValue({ data: [{ allowed: true }], error: null }),
      analyzeImage: vi.fn().mockResolvedValue({ confidence: 0.95, target_visible: true, condition_observable: true, condition_met: true, image_quality: 'usable', visible_evidence: 'ok', user_message: 'ok' }),
      markFailed: vi.fn().mockResolvedValue({ data: {}, error: null }),
      markCompleted: vi.fn().mockResolvedValue({ data: { id: 'attempt-1' }, error: null }),
    };
  });

  describe('Handler Unit Tests (verifyCameraRequest)', () => {
    const validPayload = {
      checklistId: 'chk-1',
      blockId: 'blk-1',
      responseToken: 'token-1',
      idempotencyKey: '00000000-0000-0000-0000-000000000000'
    };
    const validImage = { buffer: new Uint8Array([0xff, 0xd8, 0xff, 0xdb]).buffer, type: 'image/jpeg' };

    it('modo disabled retorna 503 e analyzeImage não é chamado', async () => {
      deps.mode = 'disabled';
      const res = await verifyCameraRequest(validPayload, validImage, deps);
      expect(res.status).toBe(503);
      expect(res.body.code).toBe('camera_ai_disabled');
      expect(deps.analyzeImage).not.toHaveBeenCalled();
    });

    it('configuração ausente retorna 503', async () => {
      deps.supabaseAdmin = null;
      const res = await verifyCameraRequest(validPayload, validImage, deps);
      expect(res.status).toBe(503);
      expect(res.body.code).toBe('config_missing');
    });

    it('token inválido retorna 401 e analyzeImage não é chamado', async () => {
      (deps.resolveSession as any).mockResolvedValue({ data: [], error: null });
      const res = await verifyCameraRequest(validPayload, validImage, deps);
      expect(res.status).toBe(401);
      expect(deps.analyzeImage).not.toHaveBeenCalled();
    });

    it('checklist divergente retorna 403', async () => {
      const payload = { ...validPayload, checklistId: 'wrong-chk' };
      const res = await verifyCameraRequest(payload, validImage, deps);
      expect(res.status).toBe(403);
      expect(res.body.code).toBe('id_mismatch');
    });

    it('bloco ausente retorna 404', async () => {
      (deps.resolveSession as any).mockResolvedValue({ 
        data: [{ response_id: 'r1', checklist_id: 'chk-1', published_content: { blocks: [] } }], 
        error: null 
      });
      const res = await verifyCameraRequest(validPayload, validImage, deps);
      expect(res.status).toBe(404);
      expect(res.body.code).toBe('invalid_block');
    });

    it('bloco que não é camera retorna 404', async () => {
      (deps.resolveSession as any).mockResolvedValue({ 
        data: [{ 
          response_id: 'r1', 
          checklist_id: 'chk-1', 
          published_content: { blocks: [{ id: 'blk-1', type: 'text' }] } 
        }], 
        error: null 
      });
      const res = await verifyCameraRequest(validPayload, validImage, deps);
      expect(res.status).toBe(404);
    });

    it('claim completed retorna replay e analyzeImage não é chamado', async () => {
      (deps.claimAttempt as any).mockResolvedValue({ 
        data: [{ claim_status: 'completed', existing_decision: 'approved', existing_code: 'ok' }], 
        error: null 
      });
      const res = await verifyCameraRequest(validPayload, validImage, deps);
      expect(res.status).toBe(200);
      expect(res.body.message).toContain('Replay');
      expect(deps.analyzeImage).not.toHaveBeenCalled();
    });

    it('claim processing retorna 409', async () => {
      (deps.claimAttempt as any).mockResolvedValue({ data: [{ claim_status: 'processing' }], error: null });
      const res = await verifyCameraRequest(validPayload, validImage, deps);
      expect(res.status).toBe(409);
    });

    it('rate limit negado chama markFailed e não chama analyzeImage', async () => {
      (deps.hitRateLimit as any).mockResolvedValue({ data: [{ allowed: false }], error: null });
      const res = await verifyCameraRequest(validPayload, validImage, deps);
      expect(res.status).toBe(429);
      expect(deps.markFailed).toHaveBeenCalledWith(expect.objectContaining({ code: 'rate_limit' }));
      expect(deps.analyzeImage).not.toHaveBeenCalled();
    });

    it('provider falha chama markFailed', async () => {
      (deps.analyzeImage as any).mockRejectedValue(new Error('AI fail'));
      await expect(verifyCameraRequest(validPayload, validImage, deps)).rejects.toThrow();
      expect(deps.markFailed).toHaveBeenCalledWith(expect.objectContaining({ code: 'provider_failure' }));
    });

    it('provider aprovado chama markCompleted', async () => {
      const res = await verifyCameraRequest(validPayload, validImage, deps);
      expect(res.status).toBe(200);
      expect(deps.markCompleted).toHaveBeenCalled();
    });

    it('markCompleted retornando zero linhas resulta 500', async () => {
      (deps.markCompleted as any).mockResolvedValue({ data: null, error: null });
      const res = await verifyCameraRequest(validPayload, validImage, deps);
      expect(res.status).toBe(500);
      expect(res.body.code).toBe('persistence_error');
    });

    it('pergunta utilizada vem do published_content e não do cliente', async () => {
      (deps.resolveSession as any).mockResolvedValue({ 
        data: [{ 
          response_id: 'r1', 
          checklist_id: 'chk-1', 
          published_content: { blocks: [{ id: 'blk-1', type: 'camera', title: 'Pergunta Real' }] } 
        }], 
        error: null 
      });
      await verifyCameraRequest(validPayload, validImage, deps);
      expect(deps.analyzeImage).toHaveBeenCalledWith(expect.anything(), expect.anything(), 'Pergunta Real', expect.anything(), expect.anything());
    });
  });

  describe('Schema Validation', () => {
    it('idempotencyKey inválida falha no Zod', () => {
      const { VerifyPayloadSchema } = require('../../src/server/camera-ai/schema');
      const invalid = { checklistId: 'chk-1', blockId: 'blk-1', responseToken: 't', idempotencyKey: 'not-a-uuid' };
      const result = VerifyPayloadSchema.safeParse(invalid);
      expect(result.success).toBe(false);
    });
  });

  describe('Static SQL Validation', () => {
    it('migration contém as correções exigidas', () => {
      const migrationPath = path.resolve(process.cwd(), 'supabase/migrations/20260813203351_494f8cca-6603-47ae-b28d-e2a7c90741fd.sql');
      const content = fs.readFileSync(migrationPath, 'utf8');
      
      expect(content).toContain('c.workspace_id');
      expect(content).toContain('r.status::text');
      expect(content).not.toContain('r.workspace_id');
      expect(content).toContain("digest(btrim(p_token), 'sha256')");
      expect(content).toContain('INSERT INTO public.camera_ai_attempts');
      expect(content).toContain('ON CONFLICT (response_id, block_id, idempotency_key) DO NOTHING');
      expect(content).toContain('GRANT ALL ON public.camera_ai_attempts TO service_role');
      expect(content).toContain('GRANT EXECUTE ON FUNCTION public.resolve_public_response(text) TO service_role');
    });
  });
});
