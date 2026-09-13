import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useSidebar } from "@/contexts/SidebarContext";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card } from "@/components/tremor/ui/Card";
import { Badge } from "@/components/tremor/ui/Badge";
import { Skeleton } from "@/components/ui/skeleton";
import { TabNavigation, TabNavigationLink } from "@/components/tremor/ui/TabNavigation";
import { Button } from "@/components/ui/button";
import { useInsights, type Insight, type InsightCategory, type InsightSeverity } from "@/lib/useInsights";
import {
  Lightbulb,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  AlertOctagon,
  Camera,
  Clock,
  Repeat,
  CalendarClock,
} from "lucide-react";
import logoUrl from "../assets/local/logo-tieck.webp";

export const Route = createFileRoute("/insights")({
  head: () => ({
    meta: [{ title: "Insights — Tieck" }],
  }),
  component: InsightsPage,
});

type Category = "todos" | InsightCategory;

const CATEGORIES: { k: Category; label: string }[] = [
  { k: "todos", label: "Todos" },
  { k: "critico", label: "Críticos" },
  { k: "recorrencia", label: "Reincidência" },
  { k: "turno", label: "Turnos" },
  { k: "tendencia", label: "Tendências" },
  { k: "evidencia", label: "Evidências" },
  { k: "horario", label: "Horários" },
];

const SEVERITY: Record<InsightSeverity, { badge: "success" | "warning" | "error" | "neutral"; label: string; ring: string }> = {
  positivo: { badge: "success", label: "Melhoria", ring: "border-l-emerald-500" },
  atencao: { badge: "warning", label: "Atenção", ring: "border-l-amber-500" },
  critico: { badge: "error", label: "Crítico", ring: "border-l-rose-500" },
  info: { badge: "neutral", label: "Padrão", ring: "border-l-cyan-500" },
};

const CATEGORY_ICON: Record<InsightCategory, React.ReactNode> = {
  recorrencia: <Repeat className="w-4 h-4" />,
  turno: <Clock className="w-4 h-4" />,
  tendencia: <TrendingUp className="w-4 h-4" />,
  evidencia: <Camera className="w-4 h-4" />,
  horario: <CalendarClock className="w-4 h-4" />,
  critico: <AlertOctagon className="w-4 h-4" />,
};

function InsightsPage() {
  const { user, loading: authLoading } = useAuth();
  const { sidebarOpen } = useSidebar();
  const navigate = useNavigate();
  const [cat, setCat] = useState<Category>("todos");
  const { insights, loading, error, refresh } = useInsights();

  useEffect(() => {
    if (!authLoading && !user) navigate({ to: "/login" });
  }, [authLoading, user, navigate]);



  const filtered = useMemo(
    () => (cat === "todos" ? insights : insights.filter((i) => i.category === cat)),
    [cat, insights],
  );

  const counts = useMemo(
    () => ({
      total: insights.length,
      criticos: insights.filter((i) => i.severity === "critico").length,
      atencao: insights.filter((i) => i.severity === "atencao").length,
      melhorias: insights.filter((i) => i.severity === "positivo").length,
    }),
    [insights],
  );

  // Carregando: nunca mostra estado vazio nem erro prematuramente.
  if (loading) {
    return (
      <DashboardLayout>
        <main className="flex-1 px-6 py-6 overflow-y-auto bg-neutral-50/50">
          <div className="max-w-7xl mx-auto space-y-6">
            <Skeleton className="h-9 w-64" />
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[1, 2, 3, 4].map((i) => (
                <Skeleton key={i} className="h-24 w-full rounded-xl" />
              ))}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {[1, 2, 3, 4].map((i) => (
                <Skeleton key={i} className="h-40 w-full rounded-xl" />
              ))}
            </div>
          </div>
        </main>
      </DashboardLayout>
    );
  }
  return (
    <DashboardLayout>
      <header className="flex items-center justify-between px-6 py-4">
        <div className={`flex items-center gap-2 transition-all duration-300 ${sidebarOpen ? "pl-0" : "pl-14"}`}>
          <img src={logoUrl} alt="Logo" className="w-10 h-10 object-contain" />
          <span className="text-neutral-400">›</span>
          <span className="text-neutral-600 font-medium">Insights</span>
        </div>
      </header>

      <main className="flex-1 px-6 py-6 overflow-y-auto bg-neutral-50/50">
        <div className="max-w-7xl mx-auto space-y-6">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-neutral-900 flex items-center gap-2">
              <Lightbulb className="w-7 h-7 text-[#FF007F]" /> Insights operacionais
            </h1>
            <p className="text-sm text-neutral-500 mt-1">
              Padrões detectados por regras determinísticas — sem IA, 100% auditável.
            </p>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <MiniStat label="Insights" value={counts.total} tone="neutral" icon={<Lightbulb className="w-4 h-4" />} />
            <MiniStat label="Críticos" value={counts.criticos} tone="rose" icon={<AlertOctagon className="w-4 h-4" />} />
            <MiniStat label="Atenção" value={counts.atencao} tone="amber" icon={<AlertTriangle className="w-4 h-4" />} />
            <MiniStat label="Melhorias" value={counts.melhorias} tone="emerald" icon={<TrendingUp className="w-4 h-4" />} />
          </div>

          <TabNavigation>
            {CATEGORIES.map((opt) => (
              <TabNavigationLink
                key={opt.k}
                href="#"
                active={cat === opt.k}
                onClick={(e) => {
                  e.preventDefault();
                  setCat(opt.k);
                }}
              >
                {opt.label}
              </TabNavigationLink>
            ))}
          </TabNavigation>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {error ? (
              <Card className="col-span-full">
                <div className="flex flex-col items-center gap-3 py-8 text-center">
                  <AlertTriangle className="w-6 h-6 text-amber-500" />
                  <p className="text-sm font-medium text-neutral-900">
                    Não foi possível carregar os insights. Tente novamente.
                  </p>
                  <Button variant="outline" size="sm" onClick={() => void refresh()}>
                    Tentar novamente
                  </Button>
                </div>
              </Card>
            ) : (
              <>
                {filtered.map((ins) => {
                  const meta = SEVERITY[ins.severity];
                  return (
                    <Card key={ins.id} className={`border-l-4 ${meta.ring}`}>
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-2 text-neutral-500 text-xs">
                          <span className="w-7 h-7 rounded-lg bg-neutral-100 flex items-center justify-center text-neutral-600">
                            {CATEGORY_ICON[ins.category]}
                          </span>
                          <span className="uppercase tracking-wide font-medium">{ins.category}</span>
                        </div>
                        <Badge variant={meta.badge}>{meta.label}</Badge>
                      </div>
                      <h3 className="mt-3 text-base font-semibold text-neutral-900">{ins.title}</h3>
                      <p className="mt-1 text-sm text-neutral-600">{ins.detail}</p>
                      <div className="mt-4 flex items-center justify-between text-xs">
                        {ins.metric && (
                          <span className="inline-flex items-center gap-1 font-semibold text-neutral-900">
                            {ins.severity === "positivo" ? (
                              <TrendingUp className="w-3.5 h-3.5 text-emerald-500" />
                            ) : ins.severity === "critico" ? (
                              <TrendingDown className="w-3.5 h-3.5 text-rose-500" />
                            ) : null}
                            {ins.metric}
                          </span>
                        )}
                        <code className="text-[11px] text-neutral-400 font-mono">{ins.source}</code>
                      </div>
                    </Card>
                  );
                })}
                {filtered.length === 0 && (
                  <div className="col-span-full">
                    <Card>
                      {cat === "todos" ? (
                        <div className="py-10 text-center">
                          <Lightbulb className="w-6 h-6 text-neutral-300 mx-auto" />
                          <p className="mt-3 text-sm font-semibold text-neutral-700">
                            Nenhum insight no momento
                          </p>
                          <p className="mt-1 text-xs text-neutral-500">
                            Nenhum padrão operacional foi detectado no momento. Assim que os dados
                            de execução revelarem padrões, os insights aparecerão aqui.
                          </p>
                        </div>
                      ) : (
                        <div className="py-10 text-center">
                          <p className="text-sm text-neutral-500">Nenhum insight nessa categoria.</p>
                        </div>
                      )}
                    </Card>
                  </div>
                )}
              </>
            )}
          </div>

          <Card className="bg-neutral-50 border-dashed">
            <p className="text-sm font-medium text-neutral-900">Como esses insights são gerados</p>
            <p className="text-xs text-neutral-500 mt-1">
              Cada card é produzido por regras determinísticas sobre dados reais de execução
              (views <code>analytics_overdue_tasks</code>, <code>analytics_critical_failures</code>,{" "}
              <code>analytics_unit_ranking</code> e contagens de <code>evidences</code>). Nada aqui
              depende de IA nem de dados fictícios — quando não há padrão detectado, esta tela
              permanece vazia.
            </p>
          </Card>
        </div>
      </main>
    </DashboardLayout>
  );
}

function MiniStat({
  label,
  value,
  tone,
  icon,
}: {
  label: string;
  value: number;
  tone: "neutral" | "rose" | "amber" | "emerald";
  icon: React.ReactNode;
}) {
  const styles: Record<typeof tone, string> = {
    neutral: "bg-neutral-100 text-neutral-700",
    rose: "bg-rose-50 text-rose-600",
    amber: "bg-amber-50 text-amber-600",
    emerald: "bg-emerald-50 text-emerald-600",
  };
  return (
    <div className="bg-white border border-neutral-200/70 rounded-xl p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-neutral-500">{label}</span>
        <span className={`w-7 h-7 rounded-lg flex items-center justify-center ${styles[tone]}`}>{icon}</span>
      </div>
      <div className="mt-2 text-2xl font-bold text-neutral-900">{value}</div>
    </div>
  );
}