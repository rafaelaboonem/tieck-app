import { validateIdentity, validateCondition } from './camera-v4.sanitize';
import { decideIdentity } from './camera-v4.identity-gate';
import { decideCondition } from './camera-v4.condition-gate';

export const runV4GateTests = () => {
  const results = [];

  // 1. Aleatória + confiança alta
  try {
    const res = validateIdentity({
      candidate_usable: false, target_visible: false, same_target_type: false,
      reference_1_match: false, reference_2_match: false, location_consistent: false,
      identity_confidence: 0.98, visible_identity_evidence: "Parece uma parede", reason_code: "wrong_object"
    });
    results.push({ name: "Aleatória/Confiança Alta", passed: !decideIdentity(res) });
  } catch(e) { results.push({ name: "Aleatória/Confiança Alta", passed: false }); }

  // 2. target_visible false
  try {
    const res = validateIdentity({
      candidate_usable: true, target_visible: false, same_target_type: true,
      reference_1_match: true, reference_2_match: true, location_consistent: true,
      identity_confidence: 0.99, visible_identity_evidence: "Obscuro", reason_code: "target_missing"
    });
    results.push({ name: "target_visible false", passed: !decideIdentity(res) });
  } catch(e) { results.push({ name: "target_visible false", passed: false }); }

  // 3. Boolean como string
  try {
    validateIdentity({
      candidate_usable: "true", target_visible: true, same_target_type: true,
      reference_1_match: true, reference_2_match: true, location_consistent: true,
      identity_confidence: 0.99, visible_identity_evidence: "Ok", reason_code: "identity_confirmed"
    });
    results.push({ name: "Boolean como string", passed: false });
  } catch(e) { results.push({ name: "Boolean como string", passed: true }); }

  // 4. Confidence 95 (inteiro)
  try {
    validateIdentity({
      candidate_usable: true, target_visible: true, same_target_type: true,
      reference_1_match: true, reference_2_match: true, location_consistent: true,
      identity_confidence: 95, visible_identity_evidence: "Ok", reason_code: "identity_confirmed"
    });
    results.push({ name: "Confidence 95", passed: false });
  } catch(e) { results.push({ name: "Confidence 95", passed: true }); }

  // 5. Approved Final
  try {
    const id = validateIdentity({
      candidate_usable: true, target_visible: true, same_target_type: true,
      reference_1_match: true, reference_2_match: true, location_consistent: true,
      identity_confidence: 0.96, visible_identity_evidence: "Match", reason_code: "identity_confirmed"
    });
    const cond = validateCondition({
      condition_observable: true, condition_met: true, image_quality_usable: true,
      condition_confidence: 0.96, visible_condition_evidence: "Limpo", reason_code: "condition_confirmed"
    });
    results.push({ name: "Approved Final", passed: decideIdentity(id) && decideCondition(cond) });
  } catch(e) { results.push({ name: "Approved Final", passed: false }); }

  return results;
};
