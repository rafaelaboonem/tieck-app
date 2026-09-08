/**
 * Home 6A.3 / 6A.3.1 — Camera AI attention signals for `/inicio` priorities.
 *
 * Pure, testable helpers that resolve, from the MOST RECENT complete
 * submission of each visible checklist, how many evidence/block groups ended
 * with a terminal Camera AI NON-APPROVAL. Historical non-approvals of older
 * submissions never count — the latest submission represents the current
 * operational state.
 *
 * Semantics are the shared actionable non-approval rule in
 * `src/lib/camera-ai/actionable-non-approval.ts` (used by Home, Envios and the
 * verify runtime): `completed` + `rejected` (legacy) or `completed` + `retake`
 * with an actionable code (`condition_not_met`, `reference_mismatch`,
 * `target_missing`). Since 6A.4, grouping is BY BLOCK (response_id + block_id)
 * — never by evidence_id — because each retry can now carry its own persisted
 * evidence, and the operational state of a block is decided by its LATEST
 * terminal attempt only.
 */

import {
  isActionableCameraNonApproval,
  ACTIONABLE_RETAKE_CODES,
} from "./camera-ai/actionable-non-approval";

export { isActionableCameraNonApproval, ACTIONABLE_RETAKE_CODES } from "./camera-ai/actionable-non-approval";

export type HomeCameraResponse = {
  id: string;
  checklist_id?: string | null;
  submitted_at?: string | null;
  created_at?: string | null;
};

export type HomeCameraAttempt = {
  id: string;
  response_id?: string | null;
  evidence_id?: string | null;
  block_id?: string | null;
  status?: string | null;
  decision?: string | null;
  code?: string | null;
  evidence?: string | null;
  completed_at?: string | null;
  updated_at?: string | null;
  created_at?: string | null;
};

export type HomeCameraAttention = {
  checklistId: string;
  /** Number of evidence groups whose FINAL attempt is an actionable Camera AI non-approval. */
  rejectedCount: number;
  /** submitted_at of the most recent complete submission of the checklist. */
  latestSubmittedAt: string | null;
};

export type HomeCameraAttentionByChecklist = Record<string, Omit<HomeCameraAttention, "checklistId">>;

/**
 * Pick the most recent COMPLETE submission (submitted_at != null) per
 * checklist, latest `submitted_at` wins (fallback `created_at`).
 */
export function pickLatestResponsePerChecklist(responses: HomeCameraResponse[]): HomeCameraResponse[] {
  const best = new Map<string, HomeCameraResponse>();
  for (const r of responses) {
    if (!r.submitted_at || !r.checklist_id || !r.id) continue;
    const ts = r.submitted_at || r.created_at || "";
    const current = best.get(r.checklist_id);
    const currentTs = current ? current.submitted_at || current.created_at || "" : "";
    if (!current || ts > currentTs) best.set(r.checklist_id, r);
  }
  return [...best.values()];
}

/**
 * Stable grouping key per CAMERA BLOCK: `response_id + block_id`.
 *
 * Since 6A.4 each retry can have its own persisted `evidence_id`, so evidence
 * ids must NOT define the operational state — otherwise an old retake (evidence
 * A) followed by an approved capture (evidence B) of the SAME block would keep
 * the old retake visible. The latest terminal attempt per block wins.
 */
export function cameraAttemptGroupKey(a: HomeCameraAttempt): string {
  return `response:${a.response_id ?? ""}:block:${a.block_id ?? ""}`;
}

/** Effective attempt timestamp: completed_at → updated_at → created_at. */
export function cameraAttemptTimestamp(a: HomeCameraAttempt): string {
  return a.completed_at || a.updated_at || a.created_at || "";
}

/**
 * Terminal attempt per evidence/block group: the one with the most recent
 * effective timestamp. Equal timestamps break by `id` for determinism.
 */
export function selectLatestAttemptPerGroup(attempts: HomeCameraAttempt[]): HomeCameraAttempt[] {
  const finalByGroup = new Map<string, HomeCameraAttempt>();
  for (const a of attempts) {
    if (!a.id) continue;
    const key = cameraAttemptGroupKey(a);
    const current = finalByGroup.get(key);
    if (!current) {
      finalByGroup.set(key, a);
      continue;
    }
    const tsA = cameraAttemptTimestamp(a);
    const tsCurrent = cameraAttemptTimestamp(current);
    if (tsA > tsCurrent || (tsA === tsCurrent && a.id > current.id)) finalByGroup.set(key, a);
  }
  return [...finalByGroup.values()];
}

/** Count of evidence/block groups with an actionable final non-approval. */
export function countActionableNonApprovals(attempts: HomeCameraAttempt[]): number {
  return selectLatestAttemptPerGroup(attempts).filter(isActionableCameraNonApproval).length;
}

/**
 * Build Camera AI attention for the visible checklists.
 *
 * - Only submissions belonging to `visibleChecklistIds` are considered.
 * - Only the most recent complete submission per checklist is considered.
 * - Non-approvals are counted once per evidence/block group (final attempt only).
 */
export function buildHomeCameraAttention(
  visibleChecklistIds: string[],
  responses: HomeCameraResponse[],
  attempts: HomeCameraAttempt[]
): HomeCameraAttention[] {
  const visible = new Set(visibleChecklistIds);
  const checklistByResponse = new Map<string, string>();
  const submittedByChecklist = new Map<string, string>();

  for (const r of pickLatestResponsePerChecklist(responses)) {
    if (!visible.has(r.checklist_id!)) continue;
    checklistByResponse.set(r.id, r.checklist_id!);
    submittedByChecklist.set(r.checklist_id!, r.submitted_at!);
  }

  const relevantAttempts = attempts.filter((a) => a.response_id && checklistByResponse.has(a.response_id));
  const finalAttempts = selectLatestAttemptPerGroup(relevantAttempts);

  const rejectedByChecklist = new Map<string, number>();
  for (const attempt of finalAttempts) {
    if (!isActionableCameraNonApproval(attempt)) continue;
    const checklistId = checklistByResponse.get(attempt.response_id!);
    if (!checklistId) continue;
    rejectedByChecklist.set(checklistId, (rejectedByChecklist.get(checklistId) ?? 0) + 1);
  }

  const out: HomeCameraAttention[] = [];
  for (const [checklistId, rejectedCount] of rejectedByChecklist) {
    out.push({
      checklistId,
      rejectedCount,
      latestSubmittedAt: submittedByChecklist.get(checklistId) ?? null,
    });
  }
  return out;
}

export function toHomeCameraAttentionMap(attentions: HomeCameraAttention[]): HomeCameraAttentionByChecklist {
  const map: HomeCameraAttentionByChecklist = {};
  for (const a of attentions) map[a.checklistId] = a;
  return map;
}

/** "IA não aprovou 1 verificação" / "IA não aprovou 2 verificações". */
export function formatNonApprovedVerificationLabel(nonApprovedCount: number): string {
  if (nonApprovedCount <= 0) return "";
  return `IA não aprovou ${nonApprovedCount} ${nonApprovedCount === 1 ? "verificação" : "verificações"}`;
}

/**
 * Envios badge label for the "no photo evidence" case. When the response has
 * no stored photo evidence but a Camera AI attempt ended actionable (e.g. a
 * retake whose image was never persisted), show an IA verification signal
 * instead of a plain "Sem evidências". With no attempts at all, "Sem
 * evidências" remains correct.
 */
export function resolveSubmissionsNoEvidenceLabel(opts: {
  photoCount: number;
  nonApprovedCount: number;
}): { label: string; isNonApprovedSignal: boolean } {
  if (opts.photoCount > 0) return { label: "", isNonApprovedSignal: false };
  if (opts.nonApprovedCount > 0) {
    return {
      label: `${opts.nonApprovedCount} ${opts.nonApprovedCount === 1 ? "verificação" : "verificações"} IA`,
      isNonApprovedSignal: true,
    };
  }
  return { label: "Sem evidências", isNonApprovedSignal: false };
}

/**
 * Human status label for one Camera AI attempt (used in Envios for attempts
 * whose photo was not persisted). Null when there is no terminal state.
 */
export function cameraAttemptStatusLabel(a: HomeCameraAttempt | undefined | null): string | null {
  if (!a) return null;
  if (a.status === "completed" && a.decision === "approved") return "Aprovada pela IA";
  if (isActionableCameraNonApproval(a)) return "Não aprovada pela IA";
  if (a.status === "completed" && a.decision === "not_observable") return "Não foi possível verificar";
  if (a.status === "failed" || a.decision === "error" || a.decision === "technical_failure") {
    return "Verificação indisponível";
  }
  return null; // processing / unknown
}

/**
 * RBAC gate: when may the Home load Camera AI submission signals?
 * - Workspace context: only roles with workspace management (never Viewer).
 * - Personal context: the authenticated owner of the visible personal checklists.
 * - Anything else (loading/unknown): fail-closed false.
 */
export function canLoadHomeCameraAttention(opts: {
  isWorkspaceContext: boolean;
  isViewer: boolean;
  canManage: boolean;
  isAuthenticated: boolean;
}): boolean {
  if (!opts.isAuthenticated) return false;
  if (opts.isWorkspaceContext) return !opts.isViewer && opts.canManage;
  return true; // personal context — the visible checklists already belong to the auth user
}

/**
 * Orchestrated fetch used by the hook. Injectable query fns keep the
 * fail-closed behaviour testable without a real Supabase client.
 */
export async function loadHomeCameraAttention(
  queries: {
    fetchResponses: (
      visibleChecklistIds: string[]
    ) => Promise<{ data: HomeCameraResponse[] | null; error: unknown }>;
    fetchAttempts: (
      responseIds: string[]
    ) => Promise<{ data: HomeCameraAttempt[] | null; error: unknown }>;
  },
  visibleChecklistIds: string[]
): Promise<HomeCameraAttention[]> {
  if (visibleChecklistIds.length === 0) return [];

  const { data: responses, error: responsesError } = await queries.fetchResponses(visibleChecklistIds);
  if (responsesError) {
    console.error("useHomeCameraAttention: falha ao buscar respostas (fail-closed)", responsesError);
    return [];
  }

  const latest = pickLatestResponsePerChecklist(responses ?? []);
  if (latest.length === 0) return [];

  const responseIds = latest.map((r) => r.id);
  const { data: attempts, error: attemptsError } = await queries.fetchAttempts(responseIds);
  if (attemptsError) {
    console.error("useHomeCameraAttention: falha ao buscar tentativas (fail-closed)", attemptsError);
    return [];
  }

  return buildHomeCameraAttention(visibleChecklistIds, responses ?? [], attempts ?? []);
}