import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useSidebar } from "@/contexts/SidebarContext";
import { useIsMobile } from "@/hooks/use-mobile";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card } from "@/components/tremor/ui/Card";
import { Badge } from "@/components/tremor/ui/Badge";
import { Button } from "@/components/ui/button";
import {
  CheckCircle2,
  AlertTriangle,
  AlertOctagon,
  Camera,
  Clock,
  Timer,
  ListChecks,
  Hourglass,
  CalendarClock,
} from "lucide-react";
import logoUrl from "../assets/local/logo-tieck.webp";
import {
  OperationalDashboardFilters,
  sanitizeFilters,
  type DashboardFilters,
} from "@/components/dashboard/OperationalDashboardFilters";
import { UnitComplianceChart } from "@/components/dashboard/UnitComplianceChart";
import { UnitPerformanceTable } from "@/components/dashboard/UnitPerformanceTable";
import { useUnitCompliance, type UnitComplianceRow } from "@/hooks/useUnitCompliance";
import { getOperationalStatus, aggregateWeighted } from "@/lib/operational-status";

// URL-synced filters. Validação isomórfica — nunca lança para não quebrar SSR.
type PainelSearch = { startDate?: string; endDate?: string; unitId?: string };

export const Route = createFileRoute("/painel")({
  validateSearch: (raw: Record<string, unknown>): PainelSearch => {
    const s = sanitizeFilters({
      startDate: typeof raw.startDate === "string" ? raw.startDate : undefined,
      endDate: typeof raw.endDate === "string" ? raw.endDate : undefined,
      unitId: typeof raw.unitId === "string" ? raw.unitId : undefined,
    });
    return { 
      startDate: s.startDate || undefined, 
      endDate: s.endDate || undefined, 
      unitId: s.unitId || undefined 
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

function PainelPage() {
  const { user, loading: authLoading } = useAuth();
  const { sidebarOpen } = useSidebar();
  const navigate = useNavigate();
  const search = Route.useSearch();

  // Filtros centrais derivados da URL (fonte da verdade única, sem loop).
  const filters: DashboardFilters = useMemo(
    () => sanitizeFilters(search),
    [search.startDate, search.endDate, search.unitId], // eslint-disable-line react-hooks/exhaustive-deps
  );

  useEffect(() => {
    if (!authLoading && !user) navigate({ to: "/login" });
  }, [authLoading, user, navigate]);

  const setFilters = (next: DashboardFilters) => {
    navigate({
      to: "/painel",
      search: {
        startDate: next.startDate,
        endDate: next.endDate,
        ...(next.unitId ? { unitId: next.unitId } : {}),
      },
      replace: false,
    });
  };

  const compliance = useUnitCompliance(filters);
  const rows = compliance.data;

  // Agregação central: pesos somados, fórmula reaplicada.
  const dueCompliance = aggregateWeighted(
    rows.map((r) => ({ weightDone: r.dueWeightDone, weightTotal: r.dueWeightTotal })),
  );
  const plannedCompliance = aggregateWeighted(
    rows.map((r) => ({ weightDone: r.weightDone, weightTotal: r.weightTotal })),
  );

  const kpis = useMemo(() => {
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
  }, [rows]);

  const empty = !compliance.loading && rows.length === 0;
  const noDueYet = !empty && rows.every((r) => r.dueWeightTotal === 0);

  return (
    <DashboardLayout>
      <header className="flex items-center justify-between px-4 sm:px-6 py-4">
        <div
          className={`flex items-center gap-2 transition-all duration-300 ${!sidebarOpen && !isMobile ? "pl-14" : "pl-0"} ${isMobile && !sidebarOpen ? "pl-12" : "pl-0"}`}
        >
          <img src={logoUrl} alt="Logo" className={`${isMobile ? "w-8 h-8" : "w-10 h-10"} object-contain`} />
          <span className="text-neutral-400">›</span>
          <span className="text-neutral-600 font-medium truncate max-w-[150px] sm:max-w-none">Painel operacional</span>
        </div>
      </header>

      <main className="flex-1 px-6 py-6 overflow-y-auto bg-neutral-50/50">
        <div className="max-w-7xl mx-auto space-y-6">
          <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
            <div>
              <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-neutral-900">
                Visão da operação
              </h1>
              <p className="text-sm text-neutral-500">
                {filters.startDate} → {filters.endDate}
                {filters.unitId ? " · unidade filtrada" : " · todas as unidades"}
              </p>
            </div>
            <OperationalDashboardFilters value={filters} onChange={setFilters} />
          </div>

          {compliance.error && (
            <Card>
              <div className="flex items-center justify-between">
                <p className="text-sm text-rose-600">Erro ao carregar dados: {compliance.error}</p>
                <Button variant="outline" size="sm" onClick={() => compliance.refresh()}>
                  Tentar novamente
                </Button>
              </div>
            </Card>
          )}

          {/* KPIs principais */}
          <section aria-labelledby="kpi-title">
            <h2 id="kpi-title" className="sr-only">
              Indicadores principais
            </h2>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
              <KpiCard
                label="Operação agora"
                value={dueCompliance === null ? "—" : `${dueCompliance.toFixed(1)}%`}
                hint={
                  dueCompliance === null
                    ? "Nenhuma tarefa prevista venceu até o momento."
                    : "Considera apenas tarefas cujo horário já chegou."
                }
                icon={<Timer className="w-4 h-4" />}
                accent="bg-pink-50 text-[#FF007F]"
                loading={compliance.loading}
              />
              <KpiCard
                label="Planejamento do período"
                value={plannedCompliance === null ? "—" : `${plannedCompliance.toFixed(1)}%`}
                hint="Inclui tarefas futuras já programadas."
                icon={<CalendarClock className="w-4 h-4" />}
                accent="bg-blue-50 text-blue-600"
                loading={compliance.loading}
              />
              <KpiCard
                label="Tarefas programadas"
                value={kpis.scheduled}
                icon={<ListChecks className="w-4 h-4" />}
                accent="bg-neutral-100 text-neutral-700"
                loading={compliance.loading}
              />
              <KpiCard
                label="Deveriam ter sido feitas"
                value={kpis.due}
                icon={<Hourglass className="w-4 h-4" />}
                accent="bg-amber-50 text-amber-600"
                loading={compliance.loading}
              />
              <KpiCard
                label="Concluídas"
                value={`${kpis.done}`}
                hint={`${kpis.onTime} no prazo · ${kpis.late} com atraso`}
                icon={<CheckCircle2 className="w-4 h-4" />}
                accent="bg-emerald-50 text-emerald-600"
                loading={compliance.loading}
              />
              <KpiCard
                label="Abertas em atraso"
                value={kpis.overdueOpen}
                icon={<Clock className="w-4 h-4" />}
                accent="bg-amber-50 text-amber-700"
                loading={compliance.loading}
              />
              <KpiCard
                label="Falhas críticas"
                value={kpis.critical}
                icon={<AlertOctagon className="w-4 h-4" />}
                accent="bg-rose-50 text-rose-600"
                loading={compliance.loading}
              />
              <KpiCard
                label="Evidências aguardando"
                value={kpis.pendingEv}
                icon={<Camera className="w-4 h-4" />}
                accent="bg-cyan-50 text-cyan-600"
                loading={compliance.loading}
              />
              <KpiCard
                label="Unidades em atenção"
                value={kpis.attention}
                icon={<AlertTriangle className="w-4 h-4" />}
                accent="bg-amber-50 text-amber-600"
                loading={compliance.loading}
              />
            </div>
          </section>

          {/* Gráfico */}
          <section aria-labelledby="chart-title">
            <div className="flex items-baseline justify-between mb-3">
              <h2 id="chart-title" className="text-sm font-semibold text-neutral-700">
                Conformidade operacional por unidade
              </h2>
              <Badge variant="neutral">{rows.length} unidades</Badge>
            </div>
            <Card>
              {empty ? (
                <EmptyState
                  title="Sem tarefas programadas no período"
                  detail="Ajuste o filtro de datas ou cadastre tarefas."
                />
              ) : noDueYet ? (
                <EmptyState
                  title="Sem atividade até o momento"
                  detail="Há tarefas programadas, mas nenhuma venceu ainda."
                />
              ) : (
                <UnitComplianceChart data={rows} loading={compliance.loading} metric="due" />
              )}
            </Card>
          </section>

          {/* Tabela */}
          <section aria-labelledby="table-title">
            <div className="flex items-baseline justify-between mb-3">
              <h2 id="table-title" className="text-sm font-semibold text-neutral-700">
                Desempenho por unidade
              </h2>
              <p className="text-xs text-neutral-400">
                Ordenação padrão: críticas · atenção · padrão
              </p>
            </div>
            <Card>
              <UnitPerformanceTable
                rows={rows}
                loading={compliance.loading}
                onRowClick={(r) => openUnit(r, filters, navigate)}
              />
            </Card>
          </section>
        </div>
      </main>
    </DashboardLayout>
  );
}

function openUnit(
  r: UnitComplianceRow,
  f: DashboardFilters,
  navigate: ReturnType<typeof useNavigate>,
) {
  navigate({
    to: "/unidades/$unitId/operacao",
    params: { unitId: r.unitId },
    search: { startDate: f.startDate, endDate: f.endDate },
  });
}

function KpiCard({
  label,
  value,
  icon,
  accent,
  hint,
  loading,
}: {
  label: string;
  value: number | string;
  icon: React.ReactNode;
  accent: string;
  hint?: string;
  loading?: boolean;
}) {
  return (
    <div className="bg-white border border-neutral-200/70 rounded-xl p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-neutral-500">{label}</span>
        <span className={`w-7 h-7 rounded-lg flex items-center justify-center ${accent}`}>
          {icon}
        </span>
      </div>
      {loading ? (
        <div
          className="mt-2 h-7 w-20 rounded bg-neutral-100 animate-pulse"
          aria-label="Carregando"
        />
      ) : (
        <div className="mt-2 text-2xl font-bold text-neutral-900">{value}</div>
      )}
      {hint && <p className="text-[11px] text-neutral-400 mt-1 leading-snug">{hint}</p>}
    </div>
  );
}

function EmptyState({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="py-10 text-center">
      <p className="text-sm font-semibold text-neutral-700">{title}</p>
      <p className="text-xs text-neutral-500 mt-1">{detail}</p>
    </div>
  );
}
