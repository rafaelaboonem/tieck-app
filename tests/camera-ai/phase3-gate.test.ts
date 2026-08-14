import { describe, it, expect, vi, beforeEach } from 'vitest';
import { evaluateGate } from '../../src/server/camera-ai/gate';
import { CameraVerification } from '../../src/server/camera-ai/schema';

describe('Camera AI Phase 3 Gate: Semantic Fail-Closed Logic', () => {
  const baseAnalysis: CameraVerification = {
    target_visible: true,
    target_identity_confidence: 0.95,
    condition_observable: true,
    condition_met: true,
    image_quality_usable: true,
    positive_visible_evidence: ['notebook aberto'],
    negative_visible_evidence: [],
    contradictions: [],
    overall_confidence: 0.95,
    user_message: 'Foto aprovada.'
  };

  it('Aprova quando todos os critérios são atendidos', () => {
    const result = evaluateGate(baseAnalysis);
    expect(result.decision).toBe('approved');
    expect(result.ok).toBe(true);
  });

  it('Rejeita (retake) se o objeto não for visível', () => {
    const analysis = { ...baseAnalysis, target_visible: false, user_message: 'Objeto ausente.' };
    const result = evaluateGate(analysis);
    expect(result.decision).toBe('retake');
    expect(result.code).toBe('target_missing');
  });

  it('Rejeita (retake) se a confiança na identidade for baixa', () => {
    const analysis = { ...baseAnalysis, target_identity_confidence: 0.85 };
    const result = evaluateGate(analysis);
    expect(result.decision).toBe('retake');
  });

  it('Retorna not_observable se a condição não puder ser vista', () => {
    const analysis = { ...baseAnalysis, condition_observable: false, user_message: 'Obstruído.' };
    const result = evaluateGate(analysis);
    expect(result.decision).toBe('not_observable');
    expect(result.code).toBe('not_observable');
  });

  it('Rejeita (retake) se a qualidade for ruim', () => {
    const analysis = { ...baseAnalysis, image_quality_usable: false };
    const result = evaluateGate(analysis);
    expect(result.decision).toBe('retake');
    expect(result.code).toBe('quality_failure');
  });

  it('Retorna not_observable se houver contradições', () => {
    const analysis = { ...baseAnalysis, contradictions: ['Luz de fundo confusa'] };
    const result = evaluateGate(analysis);
    expect(result.decision).toBe('not_observable');
  });

  it('Rejeita se a confiança geral for baixa (0.89)', () => {
    const analysis = { ...baseAnalysis, overall_confidence: 0.89 };
    const result = evaluateGate(analysis);
    expect(result.decision).toBe('retake');
  });

  it('Retorna not_observable se não houver evidência positiva', () => {
    const analysis = { ...baseAnalysis, positive_visible_evidence: [] };
    const result = evaluateGate(analysis);
    expect(result.decision).toBe('not_observable');
  });
});