import { hashQuestion } from "./hashing";
import type { CameraVerificationPolicyV1 } from "./schema.functions";

export interface CameraPolicyReadyInput {
  title?: string;
  description?: string;
  policy?: CameraVerificationPolicyV1;
  needsRevalidation?: boolean;
  hasUnsavedChanges?: boolean;
  isCompiling?: boolean;
  /** Confirma que title/description e a policy vieram da última leitura persistida. */
  isPersisted?: boolean;
}

/** Barreira fail-closed para liberar o teste somente da versão persistida atual. */
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

  const currentHash = await hashQuestion(input.title, input.description);
  return input.policy.questionHash === currentHash;
}
