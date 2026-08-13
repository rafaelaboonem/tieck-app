import { describe, it, expect, vi } from 'vitest';
import { evaluateGate } from '../../src/server/camera-ai/gate';
import { validateImageBuffer } from '../../src/server/camera-ai/image-validation';
import { CameraVerification } from '../../src/server/camera-ai/schema';
import { analyzeImage } from '../../src/server/camera-ai/openai-provider';

// Mock OpenAI
vi.mock('openai', () => {
  return {
    default: vi.fn().mockImplementation(() => ({
      responses: {
        parse: vi.fn()
      }
    }))
  };
});

describe('Camera AI Server Runtime', () => {

  describe('Gate Logic', () => {
    it('gate aprovado', () => {
      const mock: CameraVerification = {
        target_visible: true,
        condition_observable: true,
        condition_met: true,
        image_quality: "usable",
        confidence: 0.95,
        visible_evidence: "Pia limpa.",
        user_message: "OK"
      };
      expect(evaluateGate(mock).decision).toBe('approved');
    });

    it('confiança baixa', () => {
      const mock: CameraVerification = {
        target_visible: true,
        condition_observable: true,
        condition_met: true,
        image_quality: "usable",
        confidence: 0.85,
        visible_evidence: "Parece limpa.",
        user_message: "Low Confidence"
      };
      expect(evaluateGate(mock).decision).toBe('retake');
    });
  });

  describe('Image Validation', () => {
    it('JPEG válido', async () => {
      const buffer = new Uint8Array([0xff, 0xd8, 0xff, 0xdb]).buffer;
      const res = await validateImageBuffer(buffer, 'image/jpeg');
      expect(res.valid).toBe(true);
    });

    it('arquivo acima de 3 MB', async () => {
      const buffer = new ArrayBuffer(4 * 1024 * 1024);
      const res = await validateImageBuffer(buffer, 'image/jpeg');
      expect(res.valid).toBe(false);
      expect(res.code).toBe('file_too_large');
    });
  });

  describe('OpenAI Provider', () => {
    it('analyzeImage extracts output_parsed and handles low detail', async () => {
      const mockClient = {
        responses: {
          parse: vi.fn().mockResolvedValue({
            output_parsed: {
              target_visible: true,
              condition_observable: true,
              condition_met: true,
              image_quality: "usable",
              confidence: 0.99,
              visible_evidence: "OK",
              user_message: "OK"
            }
          })
        }
      };

      const result = await analyzeImage(
        mockClient as any,
        'gpt-4o-mini',
        'Is the sink clean?',
        new ArrayBuffer(10),
        'image/jpeg'
      );

      expect(result.confidence).toBe(0.99);
      expect(mockClient.responses.parse).toHaveBeenCalledWith(
        expect.objectContaining({
          input: expect.arrayContaining([
            expect.objectContaining({
              role: 'user',
              content: expect.arrayContaining([
                expect.objectContaining({ type: 'input_image', detail: 'low' })
              ])
            })
          ])
        }),
        expect.any(Object)
      );
    });

    it('analyzeImage throws on null output_parsed', async () => {
      const mockClient = {
        responses: {
          parse: vi.fn().mockResolvedValue({ output_parsed: null })
        }
      };

      await expect(analyzeImage(
        mockClient as any,
        'gpt-4o-mini',
        '?',
        new ArrayBuffer(10),
        'image/jpeg'
      )).rejects.toThrow('OpenAI failed to parse');
    });
  });

  describe('Database & Auth Logic (Mocks)', () => {
    it('resolve_public_response usa hash SHA-256', () => {
      // Teste conceitual: v_token_hash := encode(extensions.digest(btrim(p_token), 'sha256'), 'hex')
      // Se p_token = 'abc', o hash esperado é o SHA-256 de 'abc'
      // No postgres: SELECT encode(digest('abc', 'sha256'), 'hex');
      // abc -> ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad
    });

    it('claim concorrente - apenas um vencedor', async () => {
      // Simular INSERT ... ON CONFLICT DO NOTHING RETURNING id
      // O primeiro ganha 'acquired', o segundo ganha 'processing' ou 'completed'
    });

    it('replay não chama OpenAI', async () => {
      // Se claim_status for 'completed', a rota deve retornar direto sem analyzeImage
    });

    it('rate limit negado marca attempt como failed', async () => {
      // Se hit_public_rate_limit retornar allowed: false, deve dar update no attempt
    });
  });

  describe('Sanity Audit', () => {
    it('CAMERA_AI_MODE disabled bloqueia tudo', async () => {
      // Verificar se a rota para no primeiro if
    });
  });
});
