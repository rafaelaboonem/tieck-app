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
  applyBlocks?: (blocks: any[]) => void | Promise<void>;
  /**
   * 5C.3.3-C: called when the operation is detected STALE — the question
   * changed mid-flight. The page uses it to schedule ONE coalesced re-sync for
   * the newest question.
   */
  onStale?: () => void;
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
 * 5C.3.3-C — the operation is bound to the EXACT question version that
 * started it (`requestedQuestionHash`). If the question changes at ANY point:
 *
 *   - during persist-question;
 *   - during compile;
 *   - during persist-policy;
 *   - before the local apply;
 *
 * the operation is STALE: it never replaces the current title/description,
 * never persists its policy as current, never clears the revalidation of the
 * newer question and never enables "Testar verificação" for it. `onStale` is
 * fired so the page can schedule ONE coalesced re-sync for the newest question.
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

  // 5C.3.3-C: identidade da operação — a versão EXATA da pergunta que a iniciou.
  const requestedQuestionHash = await hashQuestion(resolvedBlock.title, resolvedBlock.description);
  const currentPolicy = resolvedBlock.cameraAiPolicy as CameraVerificationPolicyV1 | undefined;
  const policyAlreadyMatches =
    !!currentPolicy &&
    CameraVerificationPolicyV1Schema.safeParse(currentPolicy).success &&
    currentPolicy.version === 1 &&
    currentPolicy.questionHash === requestedQuestionHash &&
    resolvedBlock.cameraAiNeedsRevalidation !== true;

  // 1) Persist the current question/blocks first. Compile NEVER starts before
  //    this persistence is confirmed.
  const blocksWithQuestion = currentBlocks.map((b: any) =>
    b.id === blockId ? { ...b, ...(nextBlock || {}) } : b
  );
  const questionPersisted = await deps.persistBlocks(blocksWithQuestion);
  if (!questionPersisted) return false; // keep revalidation true; no compile

  // A) 5C.3.3-C: antes do compile (e antes do early-return de policy já
  //    válida) — a pergunta atual ainda precisa ser a que iniciou a operação.
  if (!(await isQuestionStillCurrent(deps, blockId, requestedQuestionHash))) {
    deps.onStale?.();
    return false;
  }

  // Policy already matches the current question and the flag is clean:
  // the blocks we just persisted carry the valid policy — nothing else to do.
  if (policyAlreadyMatches) return true;

  // 2) Compile against the persisted checklist (never against client state).
  const compiled = await deps.compilePolicy(checklistId, blockId);
  if (!compiled.ok || !compiled.policy) return false; // keep revalidation true

  // B) 5C.3.3-C: depois do compile — a pergunta pode ter mudado enquanto o
  //    compile rodava; a policy antiga é descartada, nunca persistida.
  if (!(await isQuestionStillCurrent(deps, blockId, requestedQuestionHash))) {
    deps.onStale?.();
    return false;
  }

  // 3) Validate schema + hash. If the question changed mid-flight, the returned
  //    policy is stale: discard it, never persist it, keep revalidation true.
  const parsed = CameraVerificationPolicyV1Schema.safeParse(compiled.policy);
  if (!parsed.success || parsed.data.version !== 1) return false;

  const latestBlocks = deps.getBlocks();
  const latestBlock = latestBlocks.find((b: any) => b.id === blockId);
  const latestQuestionHash = latestBlock
    ? await hashQuestion(latestBlock.title, latestBlock.description)
    : requestedQuestionHash;
  // A policy só pode ser persistida se bater com a pergunta ATUAL.
  if (parsed.data.questionHash !== latestQuestionHash) return false;

  // C) 5C.3.3-C: antes da persistência da policy.
  if (!(await isQuestionStillCurrent(deps, blockId, requestedQuestionHash))) {
    deps.onStale?.();
    return false;
  }

  // 4) Persist blocks WITH the new policy. revalidation stays true during the
  //    persistence — it only clears after confirmed success below.
  const blocksWithPolicy = latestBlocks.map((b: any) =>
    b.id === blockId
      ? { ...b, cameraAiPolicy: parsed.data, cameraAiNeedsRevalidation: false }
      : b
  );
  const policyPersisted = await deps.persistBlocks(blocksWithPolicy);
  if (!policyPersisted) return false; // keep revalidation true; button stays blocked

  // D) 5C.3.3-C: depois da persistência, antes do apply/ready — mesmo que o
  //    banco tenha recebido a versão antiga (persistência já em voo), a
  //    operação é stale e NUNCA aplica/localmente valida a pergunta nova.
  if (!(await isQuestionStillCurrent(deps, blockId, requestedQuestionHash))) {
    deps.onStale?.();
    return false;
  }

  // 5) Only after confirmed persistence: reflect locally (revalidation = false).
  await deps.applyBlocks?.(blocksWithPolicy);
  return true;
}

/**
 * 5C.3.3-C — a pergunta atual (blocksRef) ainda é exatamente a versão que
 * iniciou a operação? Qualquer divergência no hash canônico torna a operação
 * stale. Reutiliza `hashQuestion` (única canonicalização: title + description).
 */
async function isQuestionStillCurrent(
  deps: CameraPolicySyncDeps,
  blockId: string,
  requestedHash: string
): Promise<boolean> {
  const latest = deps.getBlocks().find((b: any) => b.id === blockId);
  if (!latest || latest.type !== "camera") return false;
  const currentHash = await hashQuestion(latest.title, latest.description);
  return currentHash === requestedHash;
}