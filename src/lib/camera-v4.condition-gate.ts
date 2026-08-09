import { ConditionResult } from './camera-v4.types';

export const decideCondition = (res: ConditionResult): boolean => {
  return (
    res.condition_observable === true &&
    res.condition_met === true &&
    res.image_quality_usable === true &&
    res.condition_confidence >= 0.95 &&
    res.visible_condition_evidence.length > 0
  );
};
