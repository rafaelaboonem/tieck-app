/*
 * ============== ATIVIDADE DOS CHECKLISTS — SÉRIE DIÁRIA REAL ==============
 *
 * Consulta `public.analytics_unit_daily_compliance` UMA vez, no recorte do
 * painel (período + unidade opcional + turno opcional), e devolve a série diária
 * já agregada por dia civil (ver `lib/checklist-activity.ts`).
 *
 * POR QUE UMA CONSULTA SÓ: a view é workspace-scoped por `organization_id` e tem
 * o turno como coluna — não existe motivo para fan-out por unidade (que seria N
 * consultas para desenhar um gráfico) nem para uma RPC nova. O escopo é aplicado
 * no servidor (RLS) E no cliente (`.eq("organization_id", …)`, defesa em
 * profundidade, como no resto do painel).
 *
 * DOMÍNIO: TAREFAS (`task_executions`), a mesma base dos KPIs de tarefa. Rotina
 * agendada é outro domínio (`useUnitOccurrenceMetrics`/6B.2E) e nunca entra aqui.
 *
 * REALTIME: o gráfico conta exatamente duas coisas — tarefas programadas
 * (`total_scheduled_tasks`) e concluídas (`completed_tasks`). Ambas só mudam
 * quando uma linha de `task_executions` é criada/alterada, então o canal observa
 * SÓ `task_executions` (da organização do recorte). `tasks` e `evidences` NÃO
 * entram: elas alteram peso/conformidade e evidências pendentes, não estes dois
 * contadores — assinar sem motivo só geraria recarga inútil. O canal só abre
 * quando o recorte inclui HOJE (data civil local) e o debounce segue o mesmo
 * padrão do resto do painel.
 *
 * GARANTIAS DE ESCOPO (herdadas de `useScopedQuery`, 6B.2D): troca de workspace,
 * de período, de unidade ou de turno nunca publica a série anterior; requisição
 * antiga não sobrescreve a nova; sem workspace não há consulta; desmontar não
 * publica nada; loading e erro são estados separados.
 */
import { useCallback, useEffect, useMemo } from "react";

import { supabase } from "@/integrations/supabase/client";
import { todayISO } from "@/lib/dashboard-filters";
import {
  activityRangeIncludesToday,
  buildDailyActivitySeries,
  parseChecklistActivityRows,
  type ChecklistActivityDay,
} from "@/lib/checklist-activity";
import { useScopedQuery } from "@/hooks/useScopedQuery";

export interface UseChecklistActivityParams {
  /** Escopo organizacional obrigatório (`workspaces.id`). */
  organizationId?: string | null;
  /** Dia civil inicial, inclusivo (`YYYY-MM-DD`). */
  startDate: string;
  /** Dia civil final, inclusivo (`YYYY-MM-DD`). */
  endDate: string;
  /** Ausente = todas as unidades do workspace. */
  unitId?: string;
  /** Ausente = todos os turnos (inclusive execuções sem turno). */
  shiftId?: string;
  enabled?: boolean;
}

export interface UseChecklistActivityResult {
  data: ChecklistActivityDay[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

/**
 * Contrato estrutural mínimo da view analítica. A dimensão de turno (6B.3) não
 * existe em `supabase/types.ts` porque a migration não foi aplicada remotamente;
 * tipamos apenas o encadeamento usado aqui (mesma estratégia de
 * `useUnitCompliance`/`useUnitOccurrenceMetrics`), sem alterar tipos gerados de
 * um schema que ainda não os possui.
 */
type ActivityQuery = PromiseLike<{ data: unknown; error: { message: string } | null }> & {
  eq: (column: string, value: string) => ActivityQuery;
  gte: (column: string, value: string) => ActivityQuery;
  lte: (column: string, value: string) => ActivityQuery;
};
type ActivityViewClient = {
  from: (table: "analytics_unit_daily_compliance") => {
    select: (columns: string) => ActivityQuery;
  };
};

const activityView = supabase as unknown as ActivityViewClient;

/** Valor neutro estável (identidade fixa: o engine compara por referência). */
const EMPTY_ACTIVITY: ChecklistActivityDay[] = [];

type ActivityQueryParams = {
  organizationId: string;
  startDate: string;
  endDate: string;
  unitId?: string;
  shiftId?: string;
};

async function fetchActivity(params: ActivityQueryParams): Promise<ChecklistActivityDay[]> {
  // Só as três colunas que a série usa — a view devolve muitas outras.
  let query = activityView
    .from("analytics_unit_daily_compliance")
    .select("reference_date,total_scheduled_tasks,completed_tasks")
    .eq("organization_id", params.organizationId)
    .gte("reference_date", params.startDate)
    .lte("reference_date", params.endDate);

  if (params.unitId) query = query.eq("unit_id", params.unitId);
  // Sem turno selecionado nenhum filtro é aplicado: "todos os turnos" inclui as
  // execuções sem turno.
  if (params.shiftId) query = query.eq("shift_id", params.shiftId);

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  return buildDailyActivitySeries(parseChecklistActivityRows(data), {
    startDate: params.startDate,
    endDate: params.endDate,
  });
}

export function useChecklistActivity(
  params: UseChecklistActivityParams,
): UseChecklistActivityResult {
  const {
    organizationId,
    startDate,
    endDate,
    unitId,
    shiftId,
    enabled = true,
  } = params;

  const canQuery = !!enabled && !!organizationId;

  // Escopo: tudo que muda QUAIS linhas a consulta devolve. Turno e unidade fazem
  // parte dele — trocar qualquer um invalida respostas em voo.
  const scope = `${organizationId ?? ""}|${startDate}|${endDate}|${unitId ?? ""}|${shiftId ?? ""}`;

  const fetcher = useCallback((p: ActivityQueryParams) => fetchActivity(p), []);

  const queryParams = useMemo<ActivityQueryParams>(
    () => ({
      organizationId: organizationId as string,
      startDate,
      endDate,
      unitId,
      shiftId,
    }),
    [organizationId, startDate, endDate, unitId, shiftId],
  );

  const { data, loading, error, refresh } = useScopedQuery<ActivityQueryParams, ChecklistActivityDay[]>({
    scope,
    enabled: canQuery,
    params: queryParams,
    fetcher,
    initial: EMPTY_ACTIVITY,
    errorMessage: "Não foi possível carregar a atividade.",
    label: "useChecklistActivity",
  });

  useEffect(() => {
    if (!canQuery || !organizationId) return;
    // Só o recorte que inclui HOJE precisa acompanhar a operação ao vivo. "Hoje"
    // é a data civil LOCAL — com o dia UTC, a janela que termina hoje deixaria de
    // incluir hoje nas últimas horas do dia local e o canal simplesmente não
    // abriria.
    if (!activityRangeIncludesToday({ startDate, endDate }, todayISO())) return;

    let timer: ReturnType<typeof setTimeout> | null = null;
    const trigger = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        // O `refresh` do escopo vigente: se o recorte mudar, este callback
        // (do canal antigo, já removido) é bloqueado pelo gate de escopo.
        void refresh();
      }, 800);
    };

    const channel = supabase
      // O nome inclui o recorte inteiro: trocar de escopo abre um canal próprio
      // em vez de reaproveitar (por nome) o canal anterior.
      .channel(
        `checklist-activity-${organizationId}-${startDate}-${endDate}-${unitId ?? "all"}-${shiftId ?? "all"}`,
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "task_executions",
          filter: `organization_id=eq.${organizationId}`,
        },
        trigger,
      )
      .subscribe();

    return () => {
      if (timer) clearTimeout(timer);
      supabase.removeChannel(channel);
    };
  }, [canQuery, organizationId, startDate, endDate, unitId, shiftId, refresh]);

  return { data, loading, error, refresh };
}
