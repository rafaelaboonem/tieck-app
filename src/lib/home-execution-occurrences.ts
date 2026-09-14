/**
 * Home 6B.2C — scheduled occurrences (5E) surfaced to the responsible member.
 *
 * The Home already derives its operational view from `checklist_assignments`.
 * A recurring routine is a DIFFERENT entity: it materializes one
 * `checklist_execution_occurrence` per obligation, and completing Monday does
 * not complete Tuesday. Both are therefore kept conceptually separate here —
 * never silently merged, never deduplicated by heuristic (an assignment and an
 * occurrence cannot be proven to represent the same obligation).
 *
 * This module is PURE and testable: the only truth it uses is the 5E.2A
 * timestamp lifecycle (via ./occurrence-lifecycle), so the Home, the executor
 * bridge and the dashboard can never drift apart.
 *
 * Read access is NOT resolved here — the database RPC
 * `list_my_checklist_execution_occurrences` returns exclusively the caller's own
 * open occurrences. The parse is fail-closed so a malformed payload is never
 * rendered as an actionable obligation.
 */
import { deriveOccurrenceActionStatus, type OccurrenceActionStatus } from "./occurrence-lifecycle";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Raw row as returned by public.list_my_checklist_execution_occurrences. */
export type MyExecutionOccurrenceRow = {
  occurrence_id?: string | null;
  schedule_id?: string | null;
  checklist_id?: string | null;
  checklist_title?: string | null;
  workspace_member_id?: string | null;
  occurrence_date?: string | null;
  due_at?: string | null;
  started_at?: string | null;
  completed_at?: string | null;
  response_id?: string | null;
  unit_id?: string | null;
  shift_id?: string | null;
};

/**
 * Local, narrow database contract for the 6B.2C read RPC.
 * supabase/types.ts is intentionally NOT edited (same contract as 5E.2A/6B.2B):
 * the client is cast exactly once at the boundary of the hook.
 */
export interface MyExecutionOccurrencesDatabase {
  public: {
    Tables: Record<string, never>;
    Views: Record<string, never>;
    Functions: {
      list_my_checklist_execution_occurrences: {
        Args: { p_workspace_id: string };
        Returns: MyExecutionOccurrenceRow[];
      };
    };
  };
}

export type HomeExecutionOccurrence = {
  occurrenceId: string;
  scheduleId: string;
  checklistId: string;
  checklistTitle: string;
  workspaceMemberId: string;
  /** Civil date of the obligation (YYYY-MM-DD). */
  occurrenceDate: string;
  dueAt: string;
  startedAt: string | null;
  completedAt: string | null;
  responseId: string | null;
  unitId: string | null;
  shiftId: string | null;
};

/** Each occurrence is its own actionable obligation; the list stays bounded. */
export const HOME_OCCURRENCE_PRIORITY_LIMIT = 5;

export const HOME_OCCURRENCE_FALLBACK_TITLE = "Checklist sem título";

export type HomeOccurrencePriorityItem = HomeExecutionOccurrence & {
  status: OccurrenceActionStatus;
};

export type HomeOccurrencePriorities = {
  items: HomeOccurrencePriorityItem[];
  /** Open obligations beyond the returned items (for "+ N outras rotinas"). */
  remaining: number;
  /** Fulfilled obligations dropped from the actionable list. */
  completedCount: number;
};

export type HomeOpenOccurrenceCounts = {
  total: number;
  atrasadas: number;
  pendentes: number;
};

function asString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function asUuid(value: unknown): string | null {
  const s = asString(value);
  return s && UUID_RE.test(s) ? s : null;
}

function asIsoDate(value: unknown): string | null {
  const s = asString(value);
  if (!s) return null;
  return Number.isNaN(Date.parse(s)) ? null : s;
}

/**
 * A nullable timestamp may legitimately be absent (null/undefined/"" — all mean
 * "no value"). Anything else that fails to parse is a contract violation: the
 * row is dropped rather than silently rendered with a wrong lifecycle.
 */
function isPresentButInvalidTimestamp(raw: unknown, parsed: string | null): boolean {
  if (raw == null) return false;
  if (typeof raw === "string" && raw.length === 0) return false;
  return !parsed;
}

/**
 * Fail-closed parse of the RPC payload.
 *
 * A row is accepted only when every field the product depends on is present and
 * well formed: the identity used for navigation and the executor bridge
 * (occurrenceId, checklistId), the ownership binding (scheduleId,
 * workspaceMemberId), the civil date and the due instant. Anything else is
 * dropped instead of being rendered as an obligation that could not be opened
 * correctly.
 */
export function parseMyExecutionOccurrences(raw: unknown): HomeExecutionOccurrence[] {
  if (!Array.isArray(raw)) return [];

  const out: HomeExecutionOccurrence[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;
    const row = entry as Record<string, unknown>;

    const occurrenceId = asUuid(row.occurrence_id);
    const scheduleId = asUuid(row.schedule_id);
    const checklistId = asUuid(row.checklist_id);
    const workspaceMemberId = asUuid(row.workspace_member_id);
    const occurrenceDate = asString(row.occurrence_date);
    const dueAt = asIsoDate(row.due_at);
    if (!occurrenceId || !scheduleId || !checklistId || !workspaceMemberId) continue;
    if (!occurrenceDate || !dueAt) continue;

    const startedAt = asIsoDate(row.started_at);
    const completedAt = asIsoDate(row.completed_at);
    if (isPresentButInvalidTimestamp(row.started_at, startedAt)) continue;
    if (isPresentButInvalidTimestamp(row.completed_at, completedAt)) continue;

    out.push({
      occurrenceId,
      scheduleId,
      checklistId,
      checklistTitle: asString(row.checklist_title) ?? HOME_OCCURRENCE_FALLBACK_TITLE,
      workspaceMemberId,
      occurrenceDate,
      dueAt,
      startedAt,
      completedAt,
      responseId: asUuid(row.response_id),
      unitId: asUuid(row.unit_id),
      shiftId: asUuid(row.shift_id),
    });
  }
  return out;
}

/** Canonical action status of one occurrence (5E lifecycle, no second rule). */
export function deriveHomeOccurrenceStatus(
  occurrence: Pick<HomeExecutionOccurrence, "startedAt" | "completedAt" | "dueAt">,
  now: Date = new Date(),
): OccurrenceActionStatus {
  return deriveOccurrenceActionStatus(
    {
      startedAt: occurrence.startedAt,
      completedAt: occurrence.completedAt,
      dueAt: occurrence.dueAt,
    },
    now,
  );
}

/** Actionable = not fulfilled yet. */
export function isActionableHomeOccurrence(
  occurrence: Pick<HomeExecutionOccurrence, "completedAt">,
): boolean {
  return !occurrence.completedAt;
}

/**
 * Open obligations for the "Resumo operacional".
 *
 * Counted SEPARATELY from the assignment-derived figures: an occurrence is a
 * different entity from an assignment, and mixing them (or guessing that one
 * represents the other) would double count. Only open occurrences count.
 */
export function countHomeOpenOccurrences(
  occurrences: HomeExecutionOccurrence[],
  now: Date = new Date(),
): HomeOpenOccurrenceCounts {
  let atrasadas = 0;
  let pendentes = 0;
  for (const occurrence of occurrences) {
    if (!isActionableHomeOccurrence(occurrence)) continue;
    if (deriveHomeOccurrenceStatus(occurrence, now) === "atrasada") atrasadas++;
    else pendentes++;
  }
  return { total: atrasadas + pendentes, atrasadas, pendentes };
}

/**
 * Actionable occurrence list for "Prioridades".
 *
 * Order (canonical operational order):
 *   1. atrasadas — oldest due date first
 *   2. pendentes — soonest due date first
 * Ties break by occurrenceId so the order is deterministic across renders.
 *
 * Each occurrence is its OWN item (never collapsed by checklistId): yesterday's
 * overdue obligation and today's obligation can coexist for the same checklist
 * and each one carries its own occurrenceId.
 */
export function buildHomeOccurrencePriorities(
  occurrences: HomeExecutionOccurrence[],
  options: { limit?: number; now?: Date } = {},
): HomeOccurrencePriorities {
  const { limit = HOME_OCCURRENCE_PRIORITY_LIMIT, now = new Date() } = options;

  const open = occurrences.filter(isActionableHomeOccurrence);
  const completedCount = occurrences.length - open.length;

  const items: HomeOccurrencePriorityItem[] = open.map((occurrence) => ({
    ...occurrence,
    status: deriveHomeOccurrenceStatus(occurrence, now),
  }));

  const rank = (item: HomeOccurrencePriorityItem): number => (item.status === "atrasada" ? 0 : 1);

  items.sort((a, b) => {
    const ra = rank(a);
    const rb = rank(b);
    if (ra !== rb) return ra - rb;
    if (a.dueAt !== b.dueAt) return a.dueAt < b.dueAt ? -1 : 1;
    if (a.occurrenceId !== b.occurrenceId) return a.occurrenceId < b.occurrenceId ? -1 : 1;
    return 0;
  });

  const limited = items.slice(0, Math.max(0, limit));
  return {
    items: limited,
    remaining: Math.max(0, items.length - limited.length),
    completedCount,
  };
}

/** "Atrasada" / "Pendente" for the priority row subtitle. */
export function formatOccurrencePriorityStatus(status: OccurrenceActionStatus): string {
  if (status === "atrasada") return "Atrasada";
  if (status === "concluida") return "Concluída";
  return "Pendente";
}

/**
 * Gate for loading the caller's own occurrences.
 *
 * Only the WORKSPACE context is eligible: recurrence exists exclusively for
 * workspace checklists (a personal checklist can never own a schedule), and the
 * screen must stay silent while the workspace is unresolved.
 *
 * Deliberately NOT role-gated: the surface lists obligations ATTRIBUTED to the
 * caller, so a Viewer fulfilling an assigned routine must see it exactly like
 * an editor or an admin. Widening this would either hide the Viewer's own
 * obligation or expose someone else's.
 */
export function canLoadMyExecutionOccurrences(opts: {
  isAuthenticated: boolean;
  isWorkspaceContext: boolean;
  workspaceId: string | null | undefined;
}): boolean {
  if (!opts.isAuthenticated) return false;
  if (!opts.isWorkspaceContext) return false;
  return typeof opts.workspaceId === "string" && opts.workspaceId.length > 0;
}

export type MyExecutionOccurrencesLoadResult = {
  occurrences: HomeExecutionOccurrence[];
  /** True when the read failed — the UI must not claim "no obligations". */
  error: boolean;
};

/**
 * Orchestrated read used by the hook. The query fn is injectable so the
 * fail-closed behaviour stays testable without a live client.
 */
export async function loadMyExecutionOccurrences(
  queries: {
    fetchOccurrences: (workspaceId: string) => Promise<{ data: unknown; error: unknown }>;
  },
  workspaceId: string | null | undefined,
): Promise<MyExecutionOccurrencesLoadResult> {
  if (!workspaceId) return { occurrences: [], error: false };

  const { data, error } = await queries.fetchOccurrences(workspaceId);
  if (error) {
    console.error("useMyExecutionOccurrences: falha ao listar occurrences (fail-closed)", error);
    return { occurrences: [], error: true };
  }

  if (!Array.isArray(data)) return { occurrences: [], error: true };

  return { occurrences: parseMyExecutionOccurrences(data), error: false };
}
