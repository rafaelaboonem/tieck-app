import { describe, it, expect, vi } from 'vitest';
import { analyzeImageWithReference } from '../../../server/camera-ai/openai-provider';
import { evaluateGate } from '../../../server/camera-ai/gate';

describe('Camera AI Reference Mode Logic', () => {
  it('should accept a high confidence match', () => {
    const analysis = {
      target_visible: true,
      target_identity_confidence: 0.95,
      condition_observable: true,
      condition_met: true,
      image_quality_usable: true,
      positive_visible_evidence: ['objeto presente'],
      negative_visible_evidence: [],
      contradictions: [],
      overall_confidence: 0.95,
      user_message: 'Correto',
      reference_match: true,
      reference_match_confidence: 0.98,
      reference_differences: []
    };
    
    const result = evaluateGate(analysis);
    expect(result.ok).toBe(true);
    expect(result.decision).toBe('approved');
  });

  it('should reject when reference_match is false', () => {
    const analysis = {
      target_visible: true,
      target_identity_confidence: 0.95,
      condition_observable: true,
      condition_met: true,
      image_quality_usable: true,
      positive_visible_evidence: ['objeto presente'],
      negative_visible_evidence: [],
      contradictions: [],
      overall_confidence: 0.95,
      user_message: 'Diferente',
      reference_match: false,
      reference_match_confidence: 0.2,
      reference_differences: ['cor incompatível']
    };
    
    const result = evaluateGate(analysis);
    expect(result.decision).toBe('retake');
    expect(result.code).toBe('reference_mismatch');
  });

  it('should reject low confidence match (gate threshold 0.90)', () => {
    const analysis = {
      target_visible: true,
      target_identity_confidence: 0.95,
      condition_observable: true,
      condition_met: true,
      image_quality_usable: true,
      positive_visible_evidence: ['objeto presente'],
      negative_visible_evidence: [],
      contradictions: [],
      overall_confidence: 0.95,
      user_message: 'Parece, mas não tenho certeza',
      reference_match: true,
      reference_match_confidence: 0.85,
      reference_differences: []
    };
    
    const result = evaluateGate(analysis);
    expect(result.decision).toBe('retake');
    expect(result.code).toBe('reference_mismatch');
  });
});
