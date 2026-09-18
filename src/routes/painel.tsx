/*
 * ============================== /painel ==================================
 *
 * O painel OFICIAL do Tieck. A composição é a mesma que foi aprovada na vitrine
 * de apresentação (`PanelDashboard`), agora alimentada com DADOS REAIS desta
 * rota — não existe mais `?uiPreview=1`, nem dois dashboards competindo dentro
 * da mesma rota.
 *
 * O que esta rota faz:
 *   • resolve acesso (auth + workspace + RBAC) antes de decidir qualquer coisa;
 *   • mantém o recorte na URL (`startDate`, `endDate`, `unitId`, `shiftId`) —
 *     a fonte de verdade única dos filtros, já usada pelos drill-downs;
 *   • consulta a view analítica (`useUnitCompliance`) e as rotinas
 *     (`useUnitOccurrenceMetrics`) no escopo do workspace atual;
 *   • agrega os KPIs do recorte e entrega tudo pronto para a composição.
 *
 * O que esta rota NÃO faz: inventar dado. Seção sem contrato real aparece vazia
 * e explicando o motivo (ver `PanelDashboard`).
 */
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo } from "react";
import { CircleDot, OctagonAlert, TriangleAlert } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { useWorkspaceRBAC } from "@/hooks/useWorkspaceRBAC";
import { DashboardLayout } from "@/components/DashboardLayout";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";
import { sanitizeFilters, type DashboardFilters } from "@/lib/dashboard-filters";
import {
  PanelDashboard,
  type PanelKpis,
} from "@/components/dashboard/panel/PanelDashboard";
import {
  panelPeriodLabel,
  panelScopeLabel,
} from "@/components/dashboard/panel/filters";
import type { AttentionRow } from "@/components/dashboard/real/RealAttentionRanking";
import { useUnitCompliance, type UnitComplianceRow } from "@/hooks/useUnitCompliance";
import { useUnitOccurrenceMetrics } from "@/hooks/useUnitOccurrenceMetrics";
import { useRecentChecklistExecutions } from "@/hooks/useRecentChecklistExecutions";
import { useChecklistActivity } from "@/hooks/useChecklistActivity";
import { useAccessibleUnits } from "@/hooks/useAccessibleUnits";
import { STATUS_META, getOperationalStatus, aggregateWeighted } from "@/lib/operational-status";
import { resolveEffectiveShiftId, shouldClearShiftId } from "@/lib/dashboard-filters";
import { useShiftOptions } from "@/hooks/useShiftOptions";

// Meta operacional do produto — usada na copy do painel ("meta operacional 90%").
const OPERATIONAL_TARGET = 90;

// URL-synced filters. Validação isomórfica — nunca lança para não quebrar SSR.
type PainelSearch = {
  startDate?: string;
  endDate?: string;
  unitId?: string;
  shiftId?: string;
};

export const Route = createFileRoute("/painel")({
  validateSearch: (raw: Record<string, unknown>): PainelSearch => {
    const s = sanitizeFilters({
      startDate: typeof raw.startDate === "string" ? raw.startDate : undefined,
      endDate: typeof raw.endDate === "string" ? raw.endDate : undefined,
      unitId: typeof raw.unitId === "string" ? raw.unitId : undefined,
      shiftId: typeof raw.shiftId === "string" ? raw.shiftId : undefined,
    });
    return {
      startDate: s.startDate || undefined,
      endDate: s.endDate || undefined,
      unitId: s.unitId || undefined,
      shiftId: s.shiftId || undefined,
    };
  },
  head: () => ({
    meta: [
      { title: "Painel operacional — Tieck" },
      { name: "description", content: "Conformidade em tempo real por unidade e turno." },
    ],
  }),
  component: PainelPage,
});

/** KPIs agregados do recorte — mesma conta de sempre, agora tipada para a UI. */
function computeKpis(rows: UnitComplianceRow[]): Omit<
  PanelKpis,
  | "units"
  | "exceptionsOpen"
  | "dueCompliance"
  | "plannedCompliance"
  | "doneShare"
  | "onTimeShare"
  | "lateShare"
> {
  let scheduled = 0,
    due = 0,
    done = 0,
    onTime = 0,
    late = 0,
    overdueOpen = 0;
  let critical = 0,
    pendingEv = 0,
    attention = 0;
  for (const r of rows) {
    scheduled += r.totalScheduledTasks;
    due += r.totalDueTasks;
    done += r.completedTasks;
    onTime += r.completedOnTime;
    late += r.completedLate;
    overdueOpen += r.overdueOpenTasks;
    critical += r.criticalFailures;
    pendingEv += r.pendingEvidences;
    const s = getOperationalStatus({
      dueCompliancePercentage: r.dueCompliancePercentage,
      dueWeightTotal: r.dueWeightTotal,
      criticalFailures: r.criticalFailures,
      overdueOpenTasks: r.overdueOpenTasks,
      completedLate: r.completedLate,
    });
    if (s === "critico" || s === "atencao") attention += 1;
  }
  return { scheduled, due, done, onTime, late, overdueOpen, critical, pendingEv, attention };
}

function PainelPage() {
  const navigate = useNavigate();
  const { currentWorkspace, workspaceStatus } = useWorkspace();
  const { isAdmin, loading: rbacLoading } = useWorkspaceRBAC(currentWorkspace?.id);
  // Enquanto o workspace ainda está resolvendo, `currentWorkspace` é null e o
  // RBAC nem é consultado — decidir "não é admin" nesse instante expulsava
  // administradores para /inicio no primeiro carregamento da rota.
  const workspaceLoading = workspaceStatus === "loading";
  const { user, loading: authLoading } = useAuth();
  const search = Route.useSearch();

  // Recorte: SEMPRE vindo da URL (sem loop de estado local).
  const filters: DashboardFilters = useMemo(
    () => sanitizeFilters(search),
    [search.startDate, search.endDate, search.unitId, search.shiftId], // eslint-disable-line react-hooks/exhaustive-deps
  );

  // "Restaurar padrão" da toolbar devolve o recorte de fábrica do produto.
  const defaultFilters = useMemo(() => sanitizeFilters({}), []);

  // Escopo explícito: somente dados do workspace atual (defesa em profundidade
  // além da RLS — 6B.1B). Sem workspace selecionado, nada é consultado.
  const canLoadOperationalData =
    !rbacLoading && !authLoading && !!user && isAdmin && !!currentWorkspace?.id;

  // Turno global (6B.3): as opções são resolvidas para o escopo ATUAL (workspace
  // + unidade). Enquanto não resolvem, nenhuma consulta de dados é disparada com
  // um turno que pode não existir na unidade escolhida — e, se o turno selecionado
  // não pertencer à unidade, ele é limpo da URL em vez de ficar como combinação
  // impossível.
  const shiftOptions = useShiftOptions({
    organizationId: currentWorkspace?.id ?? null,
    unitId: filters.unitId,
    enabled: canLoadOperationalData,
  });
  const availableShiftIds = useMemo(
    () => shiftOptions.shifts.map((s) => s.id),
    [shiftOptions.shifts],
  );
  const effectiveShiftId = resolveEffectiveShiftId({
    shiftId: filters.shiftId,
    availableShiftIds,
    optionsResolved: shiftOptions.resolved,
  });
  const canLoadFilteredData = canLoadOperationalData && (!filters.shiftId || shiftOptions.resolved);

  // Unidades reais do workspace ATUAL — escopo explícito (`workspace_id` na
  // consulta, além da RLS) e o mesmo gate do resto do painel: sem workspace
  // válido não há consulta, e trocar de workspace nunca publica unidades do
  // anterior. Mesma fonte que o filtro de unidade usa.
  const { units } = useAccessibleUnits({
    workspaceId: currentWorkspace?.id ?? null,
    enabled: canLoadOperationalData,
  });
  const unitOptions = useMemo(
    () => units.map((unit) => ({ id: unit.id, name: unit.name })),
    [units],
  );

  const compliance = useUnitCompliance({
    ...filters,
    shiftId: effectiveShiftId,
    organizationId: currentWorkspace?.id ?? null,
    enabled: canLoadFilteredData,
  });

  // Rotinas agendadas (6B.2D): superfície PARALELA aos KPIs de tarefas. Fonte e
  // estado separados de propósito — uma rotina recorrente nunca entra nos
  // números de task_executions, e vice-versa (sem double count, sem dedupe por
  // heurística). Mesmo gate e mesmo escopo do restante do painel.
  const occurrences = useUnitOccurrenceMetrics({
    ...filters,
    shiftId: effectiveShiftId,
    organizationId: currentWorkspace?.id ?? null,
    enabled: canLoadFilteredData,
  });

  // Últimas execuções (6B.2E): occurrences de rotinas CONCLUÍDAS do recorte,
  // numa única consulta workspace-scoped (sem fan-out por unidade). Mesmo gate e
  // mesmos filtros do resto do painel; resposta avulsa nunca entra aqui.
  const recentExecutions = useRecentChecklistExecutions({
    organizationId: currentWorkspace?.id ?? null,
    startDate: filters.startDate,
    endDate: filters.endDate,
    unitId: filters.unitId,
    shiftId: effectiveShiftId,
    enabled: canLoadFilteredData,
  });

  // Atividade dos checklists: série diária de TAREFAS (mesma view analítica dos
  // KPIs), uma consulta workspace-scoped agregada por dia civil. Mesmo gate e
  // mesmos filtros do resto do painel — e realtime pelo mesmo domínio.
  const activity = useChecklistActivity({
    organizationId: currentWorkspace?.id ?? null,
    startDate: filters.startDate,
    endDate: filters.endDate,
    unitId: filters.unitId,
    shiftId: effectiveShiftId,
    enabled: canLoadFilteredData,
  });

  const displayRows: UnitComplianceRow[] = compliance.data;
  const displayOccurrenceRows = occurrences.data;

  const dueCompliance = useMemo(
    () =>
      aggregateWeighted(
        displayRows.map((r) => ({ weightDone: r.dueWeightDone, weightTotal: r.dueWeightTotal })),
      ),
    [displayRows],
  );

  const plannedCompliance = useMemo(
    () =>
      aggregateWeighted(
        displayRows.map((r) => ({ weightDone: r.weightDone, weightTotal: r.weightTotal })),
      ),
    [displayRows],
  );

  const baseKpis = useMemo(() => computeKpis(displayRows), [displayRows]);

  const kpis: PanelKpis = useMemo(() => {
    const share = (part: number, total: number) => (total > 0 ? (part / total) * 100 : null);
    return {
      ...baseKpis,
      units: displayRows.length,
      exceptionsOpen: baseKpis.critical + baseKpis.overdueOpen + baseKpis.pendingEv,
      dueCompliance,
      plannedCompliance,
      doneShare: share(baseKpis.done, baseKpis.scheduled),
      onTimeShare: share(baseKpis.onTime, baseKpis.done),
      lateShare: share(baseKpis.late, baseKpis.done),
    };
  }, [baseKpis, displayRows.length, dueCompliance, plannedCompliance]);

  // KPIs de ROTINA vêm do próprio hook (mesma fonte das linhas) — nunca são
  // recalculados aqui, para não existirem duas contas do mesmo domínio.
  const occurrenceKpis = occurrences.kpis;

  // Pesos agregados do recorte — usados pela MESMA regra de status do domínio,
  // apenas para rotular a saúde da operação (nenhuma fórmula nova).
  const aggregateDueWeightTotal = useMemo(
    () => displayRows.reduce((acc, r) => acc + (r.dueWeightTotal ?? 0), 0),
    [displayRows],
  );

  const healthStatus = getOperationalStatus({
    dueCompliancePercentage: dueCompliance,
    dueWeightTotal: aggregateDueWeightTotal,
    criticalFailures: kpis.critical,
    overdueOpenTasks: kpis.overdueOpen,
    completedLate: kpis.late,
  });
  const healthMeta = STATUS_META[healthStatus];

  // Atenção operacional — as três exceções reais, ordenadas por severidade
  // (crítico → atenção → evidência), com participação real no total aberto.
  const attentionRows: AttentionRow[] = useMemo(
    () => [
      {
        key: "falhas",
        label: "Falhas críticas",
        severity: "Crítico",
        tone: "critical",
        count: kpis.critical,
        detail: "tarefas com falha crítica",
        share: kpis.exceptionsOpen > 0 ? (kpis.critical / kpis.exceptionsOpen) * 100 : null,
        icon: OctagonAlert,
      },
      {
        key: "atrasos",
        label: "Abertas em atraso",
        severity: "Atenção",
        tone: "warning",
        count: kpis.overdueOpen,
        detail: "tarefas vencidas sem execução",
        share: kpis.exceptionsOpen > 0 ? (kpis.overdueOpen / kpis.exceptionsOpen) * 100 : null,
        icon: TriangleAlert,
      },
      {
        key: "evidencias",
        label: "Evidências aguardando",
        severity: "Evidência",
        tone: "neutral",
        count: kpis.pendingEv,
        detail: "evidências pendentes de revisão",
        share: kpis.exceptionsOpen > 0 ? (kpis.pendingEv / kpis.exceptionsOpen) * 100 : null,
        icon: CircleDot,
      },
    ],
    [kpis.critical, kpis.overdueOpen, kpis.pendingEv, kpis.exceptionsOpen],
  );

  useEffect(() => {
    if (!rbacLoading && !authLoading && !workspaceLoading) {
      if (!user) {
        navigate({ to: "/login" });
        return;
      }
      if (!isAdmin) {
        toast.error("Acesso restrito a administradores");
        navigate({ to: "/inicio" });
        return;
      }
    }
  }, [isAdmin, rbacLoading, authLoading, workspaceLoading, user, navigate]);

  const navigateWithFilters = (next: DashboardFilters, replace: boolean) => {
    navigate({
      to: "/painel",
      search: {
        startDate: next.startDate,
        endDate: next.endDate,
        ...(next.unitId ? { unitId: next.unitId } : {}),
        ...(next.shiftId ? { shiftId: next.shiftId } : {}),
      },
      replace,
    });
  };

  const setFilters = (next: DashboardFilters) => navigateWithFilters(next, false);

  // Limpeza da combinação impossível: um turno que não existe na unidade
  // selecionada sai da URL automaticamente (replace, para não poluir o
  // histórico). Só age quando as opções do escopo atual já são conhecidas.
  useEffect(() => {
    if (!canLoadOperationalData) return;
    if (
      shouldClearShiftId({
        shiftId: filters.shiftId,
        availableShiftIds,
        optionsResolved: shiftOptions.resolved,
      })
    ) {
      navigateWithFilters({ ...filters, shiftId: undefined }, true);
    }
  }, [canLoadOperationalData, filters, availableShiftIds, shiftOptions.resolved, navigate]);

  if (rbacLoading || workspaceLoading) {
    return (
      <DashboardLayout>
        <div className="space-y-6 p-6">
          <Skeleton className="h-10 w-64" />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-32 w-full" />
            ))}
          </div>
          <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
            <Skeleton className="h-72 w-full" />
            <Skeleton className="h-72 w-full" />
          </div>
        </div>
      </DashboardLayout>
    );
  }

  if (!isAdmin) return null;

  return (
    <DashboardLayout>
      <main className="w-full flex-1 overflow-y-auto overflow-x-hidden">
        <PanelDashboard
          data={{
            filters,
            unitOptions,
            shiftOptions: shiftOptions.shifts,
            onFiltersChange: setFilters,
            defaultFilters,
            target: OPERATIONAL_TARGET,
            periodLabel: panelPeriodLabel(filters),
            scopeLabel: panelScopeLabel(filters, unitOptions, shiftOptions.shifts),
            // Rótulo REAL da saúde da operação (mesma regra de status do
            // domínio, apenas apresentada) — nenhuma fórmula nova.
            health: { label: healthMeta.label, dot: healthMeta.dot },
            onRetry: () => void compliance.refresh(),
            kpis,
            unitRows: displayRows,
            occurrenceRows: displayOccurrenceRows,
            occurrenceKpis,
            attention: attentionRows,
            recentExecutions: recentExecutions.data,
            activity: activity.data,
            loading: {
              kpis: compliance.loading,
              table: compliance.loading,
              routines: occurrences.loading,
              recentExecutions: recentExecutions.loading,
              activity: activity.loading,
            },
            error: compliance.error,
            occurrencesError: occurrences.error,
            recentExecutionsError: recentExecutions.error,
            activityError: activity.error,
            onOccurrencesRetry: () => void occurrences.refresh(),
            onRecentExecutionsRetry: () => void recentExecutions.refresh(),
            onActivityRetry: () => void activity.refresh(),
            onRowClick: (row) =>
              openUnitById(row.unitId, { ...filters, shiftId: effectiveShiftId }, navigate),
            onUnitClick: (unitId) =>
              openUnitById(unitId, { ...filters, shiftId: effectiveShiftId }, navigate),
            // "Ver Checklist" de uma execução: MESMO destino que Recentes,
            // início e organizar já usam — `/checklist?id=<checklistId>` (id
            // real do checklist; nunca busca por título).
            onOpenChecklist: (checklistId) =>
              navigate({ to: "/checklist", search: { id: checklistId } }),
          }}
        />
      </main>
    </DashboardLayout>
  );
}

/**
 * Drill-down por unidade com o MESMO período que produziu os números clicados.
 * O turno global acompanha o drill-down (6B.3): o detalhe inicializa o seu
 * seletor a partir da URL e cai em "todos" se o turno não pertencer à unidade
 * clicada.
 */
function openUnitById(
  unitId: string,
  f: DashboardFilters,
  navigate: ReturnType<typeof useNavigate>,
) {
  navigate({
    to: "/unidades/$unitId/operacao",
    params: { unitId },
    search: {
      startDate: f.startDate,
      endDate: f.endDate,
      ...(f.shiftId ? { shiftId: f.shiftId } : {}),
    },
  });
}
