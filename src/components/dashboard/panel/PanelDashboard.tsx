/*
 * ================ PAINEL OFICIAL — COMPOSIÇÃO ÚNICA ======================
 *
 * Este é o dashboard de `/painel`. A composição é a que foi aprovada na vitrine
 * de apresentação: header "Visão da operação" com a toolbar (período · unidade ·
 * escala + os dois personalizadores), quatro indicadores independentes,
 * atividade dos checklists, análise (conformidade + execução), operação recente
 * (últimas execuções + pontos de atenção), desempenho por unidade, insights e
 * rotinas.
 *
 * APRESENTAÇÃO ≠ DADOS. Este arquivo não conhece fixture, Supabase nem hook: ele
 * recebe tudo por `data` e desenha. Quem consulta é a rota (`/painel`), que já
 * aplica o escopo do workspace. Assim a mesma composição serve para dados reais
 * e para a vitrine DEV, sem que nenhum número de exemplo possa escorregar para
 * produção — não existe caminho de código que injete fixture aqui.
 *
 * ZERO MÓDULOS SEM FONTE. Todas as seções configuráveis recebem dado real do
 * recorte — a rota consulta e passa o dado pronto, e cada card cobre
 * loading → erro → vazio/linhas:
 *   • KPIs, tabela, gráfico, pontos de atenção — view de tarefas
 *     (`analytics_unit_daily_compliance`), agregada por unidade;
 *   • "Atividade dos checklists" — a MESMA view, agregada por dia civil;
 *   • "Insights da operação" — a MESMA resposta, agregada por turno (6B.2I);
 *   • "Últimas execuções" e "Rotinas agendadas" — contracts próprios (6B.2E/6B.2D).
 * Nenhum número de exemplo, nenhuma fixture e nenhuma seção "em breve".
 *
 * DOIS RECORTES INDEPENDENTES: os FILTROS vêm de fora (URL) e alimentam todas as
 * seções; a VISIBILIDADE dos módulos é só apresentação — esconder um módulo não
 * reseta filtro nenhum, não muda o dado dos outros e, depois da animação, o
 * módulo deixa de ser renderizado.
 */
import * as React from "react";
import {
  CalendarCheck,
  ClipboardCheck,
  CircleCheckBig,
  LayoutDashboard,
  TriangleAlert,
} from "lucide-react";

import "./panel-light.css";

import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import type { OccurrenceKpis, UnitOccurrenceRow } from "@/lib/occurrence-dashboard";
import type { ChecklistActivityDay } from "@/lib/checklist-activity";
import type { ShiftComplianceRow } from "@/lib/shift-compliance";
import type { UnitComplianceRow } from "@/hooks/useUnitCompliance";

import { RealAttentionRanking, type AttentionRow } from "../real/RealAttentionRanking";
import { RealChecklistActivity } from "../real/RealChecklistActivity";
import { RealComplianceChart } from "../real/RealComplianceChart";
import { RealExecutionBreakdown } from "../real/RealExecutionBreakdown";
import { RealMetricCard, type RealMetric } from "../real/RealMetricsOverview";
import { RealRecentExecutions, type RecentExecution } from "../real/RealRecentExecutions";
import { RealOperationalInsights } from "../real/RealOperationalInsights";
import { RealUnitDataTable } from "../real/RealUnitDataTable";
import { ScheduledOccurrencesSection } from "../ScheduledOccurrencesSection";
import { PanelToolbar } from "./Toolbar";
import {
  CollapsibleSection,
  SectionsCustomizer,
  isSectionVisible,
  useVisibleSections,
  type DashboardSectionId,
} from "./SectionsCustomizer";
import { useVisibleFilters } from "./filters";
import type { DashboardFilters } from "@/lib/dashboard-filters";

/**
 * KPIs do recorte. Mesma forma que o painel já calculava (agregado das linhas da
 * view por unidade) — a composição só decide como apresentar.
 */
export type PanelKpis = {
  scheduled: number;
  due: number;
  done: number;
  onTime: number;
  late: number;
  overdueOpen: number;
  critical: number;
  pendingEv: number;
  attention: number;
  units: number;
  exceptionsOpen: number;
  dueCompliance: number | null;
  plannedCompliance: number | null;
  doneShare: number | null;
  onTimeShare: number | null;
  lateShare: number | null;
};

export type PanelDashboardData = {
  filters: DashboardFilters;
  /** Opções REAIS da toolbar (unidades do workspace; turnos do escopo atual). */
  unitOptions: { id: string; name: string }[];
  shiftOptions: { id: string; name: string }[];
  onFiltersChange: (next: DashboardFilters) => void;
  /** Recorte de fábrica do produto (usado por "restaurar padrão"). */
  defaultFilters: DashboardFilters;
  /** Meta operacional real do produto. */
  target: number;
  periodLabel: string;
  scopeLabel: string;
  /** Saúde da operação (regra de status do domínio) — só apresentação. */
  health: { label: string; dot: string };
  onRetry?: () => void;
  kpis: PanelKpis;
  unitRows: UnitComplianceRow[];
  occurrenceRows: UnitOccurrenceRow[];
  occurrenceKpis: OccurrenceKpis;
  attention: AttentionRow[];
  /**
   * "Insights da operação": conformidade/execução por TURNO, da MESMA resposta
   * de `useUnitCompliance` (nenhuma consulta própria). `shiftId = null` é o
   * bucket real de execuções sem turno.
   */
  shiftInsights: ShiftComplianceRow[];
  /**
   * "Atividade dos checklists": série diária REAL do recorte — TAREFAS
   * programadas × concluídas por dia (`analytics_unit_daily_compliance`). Mesmo
   * domínio dos KPIs, nunca resposta de checklist nem ocorrência de rotina.
   */
  activity: ChecklistActivityDay[];
  /**
   * "Últimas execuções": execuções CONCLUÍDAS de rotinas agendadas no recorte
   * (6B.2E). Resposta avulsa/pública não entra — não tem executor confiável.
   */
  recentExecutions: RecentExecution[];
  loading: {
    kpis: boolean;
    table: boolean;
    routines: boolean;
    recentExecutions: boolean;
    activity: boolean;
    /** Mesmo `loading` de `useUnitCompliance` — não é um segundo estado. */
    shiftInsights: boolean;
  };
  error: string | null;
  occurrencesError: string | null;
  recentExecutionsError: string | null;
  activityError: string | null;
  onOccurrencesRetry?: () => void;
  onRecentExecutionsRetry?: () => void;
  onActivityRetry?: () => void;
  onRowClick: (row: UnitComplianceRow) => void;
  onUnitClick: (unitId: string) => void;
  /**
   * Navegação para o checklist de origem de uma execução
   * (`/checklist?id=<checklistId>`), sempre pelo id REAL do checklist.
   */
  onOpenChecklist?: (checklistId: string) => void;
};

function pct(value: number | null) {
  return value === null ? "—" : `${value.toFixed(1).replace(".", ",")}%`;
}

export function PanelDashboard({ data }: { data: PanelDashboardData }) {
  const [visibleSections, setVisibleSections] = useVisibleSections();
  const [visibleFilters, setVisibleFilters] = useVisibleFilters();
  const [panelCustomizerOpen, setPanelCustomizerOpen] = React.useState(false);

  const { kpis, target } = data;

  const sectionVisible = React.useCallback(
    (id: DashboardSectionId) => isSectionVisible(visibleSections, id),
    [visibleSections],
  );

  /** Cada indicador é um módulo independente — esconder um não afeta os outros. */
  const metricCards: Array<{ sectionId: DashboardSectionId; metric: RealMetric }> = [
    {
      sectionId: "scheduled",
      metric: {
        title: "Programados",
        value: String(kpis.scheduled),
        icon: CalendarCheck,
        tone: "neutral",
        badgeLabel: `${kpis.units} ${kpis.units === 1 ? "unidade" : "unidades"}`,
        footer: "Checklists programados no período",
        subfooter: `${kpis.due} já deveriam ter sido feitas`,
      },
    },
    {
      sectionId: "answered",
      metric: {
        title: "Respondidos",
        value: String(kpis.done),
        icon: ClipboardCheck,
        tone: "neutral",
        badgeLabel: `${pct(kpis.doneShare)} do programado`,
        footer: "Execuções concluídas pelas unidades",
        subfooter: `${kpis.onTime} no prazo · ${kpis.late} com atraso`,
      },
    },
    {
      sectionId: "on-time",
      metric: {
        title: "No prazo",
        value: String(kpis.onTime),
        icon: CircleCheckBig,
        tone: "success",
        badgeLabel: `${pct(kpis.onTimeShare)} do respondido`,
        footer: "Respondidos dentro da janela",
        subfooter: `Meta operacional ${target}%`,
      },
    },
    {
      sectionId: "overdue",
      metric: {
        title: "Em atraso",
        value: String(kpis.late),
        icon: TriangleAlert,
        tone: kpis.late > 0 ? "warning" : "neutral",
        badgeLabel: `${pct(kpis.lateShare)} do respondido`,
        footer: "Respondidos após o vencimento",
        subfooter: `${kpis.overdueOpen} abertas ainda em atraso`,
      },
    },
  ];

  const visibleMetricCount = metricCards.filter((card) => sectionVisible(card.sectionId)).length;

  const compliancePoints = data.unitRows.map((unit) => ({
    unit: unit.unitName,
    compliance: unit.dueCompliancePercentage,
    target,
  }));

  // Composição da execução: as duas fatias fecham o MESMO total (concluídas).
  const executionSlices = [
    {
      key: "no-prazo",
      label: "No prazo",
      color: "var(--chart-2)",
      amount: kpis.onTime,
      share: kpis.onTimeShare,
    },
    {
      key: "com-atraso",
      label: "Com atraso",
      color: "var(--chart-3)",
      amount: kpis.late,
      share: kpis.lateShare,
    },
  ];

  const showRoutinesSummary = sectionVisible("scheduled-routines");
  const showRoutinesByUnit = sectionVisible("routines-by-unit");

  return (
    <div
      data-testid="panel-dashboard"
      className="tieck-panel-light min-h-[100dvh] bg-background text-foreground"
    >
      <div className="@container/main flex flex-1 flex-col gap-6 p-4 md:p-6">
        {/* ------------------------------ header ------------------------------ */}
        {/* Container query (e não breakpoint de viewport): o shell do Tieck
            consome ~240px da largura, então `xl:` do template nunca dispararia. */}
        <div className="flex flex-col justify-between gap-4 @5xl:flex-row @5xl:items-start @5xl:gap-6">
          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-bold tracking-tight">Visão da operação</h1>
              {/* Estado REAL do recorte, pela regra de status do domínio. */}
              <span
                data-testid="panel-health"
                className="flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-semibold tracking-wide uppercase text-muted-foreground"
              >
                <span aria-hidden="true" className={cn("size-1.5 rounded-full", data.health.dot)} />
                {data.health.label}
              </span>
            </div>
            {/* Subtítulo compacto: período sempre; unidade/turno SÓ quando
                aplicados (os nomes vêm de `panelScopeLabel`, das opções
                reais) — e nada de "todas/todos/meta", que já vivem nos
                controles da toolbar. */}
            <p className="text-muted-foreground" data-testid="panel-subtitle">
              Período {data.periodLabel}
              {data.scopeLabel ? ` · ${data.scopeLabel}` : ""}
            </p>
          </div>
          <PanelToolbar
            filters={data.filters}
            onChange={data.onFiltersChange}
            defaults={data.defaultFilters}
            visibleFilters={visibleFilters}
            onVisibilityChange={setVisibleFilters}
            unitOptions={data.unitOptions}
            shiftOptions={data.shiftOptions}
            trailingSlot={
              <SectionsCustomizer
                visible={visibleSections}
                onChange={setVisibleSections}
                open={panelCustomizerOpen}
                onOpenChange={setPanelCustomizerOpen}
              />
            }
            className="min-w-0 flex-1"
          />
        </div>

        {/* ---------------------------- erro de dados ------------------------- */}
        {data.error && (
          <div
            data-testid="panel-error"
            className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-rose-200 bg-rose-50/60 px-4 py-3"
          >
            <p className="text-sm text-rose-700">Erro ao carregar dados: {data.error}</p>
            {data.onRetry && (
              <button
                type="button"
                onClick={data.onRetry}
                className="cursor-pointer rounded-md border border-rose-300 px-3 py-1.5 text-[13px] font-medium text-rose-700 transition-colors hover:bg-rose-100"
              >
                Tentar novamente
              </button>
            )}
          </div>
        )}

        {/* ------------------------- nada visível ainda ----------------------- */}
        {visibleSections.length === 0 && (
          <div
            data-testid="panel-empty-state"
            className="flex flex-col items-start gap-3 rounded-xl border border-dashed p-6"
          >
            <div>
              <p className="text-sm font-semibold">Você ocultou todos os módulos do painel.</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Os dados continuam aqui — escolha o que quer ver de novo.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setPanelCustomizerOpen(true)}
              className="flex h-8 cursor-pointer items-center gap-2 rounded-md border border-input bg-transparent px-3 text-[13px] font-medium shadow-xs transition-colors hover:bg-muted focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
            >
              <LayoutDashboard className="size-3.5" aria-hidden="true" />
              Personalizar painel
            </button>
          </div>
        )}

        {/* --------------------------- cards de checklist -------------------- */}
        {/* Linha flexível: 4, 3 ou 2 indicadores se distribuem sozinhos; com um
            só, o card mantém largura de KPI (nunca vira faixa gigante). */}
        {visibleMetricCount > 0 && (
          <div data-testid="metric-cards" className="flex flex-wrap gap-4">
            {metricCards.map(({ sectionId, metric }) => (
              <CollapsibleSection
                key={sectionId}
                id={sectionId}
                visible={sectionVisible(sectionId)}
                gap="1rem"
                className={cn(
                  "min-w-0",
                  visibleMetricCount > 1 ? "flex-1 basis-[45%] @5xl:basis-0" : "w-full max-w-sm",
                )}
              >
                {data.loading.kpis ? (
                  <Skeleton className="h-32 w-full" />
                ) : (
                  <RealMetricCard metric={metric} className="ti-hover-kpi h-full" />
                )}
              </CollapsibleSection>
            ))}
          </div>
        )}

        {/* --------------------------- atividade diária ---------------------- */}
        {/* Série diária REAL do recorte (tarefas programadas × concluídas por
            dia), do MESMO domínio dos KPIs. O recorte de período é o da toolbar
            — o card não tem filtro próprio. */}
        <CollapsibleSection id="checklist-activity" visible={sectionVisible("checklist-activity")}>
          <RealChecklistActivity
            data={data.activity}
            loading={data.loading.activity}
            error={!!data.activityError}
            onRetry={data.onActivityRetry}
            className="ti-hover-widget"
          />
        </CollapsibleSection>

        {/* ------------------------------- análise --------------------------- */}
        <div className="flex flex-col gap-6 @5xl:flex-row">
          <CollapsibleSection
            id="unit-compliance"
            visible={sectionVisible("unit-compliance")}
            className="min-w-0 @5xl:flex-1"
          >
            <RealComplianceChart
              data={compliancePoints}
              description="Conformidade das tarefas cujo horário já chegou, contra a meta operacional."
              className="ti-hover-widget"
              empty={
                compliancePoints.length === 0
                  ? {
                      title: "Sem tarefas programadas no período",
                      helper: "Ajuste o período ou os filtros para visualizar a conformidade.",
                    }
                  : null
              }
            />
          </CollapsibleSection>

          <CollapsibleSection
            id="period-execution"
            visible={sectionVisible("period-execution")}
            className="min-w-0 @5xl:flex-1"
          >
            <RealExecutionBreakdown
              slices={executionSlices}
              centerValue={String(kpis.done)}
              centerLabel="Concluídas"
              description="Tarefas concluídas no prazo e com atraso."
              contextLine={`Programadas ${kpis.scheduled} · deveriam ter sido feitas ${kpis.due} · concluídas ${kpis.done}`}
              className="ti-hover-widget"
            />
          </CollapsibleSection>
        </div>

        {/* --------------------------- operação recente ---------------------- */}
        <div className="flex flex-col gap-6 @5xl:flex-row">
          <CollapsibleSection
            id="recent-executions"
            visible={sectionVisible("recent-executions")}
            className="min-w-0 @5xl:flex-1"
          >
            {/* Dados REAIS do recorte (6B.2E): loading → erro → vazio/linhas.
                A seção cobre rotinas agendadas concluídas — não respostas
                avulsas, que não têm executor identificável. */}
            <RealRecentExecutions
              items={data.recentExecutions}
              description="Rotinas concluídas recentemente no período."
              loading={data.loading.recentExecutions}
              error={!!data.recentExecutionsError}
              onRetry={data.onRecentExecutionsRetry}
              onOpenChecklist={data.onOpenChecklist}
              className="ti-hover-widget"
            />
          </CollapsibleSection>

          <CollapsibleSection
            id="attention-points"
            visible={sectionVisible("attention-points")}
            className="min-w-0 @5xl:flex-1"
          >
            <RealAttentionRanking
              rows={data.attention}
              title="Pontos de atenção"
              description="Exceções abertas no período — falhas, atrasos e evidências."
              healthyLabel="Nenhuma pendência crítica no período"
              healthyHelper="Sem falhas críticas, atrasos abertos ou evidências aguardando."
              className="ti-hover-widget"
            />
          </CollapsibleSection>
        </div>

        {/* ------------------------ desempenho por unidade ------------------- */}
        <CollapsibleSection id="unit-performance" visible={sectionVisible("unit-performance")}>
          <RealUnitDataTable
            rows={data.unitRows}
            loading={data.loading.table}
            className="ti-hover-large"
            onRowClick={data.onRowClick}
          />
        </CollapsibleSection>

        {/* --------------------------- insights da operação ------------------ */}
        {/* Derivado da MESMA consulta de conformidade (agregação por turno), logo
            o recorte é o da toolbar e não existe estado assíncrono paralelo:
            loading/erro/retry são os de `useUnitCompliance`. */}
        <CollapsibleSection id="operation-insights" visible={sectionVisible("operation-insights")}>
          <RealOperationalInsights
            rows={data.shiftInsights}
            target={target}
            loading={data.loading.shiftInsights}
            error={!!data.error}
            onRetry={data.onRetry}
            className="ti-hover-large"
          />
        </CollapsibleSection>

        {/* ---------------------------- rotinas agendadas -------------------- */}
        {/* Domínio separado das tarefas. Os dois blocos internos (resumo e
            "Rotinas por unidade") são módulos distintos; a seção só desaparece
            quando os dois estão ocultos. */}
        <CollapsibleSection
          id="scheduled-routines"
          visible={showRoutinesSummary || showRoutinesByUnit}
        >
          <ScheduledOccurrencesSection
            rows={data.occurrenceRows}
            kpis={data.occurrenceKpis}
            loading={data.loading.routines}
            error={data.occurrencesError}
            onRetry={data.onOccurrencesRetry}
            className="ti-hover-widget"
            showSummary={showRoutinesSummary}
            showByUnit={showRoutinesByUnit}
            onUnitClick={data.onUnitClick}
          />
        </CollapsibleSection>
      </div>
    </div>
  );
}
