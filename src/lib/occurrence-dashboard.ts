/**
 * Dashboard 6B.2D — scheduled occurrence lifecycle for managers.
 *
 * The operational dashboard already derives its KPIs from `task_executions`
 * (via `analytics_unit_daily_compliance`). A recurring routine is a DIFFERENT
 * entity: it materializes one `checklist_execution_occurrence` per obligation.
 * The two domains are therefore kept strictly apart — this module never feeds a
 * task KPI, and the task KPI never counts an occurrence. Mixing them would
 * double count the same real-world obligation; deduplicating them by heuristic
 * would be worse, because an assignment/execution and an occurrence cannot be
 * proven to represent the same thing.
 *
 * All lifecycle truth comes from the 5E.2A timestamps, projected through
 * ./occurrence-lifecycle so the Home, the executor bridge and this dashboard can
 * never drift apart.
 *
 * Four display states (NOT two) — §4 of the mission, deliberately:
 *   open  + past due     → "atrasada"              (still demands action)
 *   open  + within due   → "pendente"
 *   done  + completed<=due → "concluida_no_prazo"
 *   done  + completed>due  → "concluida_com_atraso" (history, not a failure)
 *
 * This module is PURE (no client, no network). Database reads are orchestrated
 * with an injectable query fn so fail-closed behaviour is testable.
 */
import { deriveOccurrenceState } from "./occurrence-lifecycle";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Raw row of public.analytics_unit_daily_occurrences. */
export type UnitOccurrenceDayRow = {
  organization_id?: string | null;
  unit_id?: string | null;
  unit_name?: string | null;
  reference_date?: string | null;
  total_occurrences?: number | null;
  completed_occurrences?: number | null;
  completed_on_time?: number | null;
  completed_late?: number | null;
  overdue_open_occurrences?: number | null;
  pending_open_occurrences?: number | null;
  due_occurrences?: number | null;
};

/** Raw row of public.list_workspace_execution_occurrences. */
export type WorkspaceExecutionOccurrenceRow = {
  occurrence_id?: string | null;
  schedule_id?: string | null;
  checklist_id?: string | null;
  checklist_title?: string | null;
  occurrence_date?: string | null;
  due_at?: string | null;
  started_at?: string | null;
  completed_at?: string | null;
  response_id?: string | null;
  unit_id?: string | null;
  shift_id?: string | null;
  shift_name?: string | null;
  workspace_member_id?: string | null;
  responsible_name?: string | null;
};

/**
 * Local, narrow database contract for the 6B.2D surfaces.
 * `supabase/types.ts` is intentionally NOT edited (same boundary rule as
 * 5E.2A/6B.2B/6B.2C): the client is cast exactly once, at the hook boundary.
 */
export interface OccurrenceDashboardDatabase {
  public: {
    Tables: Record<string, never>;
    // The aggregated view is read through the structural contract declared in
    // useUnitOccurrenceMetrics (its shapes are not part of this RPC client).
    Views: Record<string, never>;
    Functions: {
      list_workspace_execution_occurrences: {
        Args: {
          p_workspace_id: string;
          p_unit_id: string;
          p_start_date: string;
          p_end_date: string;
        };
        Returns: WorkspaceExecutionOccurrenceRow[];
      };
    };
  };
}

/** One unit's aggregated routine metrics over the selected period. */
export type UnitOccurrenceRow = {
  unitId: string;
  unitName: string;
  totalOccurrences: number;
  completedOccurrences: number;
  completedOnTime: number;
  completedLate: number;
  overdueOpenOccurrences: number;
  pendingOpenOccurrences: number;
  dueOccurrences: number;
};

export type OccurrenceKpis = {
  total: number;
  completed: number;
  completedOnTime: number;
  completedLate: number;
  overdueOpen: number;
  pendingOpen: number;
  due: number;
  units: number;
};

export const OCCURRENCE_FALLBACK_TITLE = "Checklist sem título";

export type OccurrenceDashboardStatus =
  | "pendente"
  | "atrasada"
  | "concluida_no_prazo"
  | "concluida_com_atraso";

export type WorkspaceExecutionOccurrence = {
  occurrenceId: string;
  scheduleId: string | null;
  checklistId: string;
  checklistTitle: string;
  /** Civil date of the obligation (YYYY-MM-DD) — the canonical period key. */
  occurrenceDate: string;
  dueAt: string;
  startedAt: string | null;
  completedAt: string | null;
  responseId: string | null;
  unitId: string | null;
  shiftId: string | null;
  shiftName: string | null;
  workspaceMemberId: string | null;
  responsibleName: string | null;
};

function asString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function asUuid(value: unknown): string | null {
  const s = asString(value);
  return s && UUID_RE.test(s) ? s : null;
}

function asIsoInstant(value: unknown): string | null {
  const s = asString(value);
  if (!s) return null;
  return Number.isNaN(Date.parse(s)) ? null : s;
}

function asIsoDate(value: unknown): string | null {
  const s = asString(value);
  if (!s || !ISO_DATE_RE.test(s)) return null;
  return s;
}

/** A counter coming from the view: absent means 0, malformed is a violation. */
function asCount(value: unknown): number | null {
  if (value === null || value === undefined) return 0;
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/**
 * A nullable timestamp may legitimately be absent (null/undefined/"" all mean
 * "no value"). Anything else that fails to parse is a contract violation and the
 * row is dropped rather than rendered with a wrong lifecycle.
 */
function isPresentButInvalidInstant(raw: unknown, parsed: string | null): boolean {
  if (raw == null) return false;
  if (typeof raw === "string" && raw.length === 0) return false;
  return !parsed;
}

/**
 * Fail-closed parse of the aggregated view payload.
 *
 * A row is accepted only with a unit identity, the civil reference date and
 * every counter well formed. The identities the view guarantees are re-checked
 * here, so a truncated/malformed payload can never be rendered as a KPI:
 *   total = completed + overdue_open + pending_open
 *   completed = completed_on_time + completed_late
 */
export function parseUnitOccurrenceDayRows(raw: unknown): UnitOccurrenceDayRow[] {
  if (!Array.isArray(raw)) return [];

  const out: UnitOccurrenceDayRow[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;
    const row = entry as Record<string, unknown>;

    const unitId = asUuid(row.unit_id);
    const referenceDate = asIsoDate(row.reference_date);
    if (!unitId || !referenceDate) continue;

    const total = asCount(row.total_occurrences);
    const completed = asCount(row.completed_occurrences);
    const onTime = asCount(row.completed_on_time);
    const late = asCount(row.completed_late);
    const overdueOpen = asCount(row.overdue_open_occurrences);
    const pendingOpen = asCount(row.pending_open_occurrences);
    const due = asCount(row.due_occurrences);
    if (
      total === null ||
      completed === null ||
      onTime === null ||
      late === null ||
      overdueOpen === null ||
      pendingOpen === null ||
      due === null
    ) {
      continue;
    }
    if (completed !== onTime + late) continue;
    if (total !== completed + overdueOpen + pendingOpen) continue;

    out.push({
      organization_id: asString(row.organization_id),
      unit_id: unitId,
      unit_name: asString(row.unit_name),
      reference_date: referenceDate,
      total_occurrences: total,
      completed_occurrences: completed,
      completed_on_time: onTime,
      completed_late: late,
      overdue_open_occurrences: overdueOpen,
      pending_open_occurrences: pendingOpen,
      due_occurrences: due,
    });
  }
  return out;
}

/**
 * Aggregate the daily rows by unit, summing counters across the period.
 *
 * Summing preserves both identities, so the unit totals satisfy exactly the
 * same invariants as the per-day rows (asserted in the tests).
 */
export function aggregateOccurrenceRowsByUnit(rows: UnitOccurrenceDayRow[]): UnitOccurrenceRow[] {
  const map = new Map<string, UnitOccurrenceRow>();

  for (const r of rows) {
    const unitId = r.unit_id as string;
    const cur = map.get(unitId) ?? {
      unitId,
      unitName: r.unit_name ?? "Unidade",
      totalOccurrences: 0,
      completedOccurrences: 0,
      completedOnTime: 0,
      completedLate: 0,
      overdueOpenOccurrences: 0,
      pendingOpenOccurrences: 0,
      dueOccurrences: 0,
    };
    // Keep a real name if a later day supplies one.
    if (cur.unitName === "Unidade" && r.unit_name) cur.unitName = r.unit_name;

    cur.totalOccurrences += r.total_occurrences ?? 0;
    cur.completedOccurrences += r.completed_occurrences ?? 0;
    cur.completedOnTime += r.completed_on_time ?? 0;
    cur.completedLate += r.completed_late ?? 0;
    cur.overdueOpenOccurrences += r.overdue_open_occurrences ?? 0;
    cur.pendingOpenOccurrences += r.pending_open_occurrences ?? 0;
    cur.dueOccurrences += r.due_occurrences ?? 0;
    map.set(unitId, cur);
  }

  return Array.from(map.values()).sort((a, b) => a.unitName.localeCompare(b.unitName));
}

/**
 * Global routine KPIs.
 *
 * These come ONLY from occurrence rows. Nothing here reads (or accepts)
 * task/execution figures, so a task KPI can never be inflated by a routine and
 * vice versa.
 */
export function buildOccurrenceKpis(rows: UnitOccurrenceRow[]): OccurrenceKpis {
  const kpis: OccurrenceKpis = {
    total: 0,
    completed: 0,
    completedOnTime: 0,
    completedLate: 0,
    overdueOpen: 0,
    pendingOpen: 0,
    due: 0,
    units: rows.length,
  };
  for (const r of rows) {
    kpis.total += r.totalOccurrences;
    kpis.completed += r.completedOccurrences;
    kpis.completedOnTime += r.completedOnTime;
    kpis.completedLate += r.completedLate;
    kpis.overdueOpen += r.overdueOpenOccurrences;
    kpis.pendingOpen += r.pendingOpenOccurrences;
    kpis.due += r.dueOccurrences;
  }
  return kpis;
}

/**
 * Names of the canonical identities the KPIs must satisfy. Empty array = the
 * numbers are internally consistent. Used by the tests (and available for
 * defensive assertions) instead of trusting the arithmetic by eye.
 */
export function checkOccurrenceKpiIdentities(kpis: OccurrenceKpis): string[] {
  const broken: string[] = [];
  if (kpis.total !== kpis.completed + kpis.overdueOpen + kpis.pendingOpen) {
    broken.push("total = completed + overdue_open + pending_open");
  }
  if (kpis.completed !== kpis.completedOnTime + kpis.completedLate) {
    broken.push("completed = completed_on_time + completed_late");
  }
  return broken;
}

/**
 * Gate for the manager's routine section.
 *
 * Mirrors the existing operational gate: authenticated + admin of the CURRENT
 * workspace. The section is part of /painel, so it must not be wider than the
 * page that hosts it.
 */
export function canLoadWorkspaceOccurrenceMetrics(opts: {
  isAuthenticated: boolean;
  isAdmin: boolean;
  workspaceId: string | null | undefined;
}): boolean {
  if (!opts.isAuthenticated) return false;
  if (!opts.isAdmin) return false;
  return typeof opts.workspaceId === "string" && opts.workspaceId.length > 0;
}

/** Four display states of one occurrence (open/overdue vs on-time/late). */
export function deriveOccurrenceDashboardStatus(
  occurrence: Pick<WorkspaceExecutionOccurrence, "startedAt" | "completedAt" | "dueAt">,
  now: Date = new Date(),
): OccurrenceDashboardStatus {
  const state = deriveOccurrenceState(
    {
      startedAt: occurrence.startedAt,
      completedAt: occurrence.completedAt,
      dueAt: occurrence.dueAt,
    },
    now,
  );

  if (state === "completed") {
    const due = Date.parse(occurrence.dueAt);
    const completed = Date.parse(occurrence.completedAt as string);
    // A completed occurrence whose completion cannot be compared to its due
    // instant is treated as within the deadline rather than invented as late.
    if (Number.isNaN(due) || Number.isNaN(completed)) return "concluida_no_prazo";
    return completed <= due ? "concluida_no_prazo" : "concluida_com_atraso";
  }
  return state === "overdue" ? "atrasada" : "pendente";
}

export function formatOccurrenceDashboardStatus(status: OccurrenceDashboardStatus): string {
  switch (status) {
    case "atrasada":
      return "Atrasada";
    case "concluida_no_prazo":
      return "Concluída no prazo";
    case "concluida_com_atraso":
      return "Concluída com atraso";
    default:
      return "Pendente";
  }
}

/** Badge variant per status, reusing the project's existing badge vocabulary. */
export function occurrenceStatusBadgeVariant(
  status: OccurrenceDashboardStatus,
): "neutral" | "warning" | "error" | "success" {
  switch (status) {
    case "atrasada":
      return "warning";
    case "concluida_com_atraso":
      return "error";
    case "concluida_no_prazo":
      return "success";
    default:
      return "neutral";
  }
}

/**
 * Fail-closed parse of the detail RPC payload.
 *
 * Only the fields needed to RENDER and to navigate are mandatory
 * (occurrenceId, checklistId, occurrence_date, due_at). Presentation-only
 * fields (responsible, shift) are optional and never cause a row to be dropped,
 * because a checklist without a shift is a valid routine.
 */
export function parseWorkspaceExecutionOccurrences(raw: unknown): WorkspaceExecutionOccurrence[] {
  if (!Array.isArray(raw)) return [];

  const out: WorkspaceExecutionOccurrence[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;
    const row = entry as Record<string, unknown>;

    const occurrenceId = asUuid(row.occurrence_id);
    const checklistId = asUuid(row.checklist_id);
    const occurrenceDate = asIsoDate(row.occurrence_date);
    const dueAt = asIsoInstant(row.due_at);
    if (!occurrenceId || !checklistId || !occurrenceDate || !dueAt) continue;

    const startedAt = asIsoInstant(row.started_at);
    const completedAt = asIsoInstant(row.completed_at);
    if (isPresentButInvalidInstant(row.started_at, startedAt)) continue;
    if (isPresentButInvalidInstant(row.completed_at, completedAt)) continue;

    out.push({
      occurrenceId,
      scheduleId: asUuid(row.schedule_id),
      checklistId,
      checklistTitle: asString(row.checklist_title) ?? OCCURRENCE_FALLBACK_TITLE,
      occurrenceDate,
      dueAt,
      startedAt,
      completedAt,
      responseId: asUuid(row.response_id),
      unitId: asUuid(row.unit_id),
      shiftId: asUuid(row.shift_id),
      shiftName: asString(row.shift_name),
      workspaceMemberId: asUuid(row.workspace_member_id),
      responsibleName: asString(row.responsible_name),
    });
  }
  return out;
}

/**
 * Shift filter for the "Rotinas" tab. `all` means no filtering — the same
 * semantics as the existing local shift filter of the operational detail.
 *
 * A checklist with no shift is a valid routine: it is only excluded when a
 * SPECIFIC shift is selected, which is the honest reading of "show me the night
 * shift".
 */
export function filterOccurrencesByShift(
  occurrences: WorkspaceExecutionOccurrence[],
  shift: string,
): WorkspaceExecutionOccurrence[] {
  if (shift === "all") return occurrences;
  return occurrences.filter((o) => o.shiftId === shift);
}

/** Status filter for the "Rotinas" tab — occurrence-specific, never task-derived. */
export function filterOccurrencesByStatus(
  occurrences: WorkspaceExecutionOccurrence[],
  status: string,
  now: Date = new Date(),
): WorkspaceExecutionOccurrence[] {
  if (status === "all") return occurrences;
  return occurrences.filter((o) => deriveOccurrenceDashboardStatus(o, now) === status);
}

/** Canonical display order: oldest due first (overdue ⇒ earliest deadline). */
export function sortOccurrencesByDue(
  occurrences: WorkspaceExecutionOccurrence[],
): WorkspaceExecutionOccurrence[] {
  return [...occurrences].sort((a, b) => {
    if (a.dueAt !== b.dueAt) return a.dueAt < b.dueAt ? -1 : 1;
    if (a.occurrenceId !== b.occurrenceId) return a.occurrenceId < b.occurrenceId ? -1 : 1;
    return 0;
  });
}

export type OccurrenceMetricsLoadResult = {
  rows: UnitOccurrenceRow[];
  /** True when the read failed — the UI must not present it as "no routines". */
  error: boolean;
};

/** Orchestrated read of the aggregated view (injectable query for tests). */
export async function loadUnitOccurrenceMetrics(
  queries: {
    fetchRows: (params: {
      organizationId: string;
      startDate: string;
      endDate: string;
      unitId: string | null;
    }) => Promise<{ data: unknown; error: unknown }>;
  },
  params: {
    organizationId: string | null | undefined;
    startDate: string;
    endDate: string;
    unitId?: string | null;
  },
): Promise<OccurrenceMetricsLoadResult> {
  if (!params.organizationId) return { rows: [], error: false };

  const { data, error } = await queries.fetchRows({
    organizationId: params.organizationId,
    startDate: params.startDate,
    endDate: params.endDate,
    unitId: params.unitId ?? null,
  });
  if (error) {
    console.error("useUnitOccurrenceMetrics: falha ao carregar rotinas (fail-closed)", error);
    return { rows: [], error: true };
  }
  if (!Array.isArray(data)) return { rows: [], error: true };

  return { rows: aggregateOccurrenceRowsByUnit(parseUnitOccurrenceDayRows(data)), error: false };
}

export type OccurrenceDetailLoadResult = {
  occurrences: WorkspaceExecutionOccurrence[];
  error: boolean;
};

/** Orchestrated read of the detail RPC (injectable query for tests). */
export async function loadWorkspaceExecutionOccurrences(
  queries: {
    fetchOccurrences: (params: {
      workspaceId: string;
      unitId: string;
      startDate: string;
      endDate: string;
    }) => Promise<{ data: unknown; error: unknown }>;
  },
  params: {
    organizationId: string | null | undefined;
    unitId: string | null | undefined;
    startDate: string;
    endDate: string;
  },
): Promise<OccurrenceDetailLoadResult> {
  if (!params.organizationId || !params.unitId) return { occurrences: [], error: false };

  const { data, error } = await queries.fetchOccurrences({
    workspaceId: params.organizationId,
    unitId: params.unitId,
    startDate: params.startDate,
    endDate: params.endDate,
  });
  if (error) {
    console.error("useUnitOccurrenceDetails: falha ao carregar occurrences (fail-closed)", error);
    return { occurrences: [], error: true };
  }
  if (!Array.isArray(data)) return { occurrences: [], error: true };

  return {
    occurrences: sortOccurrencesByDue(parseWorkspaceExecutionOccurrences(data)),
    error: false,
  };
}

/**
 * Query-string for the unit-detail drill-down, preserving the period that
 * produced the numbers the manager just clicked on.
 */
export function buildUnitOperacaoSearch(params: { startDate: string; endDate: string }): {
  startDate: string;
  endDate: string;
} {
  return { startDate: params.startDate, endDate: params.endDate };
}
