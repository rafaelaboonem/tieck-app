import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, Sparkles } from "lucide-react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Label } from "@/components/ui/label";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { StandardsTab } from "@/components/padrao/StandardsTab";
import { LabTab } from "@/components/padrao/LabTab";
import { PerformanceTab } from "@/components/padrao/PerformanceTab";
import { listChecklistProjects, type ChecklistProject } from "@/lib/camera-blocks";
import { listStandards, type LabRun, type VisualStandard } from "@/lib/visual-standards";

export const Route = createFileRoute("/padrao/")({
  validateSearch: (search: Record<string, unknown>) => ({
    checklist: typeof search["checklist"] === "string" ? (search["checklist"] as string) : undefined,
    block: typeof search["block"] === "string" ? (search["block"] as string) : undefined,
  }),
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
  const search = Route.useSearch();
  const navigate = useNavigate();

  const { currentWorkspace, isLoading: wsLoading } = useWorkspace();
  const [authChecked, setAuthChecked] = useState(false);
  const [tab, setTab] = useState<TabKey>("padroes");
  const [standards, setStandards] = useState<VisualStandard[]>([]);
  const [projects, setProjects] = useState<ChecklistProject[]>([]);
  const [projectsLoading, setProjectsLoading] = useState(true);
  const [loading, setLoading] = useState(true);
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
    setProjectsLoading(true);
    try {
      const [std, prj] = await Promise.all([
        listStandards(currentWorkspace.id),
        listChecklistProjects(currentWorkspace.id),
      ]);
      setStandards(std);
      setProjects(prj);
    } catch (e) {
      toast.error(`Erro ao carregar padrões: ${(e as Error).message}`);
    } finally {
      setLoading(false);
      setProjectsLoading(false);
    }
  }, [currentWorkspace]);

  useEffect(() => {
    if (authChecked && currentWorkspace) void load();
  }, [authChecked, currentWorkspace, load]);

  // Contexto global: projeto + pergunta vivem na URL (?checklist=&block=).
  const projectId = search.checklist ?? "";
  const blockId = search.block ?? "";

  const setContext = (next: { checklist?: string; block?: string }) =>
    navigate({ to: "/padrao", search: next, replace: true });

  const project = useMemo(
    () => projects.find((p) => p.id === projectId) ?? null,
    [projects, projectId],
  );
  const question = useMemo(
    () => project?.cameraBlocks.find((b) => b.cameraBlockId === blockId) ?? null,
    [project, blockId],
  );
  const standard = useMemo(
    () => standards.find((s) => !s.archived_at && s.camera_block_id === blockId) ?? null,
    [standards, blockId],
  );

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

        {currentWorkspace && (
          <div className="mb-6 grid gap-4 rounded-xl border bg-background p-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="cv-project">Selecione o projeto</Label>
              <select
                id="cv-project"
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={projectId}
                disabled={projectsLoading}
                onChange={(e) => setContext({ checklist: e.target.value || undefined })}
              >
                <option value="">{projectsLoading ? "Carregando…" : "Selecione o projeto"}</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>{p.title}</option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="cv-question">Selecione a pergunta</Label>
              <select
                id="cv-question"
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={blockId}
                disabled={!project}
                onChange={(e) =>
                  setContext({ checklist: projectId || undefined, block: e.target.value || undefined })
                }
              >
                <option value="">Selecione a pergunta</option>
                {(project?.cameraBlocks ?? []).map((b) => (
                  <option key={b.cameraBlockId} value={b.cameraBlockId}>{b.question}</option>
                ))}
              </select>
              {project && project.cameraBlocks.length === 0 && (
                <p className="text-xs text-muted-foreground">
                  Este projeto ainda não possui perguntas com câmera.
                </p>
              )}
            </div>
          </div>
        )}

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
            project={project}
            question={question}
            standard={standard}
            standards={standards}
            loading={loading || projectsLoading}
            onChanged={() => void load()}
            onTest={() => setTab("laboratorio")}
          />
        ) : tab === "laboratorio" ? (
          <LabTab
            workspaceId={currentWorkspace.id}
            selected={standard}
            runs={runs}
            onRun={(run) => setRuns((prev) => [run, ...prev])}
          />
        ) : (
          <PerformanceTab runs={runs} cameraBlockId={blockId || null} />
        )}
      </div>
    </DashboardLayout>
  );
}
