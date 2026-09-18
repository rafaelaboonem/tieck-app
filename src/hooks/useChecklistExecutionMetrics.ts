/**
 * "Execução por checklist" do /painel — leitura REAL e workspace-scoped
 * (6B.2J, migration 20260918120000 JÁ APLICADA no remoto).
 *
 * Uma única consulta agregada (a RPC agrupa por checklist_id no banco) resolve
 * o recorte inteiro: período + unidade opcional + turno opcional. A identidade
 * estatística é a OCCURRENCE e o grão chega pronto — uma linha por checklist —
 * então o parser NÃO re-agrega nem deduplica (a RPC garante o grão).
 *
 * Domínio exclusivo de ROTINAS AGENDADAS (`checklist_execution_occurrences`):
 * nada de task_executions / analytics_unit_daily_compliance (domínio de TAREFAS
 * dos KPIs) e nada de resposta avulsa/pública (`visitor_id` não é identidade).
 * A autorização é resolvida DENTRO do banco (`has_role_in_workspace(...,
 * 'admin')` — o mesmo gate do /painel; unidade/turno precisam pertencer ao
 * workspace pedido).
 *
 * SEM REALTIME de propósito (espelha `useUnitOccurrenceMetrics`): o card reflete
 * o recorte no fetch e no retry — nenhum canal novo de `postgres_changes` é
 * aberto para esta leitura nesta etapa.
 *
 * Invariantes herdadas do `useScopedQuery` (as mesmas dos hooks analíticos do
 * painel): resultado de escopo anterior nunca é publicado (trocar período,
 * unidade ou turno devolve estado neutro); resposta antiga que termina por
 * último é descartada; callback do ciclo abandonado fica inerte; nada publica
 * depois do unmount; sem workspace válido ZERO consulta; loading e error são
 * canais separados — falha nunca é apresentada como "sem execuções".
 *
 * Se a RPC estiver indisponível, a chamada falha e o card mostra o estado de
 * ERRO (com retry) — deliberadamente diferente do estado vazio, para que a
 * ausência do contrato nunca seja lida como "nada aconteceu na operação".
 */
import { useCallback, useMemo } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";

import { supabase } from "@/integrations/supabase/client";
import { useScopedQuery, type UseScopedQueryResult } from "@/hooks/useScopedQuery";
import {
  parseChecklistExecutionMetrics,
  type ChecklistExecutionMetric,
  type ChecklistExecutionMetricsDatabase,
} from "@/lib/checklist-execution-metrics";

/** Fronteira única de cast (types.ts continua intocado, como em 6B.2B/2D/2E). */
const checklistMetricsClient = supabase as unknown as SupabaseClient<ChecklistExecutionMetricsDatabase>;

export type ChecklistExecutionMetricsParams = {
  /** workspaces.id === organization_id (defesa em profundidade além da RLS). */
  organizationId?: string | null;
  startDate: string; // YYYY-MM-DD inclusivo (recorte por occurrence_date no banco)
  endDate: string; // YYYY-MM-DD inclusivo
  unitId?: string | null;
  shiftId?: string | null;
  enabled?: boolean;
};

export type UseChecklistExecutionMetricsResult = UseScopedQueryResult<ChecklistExecutionMetric[]>;

type ChecklistMetricsQueryParams = {
  organizationId: string;
  startDate: string;
  endDate: string;
  unitId: string | null;
  shiftId: string | null;
};

const EMPTY_METRICS: ChecklistExecutionMetric[] = [];

export function useChecklistExecutionMetrics(
  params: ChecklistExecutionMetricsParams,
): UseChecklistExecutionMetricsResult {
  const { organizationId, startDate, endDate, unitId, shiftId, enabled = true } = params;
  const canQuery = !!enabled && !!organizationId;
  // O escopo inclui unidade e turno: qualquer um deles invalida o resultado
  // publicado (nunca uma linha da unidade/turno anterior).
  const scope = `${organizationId ?? ""}|${startDate}|${endDate}|${unitId ?? ""}|${shiftId ?? ""}`;

  const queryParams = useMemo<ChecklistMetricsQueryParams>(
    () => ({
      organizationId: organizationId ?? "",
      startDate,
      endDate,
      unitId: unitId ?? null,
      shiftId: shiftId ?? null,
    }),
    [organizationId, startDate, endDate, unitId, shiftId],
  );

  const fetcher = useCallback(
    async (p: ChecklistMetricsQueryParams): Promise<ChecklistExecutionMetric[]> => {
      const { data, error } = await checklistMetricsClient.rpc(
        "list_workspace_checklist_execution_metrics",
        {
          p_workspace_id: p.organizationId,
          p_start_date: p.startDate,
          p_end_date: p.endDate,
          // Ausente = todas as unidades / todos os turnos (sem filtro).
          ...(p.unitId ? { p_unit_id: p.unitId } : {}),
          ...(p.shiftId ? { p_shift_id: p.shiftId } : {}),
        },
      );
      // Falha genérica apenas: nenhum detalhe de SQL/schema/policy chega à UI.
      if (error) throw new Error("checklist_metrics_query_failed");

      return parseChecklistExecutionMetrics(data);
    },
    [],
  );

  return useScopedQuery<ChecklistMetricsQueryParams, ChecklistExecutionMetric[]>({
    scope,
    enabled: canQuery,
    params: queryParams,
    fetcher,
    initial: EMPTY_METRICS,
    errorMessage: "Falha ao carregar execução por checklist.",
    label: "useChecklistExecutionMetrics",
  });
}
