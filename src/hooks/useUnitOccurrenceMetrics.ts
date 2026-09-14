import { useCallback, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useScopedQuery, type UseScopedQueryResult } from "@/hooks/useScopedQuery";
import {
  aggregateOccurrenceRowsByUnit,
  buildOccurrenceKpis,
  parseUnitOccurrenceDayRows,
  type OccurrenceKpis,
  type UnitOccurrenceRow,
} from "@/lib/occurrence-dashboard";

/**
 * 6B.2D — routine ("Rotinas agendadas") metrics for the operations dashboard.
 *
 * Kept SEPARATE from useUnitCompliance on purpose: task compliance and recurring
 * routines are different entities, so their numbers live in different queries
 * and different state. Nothing here can inflate a task KPI, and no task figure
 * can be read from here.
 *
 * Source: public.analytics_unit_daily_occurrences (6B.2D migration), whose grain
 * is organization + unit + occurrence_date and whose reference date is the
 * occurrence's OWN civil date — never the UTC day of due_at (that mistake is
 * exactly what 6B.2A fixed for tasks).
 *
 * `supabase/types.ts` is not edited; the view is declared as a narrow local
 * contract and cast once at this boundary, as in 6B.2B/6B.2C.
 */
const OCCURRENCE_VIEW_COLUMNS = [
  "organization_id",
  "unit_id",
  "unit_name",
  "reference_date",
  "shift_id",
  "shift_name",
  "total_occurrences",
  "completed_occurrences",
  "completed_on_time",
  "completed_late",
  "overdue_open_occurrences",
  "pending_open_occurrences",
  "due_occurrences",
].join(",");

type OccurrenceViewResult = { data: unknown; error: unknown };

/** Structural builder contract (postgrest-like), enough for this query. */
export type OccurrenceViewQuery = PromiseLike<OccurrenceViewResult> & {
  eq: (column: string, value: string) => OccurrenceViewQuery;
  gte: (column: string, value: string) => OccurrenceViewQuery;
  lte: (column: string, value: string) => OccurrenceViewQuery;
};

export type OccurrenceViewTable = {
  select: (columns: string) => OccurrenceViewQuery;
};

export type OccurrenceViewClient = {
  from: (table: "analytics_unit_daily_occurrences") => OccurrenceViewTable;
};

const viewClient = supabase as unknown as OccurrenceViewClient;

export type UnitOccurrenceMetricsParams = {
  startDate: string; // YYYY-MM-DD inclusive
  endDate: string; // YYYY-MM-DD inclusive
  unitId?: string;
  /**
   * Turno global (6B.3). Ausente = todos os turnos (inclusive rotinas sem
   * turno). A occurrence herda o turno do checklist.
   */
  shiftId?: string;
  /** workspaces.id === organization_id (explicit defense beyond RLS — 6B.1B). */
  organizationId?: string | null;
  enabled?: boolean;
};

export type UseUnitOccurrenceMetricsResult = UseScopedQueryResult<UnitOccurrenceRow[]> & {
  /** Routine KPIs, derived ONLY from routine rows. */
  kpis: OccurrenceKpis;
};

type MetricsQueryParams = {
  organizationId: string;
  startDate: string;
  endDate: string;
  unitId: string | null;
  shiftId: string | null;
};

const EMPTY_ROWS: UnitOccurrenceRow[] = [];

export function useUnitOccurrenceMetrics(
  params: UnitOccurrenceMetricsParams,
): UseUnitOccurrenceMetricsResult {
  const { startDate, endDate, unitId, shiftId, organizationId, enabled = true } = params;
  const canQuery = !!enabled && !!organizationId;
  // O turno faz parte do escopo: trocar de turno invalida respostas em voo.
  const scope = `${organizationId ?? ""}|${startDate}|${endDate}|${unitId ?? ""}|${shiftId ?? ""}`;

  // Memoized on the real values so the shared hook's closures stay stable.
  const queryParams = useMemo<MetricsQueryParams>(
    () => ({
      organizationId: organizationId ?? "",
      startDate,
      endDate,
      unitId: unitId ?? null,
      shiftId: shiftId ?? null,
    }),
    [organizationId, startDate, endDate, unitId, shiftId],
  );

  // Stable fetcher: the params are passed IN, so a stale callback can only ever
  // query the params it was created with (and the shared hook then blocks it).
  const fetcher = useCallback(async (p: MetricsQueryParams): Promise<UnitOccurrenceRow[]> => {
    let q = viewClient
      .from("analytics_unit_daily_occurrences")
      .select(OCCURRENCE_VIEW_COLUMNS)
      .eq("organization_id", p.organizationId)
      .gte("reference_date", p.startDate)
      .lte("reference_date", p.endDate);

    // unit_id once when a specific unit is selected — same semantics as the
    // existing task query.
    if (p.unitId) q = q.eq("unit_id", p.unitId);
    // Sem turno selecionado não há filtro de shift_id: "todos os turnos" inclui
    // as rotinas sem turno.
    if (p.shiftId) q = q.eq("shift_id", p.shiftId);

    const { data, error } = await q;
    // Generic failure only: no SQL/schema detail ever reaches the UI or the logs.
    if (error) throw new Error("occurrence_metrics_query_failed");

    return aggregateOccurrenceRowsByUnit(parseUnitOccurrenceDayRows(data));
  }, []);

  const result = useScopedQuery<MetricsQueryParams, UnitOccurrenceRow[]>({
    scope,
    enabled: canQuery,
    params: queryParams,
    fetcher,
    initial: EMPTY_ROWS,
    errorMessage: "Falha ao carregar rotinas agendadas.",
    label: "useUnitOccurrenceMetrics",
  });

  const kpis = useMemo(() => buildOccurrenceKpis(result.data), [result.data]);

  return { ...result, kpis };
}
