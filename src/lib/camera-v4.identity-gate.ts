import { IdentityResult } from './camera-v4.types';

export const decideIdentity = (res: IdentityResult): boolean => {
  return (
    res.candidate_usable === true &&
    res.target_visible === true &&
    res.same_target_type === true &&
    res.reference_1_match === true &&
    res.reference_2_match === true &&
    res.location_consistent === true &&
    res.identity_confidence >= 0.95 &&
    res.visible_identity_evidence.length > 0
  );
};
