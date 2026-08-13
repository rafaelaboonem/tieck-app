import { describe, it, expect, vi, beforeEach } from 'vitest';
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
    it('analyzeImage calls correct API and extracts output_parsed', async () => {
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
          model: 'gpt-4o-mini',
          input: expect.arrayContaining([
            expect.objectContaining({ role: 'user' })
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
});
