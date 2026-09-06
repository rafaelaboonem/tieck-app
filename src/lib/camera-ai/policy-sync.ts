import { hashQuestion } from "./hashing";
import {
  CameraVerificationPolicyV1,
  CameraVerificationPolicyV1Schema,
} from "./schema.functions";

export interface CompiledPolicyResponse {
  ok: boolean;
  policy?: CameraVerificationPolicyV1;
}

export interface CameraPolicySyncDeps {
  /** Latest committed blocks (page holds them in a ref to avoid stale closures). */
  getBlocks: () => any[];
  /** Persist the full blocks column of the checklist; must resolve with real Supabase success. */
  persistBlocks: (blocks: any[]) => Promise<boolean>;
  /** POST /api/camera-ai/compile-policy against the PERSISTED checklist. */
  compilePolicy: (checklistId: string, blockId: string) => Promise<CompiledPolicyResponse>;
  /** Reflect the persisted blocks in local state (called only after confirmed persistence). */
  applyBlocks?: (blocks: any[]) => void;
}

/**
 * 5C.3.3-B — authoritative policy persistence.
 *
 * Enforces this causal order (no time-based sync):
 *
 *   current question
 *   → persist checklists.blocks (question authoritative in DB) → await success
 *   → compile-policy against the persisted checklist
 *   → validate schema + questionHash against the CURRENT question
 *   → persist blocks WITH the new policy → await success
 *   → only then reflect locally (cameraAiNeedsRevalidation = false)
 *
 * Every failure path keeps `cameraAiNeedsRevalidation = true` (fail-closed):
 * the "Testar verificação" button stays blocked until the policy is
 * confirmed persisted for the current question.
 *
 * A policy returned for a stale question is NEVER persisted, never applied
 * locally, and never clears the revalidation flag.
 */
export async function syncCameraBlockPolicy(
  blockId: string,
  checklistId: string,
  nextBlock: Record<string, unknown> | undefined,
  deps: CameraPolicySyncDeps
): Promise<boolean> {
  const currentBlocks = deps.getBlocks();
  const currentBlock = currentBlocks.find((b: any) => b.id === blockId);
  const resolvedBlock = nextBlock ? { ...(currentBlock || {}), ...nextBlock } : currentBlock;
  if (!resolvedBlock || resolvedBlock.type !== "camera") return false;

  const questionHash = await hashQuestion(resolvedBlock.title, resolvedBlock.description);
  const currentPolicy = resolvedBlock.cameraAiPolicy as CameraVerificationPolicyV1 | undefined;
  const policyAlreadyMatches =
    !!currentPolicy &&
    CameraVerificationPolicyV1Schema.safeParse(currentPolicy).success &&
    currentPolicy.version === 1 &&
    currentPolicy.questionHash === questionHash &&
    resolvedBlock.cameraAiNeedsRevalidation !== true;

  // 1) Persist the current question/blocks first. Compile NEVER starts before
  //    this persistence is confirmed.
  const blocksWithQuestion = currentBlocks.map((b: any) =>
    b.id === blockId ? { ...b, ...(nextBlock || {}) } : b
  );
  const questionPersisted = await deps.persistBlocks(blocksWithQuestion);
  if (!questionPersisted) return false; // keep revalidation true; no compile

  // Policy already matches the current question and the flag is clean:
  // the blocks we just persisted carry the valid policy — nothing else to do.
  if (policyAlreadyMatches) return true;

  // 2) Compile against the persisted checklist (never against client state).
  const compiled = await deps.compilePolicy(checklistId, blockId);
  if (!compiled.ok || !compiled.policy) return false; // keep revalidation true

  // 3) Validate schema + hash. If the question changed mid-flight, the returned
  //    policy is stale: discard it, never persist it, keep revalidation true.
  const parsed = CameraVerificationPolicyV1Schema.safeParse(compiled.policy);
  if (!parsed.success || parsed.data.version !== 1) return false;

  const latestBlocks = deps.getBlocks();
  const latestBlock = latestBlocks.find((b: any) => b.id === blockId);
  const latestQuestionHash = latestBlock
    ? await hashQuestion(latestBlock.title, latestBlock.description)
    : questionHash;
  if (parsed.data.questionHash !== latestQuestionHash) return false;

  // 4) Persist blocks WITH the new policy. revalidation stays true during the
  //    persistence — it only clears after confirmed success below.
  const blocksWithPolicy = latestBlocks.map((b: any) =>
    b.id === blockId
      ? { ...b, cameraAiPolicy: parsed.data, cameraAiNeedsRevalidation: false }
      : b
  );
  const policyPersisted = await deps.persistBlocks(blocksWithPolicy);
  if (!policyPersisted) return false; // keep revalidation true; button stays blocked

  // 5) Only after confirmed persistence: reflect locally (revalidation = false).
  deps.applyBlocks?.(blocksWithPolicy);
  return true;
}