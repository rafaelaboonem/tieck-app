import { hashQuestion } from "./hashing";
import type { CameraVerificationPolicyV1 } from "./schema.functions";

export interface CameraPolicyReadyInput {
  title?: string;
  description?: string;
  policy?: CameraVerificationPolicyV1;
  needsRevalidation?: boolean;
  isCompiling?: boolean;
}

/** Barreira fail-closed para liberar o teste somente da pergunta atual. */
export async function isCameraPolicyReady(input: CameraPolicyReadyInput): Promise<boolean> {
  if (input.isCompiling === true || input.needsRevalidation === true || !input.policy) return false;
  return input.policy.questionHash === await hashQuestion(input.title, input.description);
}
