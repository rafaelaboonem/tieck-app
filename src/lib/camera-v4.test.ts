import { describe, it, expect } from 'vitest';
import { validateIdentity, validateCondition } from './camera-v4.sanitize';
import { decideIdentity } from './camera-v4.identity-gate';
import { decideCondition } from './camera-v4.condition-gate';

describe('Camera V4 Gate Tests', () => {
  it('should reject random photo even with high confidence', () => {
    const res = validateIdentity({
      candidate_usable: false, target_visible: false, same_target_type: false,
      reference_1_match: false, reference_2_match: false, location_consistent: false,
      identity_confidence: 0.98, visible_identity_evidence: "Parece uma parede", reason_code: "wrong_object"
    });
    expect(decideIdentity(res)).toBe(false);
  });

  it('should reject when target is not visible', () => {
    const res = validateIdentity({
      candidate_usable: true, target_visible: false, same_target_type: true,
      reference_1_match: true, reference_2_match: true, location_consistent: true,
      identity_confidence: 0.99, visible_identity_evidence: "Obscuro", reason_code: "target_missing"
    });
    expect(decideIdentity(res)).toBe(false);
  });

  it('should throw error when boolean is provided as string', () => {
    expect(() => validateIdentity({
      candidate_usable: "true" as any, target_visible: true, same_target_type: true,
      reference_1_match: true, reference_2_match: true, location_consistent: true,
      identity_confidence: 0.99, visible_identity_evidence: "Ok", reason_code: "identity_confirmed"
    })).toThrow();
  });

  it('should throw error when confidence is provided as integer 95', () => {
    expect(() => validateIdentity({
      candidate_usable: true, target_visible: true, same_target_type: true,
      reference_1_match: true, reference_2_match: true, location_consistent: true,
      identity_confidence: 95 as any, visible_identity_evidence: "Ok", reason_code: "identity_confirmed"
    })).toThrow();
  });

  it('should approve when both gates pass with high confidence', () => {
    const id = validateIdentity({
      candidate_usable: true, target_visible: true, same_target_type: true,
      reference_1_match: true, reference_2_match: true, location_consistent: true,
      identity_confidence: 0.96, visible_identity_evidence: "Match", reason_code: "identity_confirmed"
    });
    const cond = validateCondition({
      condition_observable: true, condition_met: true, image_quality_usable: true,
      condition_confidence: 0.96, visible_condition_evidence: "Limpo", reason_code: "condition_confirmed"
    });
    expect(decideIdentity(id)).toBe(true);
    expect(decideCondition(cond)).toBe(true);
  });

  it('should reject when identity passes but condition is not observable', () => {
    const id = validateIdentity({
      candidate_usable: true, target_visible: true, same_target_type: true,
      reference_1_match: true, reference_2_match: true, location_consistent: true,
      identity_confidence: 0.96, visible_identity_evidence: "Match", reason_code: "identity_confirmed"
    });
    const cond = validateCondition({
      condition_observable: false, condition_met: true, image_quality_usable: true,
      condition_confidence: 0.96, visible_condition_evidence: "Inconclusivo", reason_code: "condition_not_observable"
    });
    expect(decideIdentity(id)).toBe(true);
    expect(decideCondition(cond)).toBe(false);
  });
});
