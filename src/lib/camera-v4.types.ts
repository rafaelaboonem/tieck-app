export type CameraV4State = 
  | 'created' 
  | 'uploaded' 
  | 'identity_check' 
  | 'condition_check' 
  | 'approved' 
  | 'retake' 
  | 'not_observable' 
  | 'technical_failure';

export type CameraV4Decision = 
  | 'approved' 
  | 'retake' 
  | 'not_observable' 
  | 'technical_failure';

export interface IdentityResult {
  candidate_usable: boolean;
  target_visible: boolean;
  same_target_type: boolean;
  reference_1_match: boolean;
  reference_2_match: boolean;
  location_consistent: boolean;
  identity_confidence: number;
  visible_identity_evidence: string;
  reason_code: 'identity_confirmed' | 'target_missing' | 'wrong_object' | 'wrong_location' | 'image_unusable' | 'insufficient_identity_evidence';
}

export interface ConditionResult {
  condition_observable: boolean;
  condition_met: boolean;
  image_quality_usable: boolean;
  condition_confidence: number;
  visible_condition_evidence: string;
  reason_code: 'condition_confirmed' | 'condition_not_met' | 'condition_not_observable' | 'image_unusable' | 'insufficient_condition_evidence';
}
