import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, AlertOctagon, Camera, Clock, ListChecks, CheckCircle2, Hourglass } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useSidebar } from "@/contexts/SidebarContext";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card } from "@/components/tremor/ui/Card";
import { Badge } from "@/components/tremor/ui/Badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import logoUrl from "../assets/local/logo-tieck.webp";
import {
  OperationalDashboardFilters,
  sanitizeFilters,
  type DashboardFilters,
} from "@/components/dashboard/OperationalDashboardFilters";
import { useUnitCompliance } from "@/hooks/useUnitCompliance";
import {
  useUnitOperationalDetails,
  type OperationalExecution,
} from "@/hooks/useUnitOperationalDetails";
import { OperationalTaskItem } from "@/components/operations/OperationalTaskItem";
import { TaskExecutionDetailDrawer } from "@/components/operations/TaskExecutionDetailDrawer";
import {
  deriveTaskStatus,
  isCriticalFailure,
  type OperationalTaskStatus,
} from "@/lib/task-execution-status";
import { aggregateWeighted, getOperationalStatus, STATUS_META } from "@/lib/operational-status";

type UnidadeSearch = { startDate?: string; endDate?: string };

export const Route = createFileRoute("/unidades/$unitId/operacao")({
  validateSearch: (raw: Record<string, unknown>): UnidadeSearch => {
    const s = sanitizeFilters({
      startDate: typeof raw.startDate === "string" ? raw.startDate : undefined,
      endDate: typeof raw.endDate === "string" ? raw.endDate : undefined,
    });
    return { startDate: s.startDate, endDate: s.endDate };
  },
  head: () => ({
    meta: [
      { title: "Detalhe operacional da unidade — Tieck" },
      { name: "description", content: "Execuções, atrasos, falhas críticas e evidências da unidade no período." },
    ],
  }),
  component: UnitOperacaoPage,
});

function UnitOperacaoPage() {
  const { user, loading: authLoading } = useAuth();
  const { sidebarOpen } = useSidebar();
  const navigate = useNavigate();
  const { unitId } = Route.useParams();
  const search = Route.useSearch();

  const filters: DashboardFilters = useMemo(
    () => sanitizeFilters({ ...search, unitId }),
    [search.startDate, search.endDate, unitId], // eslint-disable-line react-hooks/exhaustive-deps
  );

  useEffect(() => {
    if (!authLoading && !user) navigate({ to: "/login" });
  }, [authLoading, user, navigate]);

  // Verificação de acesso via RLS: tenta ler a unidade. Se não vier nada,
  // ou é inexistente ou o usuário não tem permissão. Antes disso, nada é
  // exibido além de "verificando".
  const [unit, setUnit] = useState<{ id: string; name: string } | null>(null);
  const [access, setAccess] = useState<"loading" | "ok" | "denied">("loading");
  useEffect(() => {
    let cancelled = false;
    setAccess("loading");
    supabase
      .from("units")
      .select("id,name")
      .eq("id", unitId)
      .maybeSingle()
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error || !data) {
          setAccess("denied");
          setUnit(null);
        } else {
          setUnit(data);
          setAccess("ok");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [unitId]);

  const setFilters = (next: DashboardFilters) => {
    navigate({
      to: "/unidades/$unitId/operacao",
      params: { unitId },
      search: { startDate: next.startDate, endDate: next.endDate },
    });
  };

  return (
    <DashboardLayout>
      <header className="flex items-center justify-between px-6 py-4">
        <div className={`flex items-center gap-2 transition-all duration-300 ${sidebarOpen ? "pl-0" : "pl-14"}`}>
          <img src={logoUrl} alt="Logo" className="w-10 h-10 object-contain" />
          <span className="text-neutral-400">›</span>
          <Link to="/painel" search={{ startDate: filters.startDate, endDate: filters.endDate }} className="text-neutral-500 hover:text-neutral-800">
            Painel
          </Link>
          <span className="text-neutral-400">›</span>
          <span className="text-neutral-700 font-medium truncate max-w-[240px]">
            {access === "ok" ? unit?.name : "Unidade"}
          </span>
        </div>
      </header>

      <main className="flex-1 px-4 md:px-6 py-6 overflow-y-auto bg-neutral-50/50">
        <div className="max-w-6xl mx-auto space-y-6">
          <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
            <div className="flex items-start gap-3">
              <Link
                to="/painel"
                search={{ startDate: filters.startDate, endDate: filters.endDate }}
                aria-label="Voltar ao painel"
                className="inline-flex items-center justify-center w-9 h-9 rounded-lg border border-neutral-200 bg-white hover:bg-neutral-100 focus:outline-none focus:ring-2 focus:ring-[#FF007F]/40"
              >
                <ArrowLeft className="w-4 h-4" />
              </Link>
              <div>
                <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-neutral-900">
                  {access === "ok" ? unit?.name : "Unidade"}
                </h1>
                <p className="text-sm text-neutral-500">
                  Operação · {filters.startDate} → {filters.endDate}
                </p>
              </div>
            </div>
            <OperationalDashboardFilters value={filters} onChange={setFilters} />
          </div>

          {access === "loading" && (
            <Card>
              <p className="text-sm text-neutral-500 py-6 text-center">Verificando permissão…</p>
            </Card>
          )}

          {access === "denied" && (
            <Card>
              <div className="py-10 text-center space-y-3">
                <p className="text-sm font-semibold text-neutral-700">
                  Unidade não encontrada ou sem permissão de acesso
                </p>
                <p className="text-xs text-neutral-500">
                  Verifique se você tem acesso a esta unidade na organização atual.
                </p>
                <Button variant="outline" size="sm" onClick={() => navigate({ to: "/painel" })}>
                  Voltar ao painel
                </Button>
              </div>
            </Card>
          )}

          {access === "ok" && (
            <UnitOperacaoContent
              filters={filters}
              backTo={{ startDate: filters.startDate, endDate: filters.endDate }}
            />
          )}
        </div>
      </main>
    </DashboardLayout>
  );
}

function UnitOperacaoContent({
  filters,
  backTo,
}: {
  filters: DashboardFilters;
  backTo: { startDate: string; endDate: string };
}) {
  void backTo; // preservado para uso futuro
  const compliance = useUnitCompliance({
    startDate: filters.startDate,
    endDate: filters.endDate,
    unitId: filters.unitId,
  });
  const details = useUnitOperationalDetails({
    unitId: filters.unitId!,
    startDate: filters.startDate,
    endDate: filters.endDate,
  });

  const row = compliance.data[0];
  const dueCompliance = row
    ? aggregateWeighted([{ weightDone: row.dueWeightDone, weightTotal: row.dueWeightTotal }])
    : null;
  const plannedCompliance = row
    ? aggregateWeighted([{ weightDone: row.weightDone, weightTotal: row.weightTotal }])
    : null;
  const status = row
    ? getOperationalStatus({
        dueCompliancePercentage: row.dueCompliancePercentage,
        dueWeightTotal: row.dueWeightTotal,
        criticalFailures: row.criticalFailures,
        overdueOpenTasks: row.overdueOpenTasks,
        completedLate: row.completedLate,
      })
    : "sem_atividade";
  const meta = STATUS_META[status];

  // Filtros locais
  const [shift, setShift] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [weight, setWeight] = useState<string>("all");
  const [withEvidence, setWithEvidence] = useState(false);
  const [showCancelled, setShowCancelled] = useState(false);
  const [selected, setSelected] = useState<OperationalExecution | null>(null);

  const now = useMemo(() => new Date(), []);
  const enriched = useMemo(
    () =>
      details.data.map((e) => ({
        e,
        derived: deriveTaskStatus({
          status: e.status,
          scheduledAt: e.scheduledAt,
          executedAt: e.executedAt,
          now,
        }),
      })),
    [details.data, now],
  );

  const shiftOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const { e } of enriched) if (e.shiftId && e.shiftName) map.set(e.shiftId, e.shiftName);
    return Array.from(map, ([id, name]) => ({ id, name }));
  }, [enriched]);

  const filtered = useMemo(() => {
    return enriched.filter(({ e, derived }) => {
      if (!showCancelled && derived === "cancelada") return false;
      if (shift !== "all" && e.shiftId !== shift) return false;
      if (weight !== "all" && e.weight !== weight) return false;
      if (withEvidence && e.evidenceCount === 0) return false;
      if (statusFilter !== "all" && derived !== (statusFilter as OperationalTaskStatus)) return false;
      return true;
    });
  }, [enriched, shift, weight, withEvidence, statusFilter, showCancelled]);

  const overdueOpen = filtered.filter((x) => x.derived === "atrasada");
  const completedLate = filtered.filter((x) => x.derived === "concluida_com_atraso");
  const criticalFailures = filtered.filter((x) => isCriticalFailure(x.e.weight, x.derived));
  const withEvidences = filtered.filter((x) => x.e.evidenceCount > 0);
  const pendingEv = filtered.filter((x) => x.e.pendingEvidences > 0);

  return (
    <>
      {/* Cabeçalho de status */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
        <StatusCard label="Status" value={meta.label} dot={meta.dot} />
        <MetricCard label="Operação agora" value={dueCompliance === null ? "—" : `${dueCompliance.toFixed(1)}%`} icon={<Hourglass className="w-4 h-4" />} />
        <MetricCard label="Planejamento" value={plannedCompliance === null ? "—" : `${plannedCompliance.toFixed(1)}%`} icon={<ListChecks className="w-4 h-4" />} />
        <MetricCard label="Programadas" value={row?.totalScheduledTasks ?? 0} icon={<ListChecks className="w-4 h-4" />} />
        <MetricCard label="Vencidas" value={row?.totalDueTasks ?? 0} icon={<Clock className="w-4 h-4" />} />
        <MetricCard label="Concluídas" value={row?.completedTasks ?? 0} hint={`${row?.completedOnTime ?? 0} no prazo · ${row?.completedLate ?? 0} atraso`} icon={<CheckCircle2 className="w-4 h-4" />} />
        <MetricCard label="Abertas em atraso" value={row?.overdueOpenTasks ?? 0} icon={<Clock className="w-4 h-4" />} />
        <MetricCard label="Falhas críticas" value={row?.criticalFailures ?? 0} icon={<AlertOctagon className="w-4 h-4" />} />
        <MetricCard label="Evidências pendentes" value={row?.pendingEvidences ?? 0} icon={<Camera className="w-4 h-4" />} />
      </div>

      {/* Filtros locais */}
      <Card>
        <div className="flex flex-wrap gap-3 items-end">
          <LocalSelect
            label="Turno"
            value={shift}
            onChange={setShift}
            options={[{ id: "all", name: "Todos" }, ...shiftOptions]}
          />
          <LocalSelect
            label="Status"
            value={statusFilter}
            onChange={setStatusFilter}
            options={[
              { id: "all", name: "Todos" },
              { id: "programada", name: "Programada" },
              { id: "atrasada", name: "Atrasada" },
              { id: "concluida_no_prazo", name: "Concluída no prazo" },
              { id: "concluida_com_atraso", name: "Concluída com atraso" },
            ]}
          />
          <LocalSelect
            label="Criticidade"
            value={weight}
            onChange={setWeight}
            options={[
              { id: "all", name: "Todas" },
              { id: "comum", name: "Comum" },
              { id: "importante", name: "Importante" },
              { id: "critica", name: "Crítica" },
            ]}
          />
          <label className="flex items-center gap-2 text-sm text-neutral-700">
            <Checkbox checked={withEvidence} onCheckedChange={(v) => setWithEvidence(!!v)} />
            Com evidência
          </label>
          <label className="flex items-center gap-2 text-sm text-neutral-700">
            <Checkbox checked={showCancelled} onCheckedChange={(v) => setShowCancelled(!!v)} />
            Mostrar canceladas
          </label>
        </div>
      </Card>

      {details.error && (
        <Card>
          <p className="text-sm text-rose-600">Erro ao carregar detalhes: {details.error}</p>
        </Card>
      )}

      <Tabs defaultValue="overview" className="w-full">
        <TabsList className="w-full overflow-x-auto justify-start">
          <TabsTrigger value="overview">
            Visão geral <Badge variant="neutral" className="ml-2">{filtered.length}</Badge>
          </TabsTrigger>
          <TabsTrigger value="late">
            Atrasadas <Badge variant="warning" className="ml-2">{overdueOpen.length + completedLate.length}</Badge>
          </TabsTrigger>
          <TabsTrigger value="critical">
            Falhas críticas <Badge variant="error" className="ml-2">{criticalFailures.length}</Badge>
          </TabsTrigger>
          <TabsTrigger value="evidences">
            Evidências <Badge variant="neutral" className="ml-2">{withEvidences.length}</Badge>
          </TabsTrigger>
          <TabsTrigger value="all">Todas</TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <TimelineView items={filtered} onSelect={setSelected} now={now} loading={details.loading} />
        </TabsContent>

        <TabsContent value="late" className="space-y-4">
          <Section title="Abertas em atraso" items={overdueOpen} onSelect={setSelected} emptyMsg="Nenhuma tarefa aberta em atraso." />
          <Section title="Concluídas com atraso" items={completedLate} onSelect={setSelected} emptyMsg="Nenhuma tarefa concluída com atraso." />
        </TabsContent>

        <TabsContent value="critical">
          <Section
            title="Falhas críticas vencidas"
            items={criticalFailures}
            onSelect={setSelected}
            emptyMsg="Nenhuma falha crítica no período."
          />
        </TabsContent>

        <TabsContent value="evidences" className="space-y-4">
          <Section
            title="Evidências pendentes de análise"
            items={pendingEv}
            onSelect={setSelected}
            emptyMsg="Nenhuma evidência aguardando análise."
          />
          <Section
            title="Tarefas com evidências"
            items={withEvidences}
            onSelect={setSelected}
            emptyMsg="Nenhuma evidência enviada no período."
          />
        </TabsContent>

        <TabsContent value="all">
          <Section title="Todas as tarefas" items={filtered} onSelect={setSelected} emptyMsg="Nenhuma tarefa no período com os filtros atuais." />
        </TabsContent>
      </Tabs>

      <TaskExecutionDetailDrawer execution={selected} onClose={() => setSelected(null)} />
    </>
  );
}

function Section({
  title,
  items,
  onSelect,
  emptyMsg,
}: {
  title: string;
  items: { e: OperationalExecution; derived: OperationalTaskStatus }[];
  onSelect: (e: OperationalExecution) => void;
  emptyMsg: string;
}) {
  return (
    <Card>
      <h3 className="text-sm font-semibold text-neutral-700 mb-3">{title}</h3>
      {items.length === 0 ? (
        <p className="text-xs text-neutral-500">{emptyMsg}</p>
      ) : (
        <ul className="space-y-2">
          {items.map(({ e }) => (
            <li key={e.executionId}>
              <OperationalTaskItem execution={e} onClick={onSelect} />
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function TimelineView({
  items,
  onSelect,
  now,
  loading,
}: {
  items: { e: OperationalExecution; derived: OperationalTaskStatus }[];
  onSelect: (e: OperationalExecution) => void;
  now: Date;
  loading: boolean;
}) {
  void now;
  const groups = useMemo(() => {
    const byDay = new Map<string, Map<string, OperationalExecution[]>>();
    for (const { e } of items) {
      const day = e.scheduledAt.slice(0, 10);
      const shift = e.shiftName ?? "Sem turno";
      const dayMap = byDay.get(day) ?? new Map();
      const arr = dayMap.get(shift) ?? [];
      arr.push(e);
      dayMap.set(shift, arr);
      byDay.set(day, dayMap);
    }
    return Array.from(byDay.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [items]);

  if (loading && items.length === 0) {
    return (
      <Card>
        <p className="text-sm text-neutral-500 py-6 text-center">Carregando…</p>
      </Card>
    );
  }
  if (groups.length === 0) {
    return (
      <Card>
        <p className="text-sm text-neutral-500 py-6 text-center">
          Nenhuma tarefa no período com os filtros atuais.
        </p>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {groups.map(([day, shiftsMap]) => (
        <Card key={day}>
          <h3 className="text-sm font-semibold text-neutral-800 mb-3">
            {new Date(`${day}T12:00:00`).toLocaleDateString("pt-BR", {
              weekday: "short",
              day: "2-digit",
              month: "short",
            })}
          </h3>
          <div className="space-y-4">
            {Array.from(shiftsMap.entries()).map(([shiftName, evs]) => (
              <div key={shiftName}>
                <p className="text-xs font-medium uppercase text-neutral-500 mb-2">{shiftName}</p>
                <ul className="space-y-2">
                  {evs.map((e) => (
                    <li key={e.executionId}>
                      <OperationalTaskItem execution={e} onClick={onSelect} />
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </Card>
      ))}
    </div>
  );
}

function MetricCard({
  label,
  value,
  icon,
  hint,
}: {
  label: string;
  value: number | string;
  icon?: React.ReactNode;
  hint?: string;
}) {
  return (
    <div className="bg-white border border-neutral-200/70 rounded-xl p-3 shadow-sm">
      <div className="flex items-center justify-between text-xs text-neutral-500">
        <span>{label}</span>
        {icon && <span className="text-neutral-400">{icon}</span>}
      </div>
      <div className="mt-1 text-xl font-bold text-neutral-900">{value}</div>
      {hint && <p className="text-[11px] text-neutral-400 mt-1 leading-snug">{hint}</p>}
    </div>
  );
}

function StatusCard({ label, value, dot }: { label: string; value: string; dot: string }) {
  return (
    <div className="bg-white border border-neutral-200/70 rounded-xl p-3 shadow-sm">
      <p className="text-xs text-neutral-500">{label}</p>
      <p className="mt-1 text-sm font-semibold text-neutral-900 inline-flex items-center gap-2">
        <span className={`w-2 h-2 rounded-full ${dot}`} aria-hidden />
        {value}
      </p>
    </div>
  );
}

function LocalSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { id: string; name: string }[];
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-medium text-neutral-600">{label}</label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="w-[160px]">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o.id} value={o.id}>
              {o.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}