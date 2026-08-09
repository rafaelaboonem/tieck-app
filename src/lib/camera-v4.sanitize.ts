import { IdentityResult, ConditionResult } from './camera-v4.types';

export const validateIdentity = (raw: any): IdentityResult => {
  if (typeof raw !== 'object' || raw === null) throw new Error('Invalid JSON object');
  
  const required = [
    'candidate_usable', 'target_visible', 'same_target_type',
    'reference_1_match', 'reference_2_match', 'location_consistent',
    'identity_confidence', 'visible_identity_evidence', 'reason_code'
  ];

  for (const field of required) {
    if (!(field in raw)) throw new Error(`Missing field: ${field}`);
  }

  if (typeof raw.identity_confidence !== 'number' || isNaN(raw.identity_confidence) || raw.identity_confidence < 0 || raw.identity_confidence > 1) {
    throw new Error('Invalid confidence value');
  }

  const booleans = ['candidate_usable', 'target_visible', 'same_target_type', 'reference_1_match', 'reference_2_match', 'location_consistent'];
  for (const b of booleans) {
    if (typeof raw[b] !== 'boolean') throw new Error(`Field ${b} must be a boolean`);
  }

  if (!raw.visible_identity_evidence || raw.visible_identity_evidence.trim().length === 0) {
    throw new Error('Empty evidence');
  }

  return raw as IdentityResult;
};

export const validateCondition = (raw: any): ConditionResult => {
  if (typeof raw !== 'object' || raw === null) throw new Error('Invalid JSON object');

  const required = [
    'condition_observable', 'condition_met', 'image_quality_usable',
    'condition_confidence', 'visible_condition_evidence', 'reason_code'
  ];

  for (const field of required) {
    if (!(field in raw)) throw new Error(`Missing field: ${field}`);
  }

  if (typeof raw.condition_confidence !== 'number' || isNaN(raw.condition_confidence) || raw.condition_confidence < 0 || raw.condition_confidence > 1) {
    throw new Error('Invalid confidence value');
  }

  const booleans = ['condition_observable', 'condition_met', 'image_quality_usable'];
  for (const b of booleans) {
    if (typeof raw[b] !== 'boolean') throw new Error(`Field ${b} must be a boolean`);
  }

  if (!raw.visible_condition_evidence || raw.visible_condition_evidence.trim().length === 0) {
    throw new Error('Empty evidence');
  }

  return raw as ConditionResult;
};
