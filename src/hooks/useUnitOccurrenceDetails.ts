import { useCallback, useMemo } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { useScopedQuery, type UseScopedQueryResult } from "@/hooks/useScopedQuery";
import {
  parseWorkspaceExecutionOccurrences,
  sortOccurrencesByDue,
  type OccurrenceDashboardDatabase,
  type WorkspaceExecutionOccurrence,
} from "@/lib/occurrence-dashboard";

/**
 * 6B.2D — concrete occurrences of ONE unit, for the manager's "Rotinas" tab.
 *
 * Read access is resolved server-side by
 * `list_workspace_execution_occurrences(p_workspace_id, p_unit_id, …)`: the
 * database requires an ACTIVE membership plus the project's canonical
 * administrative role (`has_role_in_workspace(..., 'editor')`), verifies that
 * the unit belongs to that workspace and returns a minimal projection. The
 * browser never selects the occurrence tables directly.
 *
 * Period: occurrence_date BETWEEN startDate AND endDate — the occurrence's own
 * civil date, compared as a date and never reconverted to UTC (a completed
 * occurrence inside the period must stay in the history).
 */
const occurrencesClient = supabase as unknown as SupabaseClient<OccurrenceDashboardDatabase>;

export type UnitOccurrenceDetailsParams = {
  unitId?: string | null;
  startDate: string; // YYYY-MM-DD inclusive
  endDate: string; // YYYY-MM-DD inclusive
  /** workspaces.id === organization_id (explicit defense beyond RLS — 6B.1B). */
  organizationId?: string | null;
  enabled?: boolean;
};

export type UseUnitOccurrenceDetailsResult = UseScopedQueryResult<WorkspaceExecutionOccurrence[]>;

type DetailsQueryParams = {
  organizationId: string;
  unitId: string;
  startDate: string;
  endDate: string;
};

const EMPTY_OCCURRENCES: WorkspaceExecutionOccurrence[] = [];

export function useUnitOccurrenceDetails(
  params: UnitOccurrenceDetailsParams,
): UseUnitOccurrenceDetailsResult {
  const { unitId, startDate, endDate, organizationId, enabled = true } = params;
  const canQuery = !!enabled && !!unitId && !!organizationId;
  const scope = `${organizationId ?? ""}|${unitId ?? ""}|${startDate}|${endDate}`;

  const queryParams = useMemo<DetailsQueryParams>(
    () => ({
      organizationId: organizationId ?? "",
      unitId: unitId ?? "",
      startDate,
      endDate,
    }),
    [organizationId, unitId, startDate, endDate],
  );

  const fetcher = useCallback(
    async (p: DetailsQueryParams): Promise<WorkspaceExecutionOccurrence[]> => {
      const { data, error } = await occurrencesClient.rpc("list_workspace_execution_occurrences", {
        p_workspace_id: p.organizationId,
        p_unit_id: p.unitId,
        p_start_date: p.startDate,
        p_end_date: p.endDate,
      });
      // Generic failure only: no SQL/schema/policy detail reaches UI or logs.
      if (error) throw new Error("occurrence_details_query_failed");

      return sortOccurrencesByDue(parseWorkspaceExecutionOccurrences(data));
    },
    [],
  );

  return useScopedQuery<DetailsQueryParams, WorkspaceExecutionOccurrence[]>({
    scope,
    enabled: canQuery,
    params: queryParams,
    fetcher,
    initial: EMPTY_OCCURRENCES,
    errorMessage: "Falha ao carregar as rotinas da unidade.",
    label: "useUnitOccurrenceDetails",
  });
}
