import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { listChecklistProjects, type ChecklistProject } from "@/lib/camera-blocks";
import { fetchStandards as listStandards, createStandard, type VisualStandard } from "@/lib/visual-standards";
import { StandardWorkspace } from "@/components/padrao/new-ui/StandardWorkspace";

export const Route = createFileRoute("/padrao/")({
  validateSearch: (search: Record<string, unknown>): { checklist?: string; block?: string } => ({
    checklist: typeof search["checklist"] === "string" ? (search["checklist"] as string) : undefined,
    block: typeof search["block"] === "string" ? (search["block"] as string) : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Padrões de foto · Tieck" },
      { name: "description", content: "Configure referências visuais para checklists." },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: PadraoPage,
});

function PadraoPage() {
  const search = Route.useSearch();
  const navigate = useNavigate();
  const { currentWorkspace, isLoading: wsLoading } = useWorkspace();

  const [authChecked, setAuthChecked] = useState(false);
  const [standards, setStandards] = useState<VisualStandard[]>([]);
  const [projects, setProjects] = useState<ChecklistProject[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!currentWorkspace) return;
    setLoading(true);
    try {
      const [std, prj] = await Promise.all([
        listStandards(currentWorkspace.id),
        listChecklistProjects(currentWorkspace.id),
      ]);
      setStandards(std);
      setProjects(prj);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setLoading(false);
    }
  }, [currentWorkspace]);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (!data?.user) navigate({ to: "/login" });
      else setAuthChecked(true);
    });
  }, [navigate]);

  useEffect(() => {
    if (authChecked && currentWorkspace) void load();
  }, [authChecked, currentWorkspace, load]);

  const projectId = search.checklist || "";
  const blockId = search.block || "";

  const project = useMemo(() => projects.find(p => p.id === projectId) || null, [projects, projectId]);
  const question = useMemo(() => project?.cameraBlocks.find(b => b.cameraBlockId === blockId) || null, [project, blockId]);
  const standard = useMemo(() => standards.find(s => !s.archived_at && s.camera_block_id === blockId) || null, [standards, blockId]);

  // Auto-create standard if it doesn't exist for the selected question
  useEffect(() => {
    if (authChecked && currentWorkspace && question && !standard && !loading) {
      (async () => {
        try {
          await createStandard({
            workspaceId: currentWorkspace.id,
            checklistId: project?.id,
            cameraBlockId: question.cameraBlockId,
            question: question.question,
          });
          void load();
        } catch (e: any) {
          console.error("Failed to auto-create standard", e);
        }
      })();
    }
  }, [authChecked, currentWorkspace, question, standard, loading, project?.id, load]);

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
      <StandardWorkspace
        workspaceId={currentWorkspace?.id || ""}
        project={project}
        question={question}
        standard={standard}
        loading={loading}
        onChanged={() => void load()}
        projects={projects}
        onProjectChange={(id) => navigate({ to: "/padrao", search: { checklist: id || undefined }, replace: true })}
        onQuestionChange={(bid) => navigate({ to: "/padrao", search: { checklist: projectId || undefined, block: bid || undefined }, replace: true })}
      />
    </DashboardLayout>
  );
}
