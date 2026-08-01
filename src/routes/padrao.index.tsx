import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, Sparkles } from "lucide-react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { StandardsTab } from "@/components/padrao/StandardsTab";
import { LabTab } from "@/components/padrao/LabTab";
import { PerformanceTab } from "@/components/padrao/PerformanceTab";
import { listStandards, type LabRun, type VisualStandard } from "@/lib/visual-standards";

export const Route = createFileRoute("/padrao/")({
  head: () => ({
    meta: [
      { title: "Central Visual · Tieck" },
      { name: "description", content: "Crie padrões visuais, teste a Camera AI e acompanhe o desempenho das análises." },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: CentralVisualPage,
});

type TabKey = "padroes" | "laboratorio" | "desempenho";

const TABS: [TabKey, string][] = [
  ["padroes", "Padrões visuais"],
  ["laboratorio", "Laboratório de testes"],
  ["desempenho", "Desempenho"],
];

function CentralVisualPage() {
  const navigate = useNavigate();
  const { currentWorkspace, isLoading: wsLoading } = useWorkspace();
  const [authChecked, setAuthChecked] = useState(false);
  const [tab, setTab] = useState<TabKey>("padroes");
  const [standards, setStandards] = useState<VisualStandard[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<VisualStandard | null>(null);
  const [runs, setRuns] = useState<LabRun[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (!data?.user) {
        if (!cancelled) navigate({ to: "/login" });
        return;
      }
      if (!cancelled) setAuthChecked(true);
    })();
    return () => { cancelled = true; };
  }, [navigate]);

  const load = useCallback(async () => {
    if (!currentWorkspace) return;
    setLoading(true);
    try {
      setStandards(await listStandards(currentWorkspace.id));
    } catch (e) {
      toast.error(`Erro ao carregar padrões: ${(e as Error).message}`);
    } finally {
      setLoading(false);
    }
  }, [currentWorkspace]);

  useEffect(() => {
    if (authChecked && currentWorkspace) void load();
  }, [authChecked, currentWorkspace, load]);

  if (!authChecked || wsLoading) {
    return (
      <DashboardLayout>
        <div className="flex min-h-[60vh] items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 lg:px-8">
        <header className="mb-6 flex items-start gap-3">
          <div className="rounded-2xl bg-[#FF007F]/10 p-3">
            <Sparkles className="h-6 w-6 text-[#FF007F]" />
          </div>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Central Visual</h1>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
              Ensine à IA o que é uma foto correta, teste antes de publicar e acompanhe o desempenho das análises.
            </p>
          </div>
        </header>

        <div className="mb-8 inline-flex rounded-full border bg-background p-1 shadow-sm">
          {TABS.map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              className={
                "rounded-full px-5 py-2 text-sm font-medium transition-colors " +
                (tab === key ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground")
              }
            >
              {label}
            </button>
          ))}
        </div>

        {!currentWorkspace ? (
          <p className="text-sm text-muted-foreground">Selecione um workspace para continuar.</p>
        ) : tab === "padroes" ? (
          <StandardsTab
            workspaceId={currentWorkspace.id}
            standards={standards}
            loading={loading}
            onCreated={() => void load()}
            onTest={(s) => { setSelected(s); setTab("laboratorio"); }}
          />
        ) : tab === "laboratorio" ? (
          <LabTab
            workspaceId={currentWorkspace.id}
            standards={standards}
            selected={selected}
            onSelect={setSelected}
            runs={runs}
            onRun={(run) => setRuns((prev) => [run, ...prev])}
            onUpdateRun={(id, patch) =>
              setRuns((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)))
            }
          />

        ) : (
          <PerformanceTab runs={runs} />
        )}
      </div>
    </DashboardLayout>
  );
}
