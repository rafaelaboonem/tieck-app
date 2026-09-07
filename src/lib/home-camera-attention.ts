/**
 * Home 6A.3 — Camera AI rejection signals for `/inicio` priorities.
 *
 * Pure, testable helpers that resolve, from the MOST RECENT complete
 * submission of each visible checklist, how many evidence groups ended with a
 * terminal Camera AI `rejected` decision. Historical rejections of older
 * submissions never count — the latest submission represents the current
 * operational state.
 */

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
  completed_at?: string | null;
  updated_at?: string | null;
  created_at?: string | null;
};

export type HomeCameraAttention = {
  checklistId: string;
  /** Number of evidence groups whose FINAL attempt was `completed` + `rejected`. */
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
 * Stable grouping key for one evidence/block: `evidence_id` when present,
 * otherwise `response_id + block_id`.
 */
export function cameraAttemptGroupKey(a: HomeCameraAttempt): string {
  if (a.evidence_id) return `evidence:${a.evidence_id}`;
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

/** A rejection only counts when the FINAL attempt is `completed` + `rejected`. */
export function isRejectedFinalAttempt(a: HomeCameraAttempt | undefined | null): boolean {
  return !!a && a.status === "completed" && a.decision === "rejected";
}

/**
 * Build Camera AI attention for the visible checklists.
 *
 * - Only submissions belonging to `visibleChecklistIds` are considered.
 * - Only the most recent complete submission per checklist is considered.
 * - Rejections are counted once per evidence/block group (final attempt only).
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
    if (!isRejectedFinalAttempt(attempt)) continue;
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

/** "IA reprovou 1 evidência" / "IA reprovou 2 evidências". */
export function formatRejectedEvidenceLabel(rejectedCount: number): string {
  if (rejectedCount <= 0) return "";
  return `IA reprovou ${rejectedCount} ${rejectedCount === 1 ? "evidência" : "evidências"}`;
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