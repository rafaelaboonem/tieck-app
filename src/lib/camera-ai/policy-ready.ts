import { hashQuestion } from "./hashing";
import type { CameraVerificationPolicyV1 } from "./schema.functions";

export interface CameraPolicyReadyInput {
  title?: string;
  description?: string;
  policy?: CameraVerificationPolicyV1;
  needsRevalidation?: boolean;
  hasUnsavedChanges?: boolean;
  isCompiling?: boolean;
  isPersisted?: boolean;
}

export async function isCameraPolicyReady(input: CameraPolicyReadyInput): Promise<boolean> {
  if (
    input.hasUnsavedChanges === true ||
    input.isCompiling === true ||
    input.needsRevalidation === true ||
    input.isPersisted !== true ||
    !input.policy
  ) {
    return false;
  }

  return input.policy.questionHash === await hashQuestion(input.title, input.description);
}
