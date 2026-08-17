import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { t } from "@/lib/checklist-i18n";
import { ExecutionEngine } from "@/components/ExecutionEngine";
import { DashboardLayout } from "@/components/DashboardLayout";
import { useWorkspaceRBAC } from "@/hooks/useWorkspaceRBAC";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { toast } from "sonner";
import { Loader2, Ban, AlertCircle, CalendarDays, CheckCircle2 } from "lucide-react";
import { getAssignmentStatus, getStatusBadge } from "@/utils/assignment-status";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/executar/$id")({
  component: AuthenticatedExecutionPage,
});

function AuthenticatedExecutionPage() {
  const { id } = Route.useParams();
  const { user, loading: authLoading } = useAuth();
  const { workspaces, currentWorkspace, workspaceStatus } = useWorkspace();
  const [checklist, setChecklist] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [submitted, setSubmitted] = useState(false);
  const [analyticsId, setAnalyticsId] = useState<string | null>(null);
  const navigate = useNavigate();

  // RBAC check
  const { role, loading: rbacLoading } = useWorkspaceRBAC(checklist?.workspace_id);

  useEffect(() => {
    if (!authLoading && !user) {
      navigate({ to: "/login", search: { redirect: window.location.pathname } as any });
      return;
    }

    const fetchChecklist = async () => {
      // Não re-inicializamos o loading se já temos o checklist para evitar flash
      if (!checklist) {
        setLoading(true);
      }
      
      const { data, error } = await supabase
        .from("checklists")
        .select("*, checklist_assignments(*)")
        .eq("id", id)
        .maybeSingle();

      if (error || !data) {
        toast.error("Checklist não encontrado");
        setLoading(false);
        return;
      }

      // Conforme contrato, Viewer deve ver APENAS a versão publicada
      const published_content = data.published_content as any;
      const publishedChecklist = {
        ...data,
        blocks: published_content?.blocks || [],
        is_published: true
      };

      setChecklist(publishedChecklist);
      setLoading(false);
    };

    if (user?.id) {
      fetchChecklist();
    }
  }, [id, user?.id, authLoading]);

  useEffect(() => {
    if (checklist && !rbacLoading && !role) {
      // If the checklist is found but the user has no role in the workspace (and isn't the owner)
      // Note: useWorkspaceRBAC handles owner bypass if the workspace belongs to them.
      // However, if checklist.workspace_id is null, it's a personal checklist.
      if (checklist.workspace_id) {
          // If it has a workspace, but useWorkspaceRBAC says no role
          // check if they are the owner of the workspace manually if useWorkspaceRBAC failed
      } else {
          // Personal checklist: only owner can execute
          if (checklist.user_id !== user?.id) {
              setChecklist(null); // Force access denied
          }
      }
    }
  }, [checklist, role, rbacLoading, user]);

  if (authLoading || loading || rbacLoading) {
    return (
      <DashboardLayout>
        <div className="flex h-screen items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-[#FF007F]" />
        </div>
      </DashboardLayout>
    );
  }

  if (!checklist || (!role && checklist.workspace_id) || (checklist.user_id !== user?.id && !checklist.workspace_id)) {
    return (
      <DashboardLayout>
        <div className="flex flex-col items-center justify-center h-[calc(100vh-200px)] text-center px-6">
          <Ban className="h-12 w-12 text-red-500 mb-4" />
          <h1 className="text-2xl font-bold mb-2">Acesso Negado</h1>
          <p className="text-neutral-500 max-w-md">Você não tem permissão para executar este checklist ou ele não existe.</p>
          <Link to="/inicio" className="mt-6 text-[#FF007F] font-semibold hover:underline">Voltar ao início</Link>
        </div>
      </DashboardLayout>
    );
  }

  if (submitted) {
    return (
      <DashboardLayout>
        <main className="max-w-4xl mx-auto px-6 pt-32 pb-32 flex flex-col items-center text-center">
          <div className="w-20 h-20 rounded-full bg-pink-100 flex items-center justify-center mb-8">
            <CheckSquare className="w-10 h-10 text-[#FF007F]" />
          </div>
          <h1 className="text-3xl sm:text-4xl font-bold mb-4 tracking-tight">
            {checklist.settings?.thankYouTitle || "Checklist enviado com sucesso!"}
          </h1>
          <p className="opacity-70 mb-8">
            {checklist.settings?.thankYouDescription || "Suas respostas foram registradas e estão seguras."}
          </p>
          <button
            onClick={() => navigate({ to: "/inicio" })}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg border border-neutral-200 bg-white text-pink-500 font-semibold hover:bg-neutral-50 transition-colors shadow-sm"
          >
            Voltar ao início
          </button>
        </main>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="flex flex-col w-full min-h-screen bg-neutral-50/30">
        <header className="px-6 py-8">
           <Link to="/inicio" className="text-sm text-neutral-400 hover:text-neutral-600 transition-colors mb-2 inline-block">
             ← Voltar
           </Link>
        </header>
        <main className="flex-1 pb-32">
          <ExecutionEngine 
            checklist={checklist} 
            mode="authenticated"
            onSubmitted={() => setSubmitted(true)}
            analyticsId={analyticsId}
          />
        </main>
      </div>
    </DashboardLayout>
  );
}

// Stub for CheckSquare to avoid import errors if not already in lucide-react (it is, but just in case)
function CheckSquare(props: any) {
  return (
    <svg 
      xmlns="http://www.w3.org/2000/svg" 
      width="24" height="24" 
      viewBox="0 0 24 24" 
      fill="none" 
      stroke="currentColor" 
      strokeWidth="2" 
      strokeLinecap="round" 
      strokeLinejoin="round" 
      {...props}
    >
      <polyline points="9 11 12 14 22 4" />
      <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
    </svg>
  );
}
