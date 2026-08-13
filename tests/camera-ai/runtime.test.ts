import { describe, it, expect, vi, beforeEach } from 'vitest';
import { evaluateGate } from '../../src/server/camera-ai/gate';
import { validateImageBuffer } from '../../src/server/camera-ai/image-validation';
import { CameraVerification } from '../../src/server/camera-ai/schema';

describe('Camera AI Server Runtime', () => {

  describe('Gate Logic', () => {
    it('1. gate aprovado: should approve valid compliance', () => {
      const mock: CameraVerification = {
        target_visible: true,
        condition_observable: true,
        condition_met: true,
        image_quality: "usable",
        confidence: 0.95,
        visible_evidence: "Pia limpa e seca.",
        user_message: "OK"
      };
      const result = evaluateGate(mock);
      expect(result.decision).toBe('approved');
    });

    it('2. alvo ausente: should require retake', () => {
      const mock: CameraVerification = {
        target_visible: false,
        condition_observable: true,
        condition_met: false,
        image_quality: "usable",
        confidence: 0.95,
        visible_evidence: "Objeto não encontrado.",
        user_message: "Fail"
      };
      const result = evaluateGate(mock);
      expect(result.decision).toBe('retake');
    });

    it('3. confiança 0.89: should require retake', () => {
      const mock: CameraVerification = {
        target_visible: true,
        condition_observable: true,
        condition_met: true,
        image_quality: "usable",
        confidence: 0.89,
        visible_evidence: "Parece correto.",
        user_message: "Uncertain"
      };
      const result = evaluateGate(mock);
      expect(result.decision).toBe('retake');
    });

    it('4. foto escura: should require retake with specific message', () => {
      const mock: CameraVerification = {
        target_visible: true,
        condition_observable: true,
        condition_met: true,
        image_quality: "dark",
        confidence: 0.95,
        visible_evidence: "Local muito escuro.",
        user_message: "Dark"
      };
      const result = evaluateGate(mock);
      expect(result.decision).toBe('retake');
      expect(result.message).toContain('escura');
    });

    it('5. linguagem especulativa: should reject "talvez"', () => {
      const mock: CameraVerification = {
        target_visible: true,
        condition_observable: true,
        condition_met: true,
        image_quality: "usable",
        confidence: 0.98,
        visible_evidence: "Talvez a pia esteja limpa.",
        user_message: "Speculative"
      };
      const result = evaluateGate(mock);
      expect(result.decision).toBe('retake');
    });
  });

  describe('Image Validation', () => {
    it('6. JPEG válido', async () => {
      const buffer = new Uint8Array([0xff, 0xd8, 0xff, 0xdb]).buffer;
      const res = await validateImageBuffer(buffer, 'image/jpeg');
      expect(res.valid).toBe(true);
    });

    it('7. PNG válido', async () => {
      const buffer = new Uint8Array([0x89, 0x50, 0x4e, 0x47]).buffer;
      const res = await validateImageBuffer(buffer, 'image/png');
      expect(res.valid).toBe(true);
    });

    it('8. WebP válido', async () => {
      const buffer = new Uint8Array([
        0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 
        0x57, 0x45, 0x42, 0x50
      ]).buffer;
      const res = await validateImageBuffer(buffer, 'image/webp');
      expect(res.valid).toBe(true);
    });

    it('9. MIME divergente', async () => {
      const buffer = new Uint8Array([0xff, 0xd8, 0xff, 0xdb]).buffer;
      const res = await validateImageBuffer(buffer, 'image/png');
      expect(res.valid).toBe(false);
      expect(res.code).toBe('mime_mismatch');
    });

    it('10. arquivo vazio', async () => {
      const buffer = new ArrayBuffer(0);
      const res = await validateImageBuffer(buffer, 'image/jpeg');
      expect(res.valid).toBe(false);
      expect(res.code).toBe('empty_file');
    });

    it('11. arquivo acima de 3 MB', async () => {
      const buffer = new ArrayBuffer(4 * 1024 * 1024);
      const res = await validateImageBuffer(buffer, 'image/jpeg');
      expect(res.valid).toBe(false);
      expect(res.code).toBe('file_too_large');
    });
  });

  describe('Integration Mocks (Authorization & Idempotency)', () => {
    // Tests for endpoint logic would go here, mock-driven.
    // Given the constraints, we focus on unit test coverage.
  });
});
