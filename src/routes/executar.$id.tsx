import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { t } from "@/lib/checklist-i18n";
import { ExecutionEngine } from "@/components/ExecutionEngine";
import { DashboardLayout } from "@/components/DashboardLayout";
import { useWorkspaceRBAC } from "@/hooks/useWorkspaceRBAC";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { toast } from "sonner";
import { Loader2, Ban, AlertCircle, CalendarDays, CheckCircle2, RefreshCw } from "lucide-react";
import { getAssignmentStatus, getStatusBadge } from "@/utils/assignment-status";
import { getAssignmentsForWorkspaceMember } from "@/lib/execution-assignment";
import {
  openChecklistExecutionOccurrence,
  completeChecklistExecutionOccurrence,
  isOccurrenceDenial,
  isUuid,
  getOccurrenceBridgeErrorMessage,
  OCCURRENCE_BRIDGE_MESSAGES,
  type OccurrenceExecutionContext,
} from "@/lib/execution-occurrence";
import { cn } from "@/lib/utils";

/**
 * 6B.2B — `/executar/$id?occurrenceId=<uuid>` optionally binds the execution to a
 * schedule occurrence materialized by 5E. Any other value (missing, malformed,
 * injected) is treated as absent, so the legacy link keeps working unchanged.
 */
type ExecutarSearch = { occurrenceId?: string };

/**
 * Gate for the optional occurrence context. Unknown/denied never renders the
 * engine, so an occurrence of another checklist, workspace or responsible
 * member can never be executed — and its existence is never revealed.
 */
type OccurrenceGate = "none" | "validating" | "ok" | "denied" | "failed" | "completed";

export const Route = createFileRoute("/executar/$id")({
  validateSearch: (raw: Record<string, unknown>): ExecutarSearch => ({
    occurrenceId: isUuid(raw.occurrenceId) ? raw.occurrenceId : undefined,
  }),
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

  // 6B.2B — optional occurrence binding.
  const { occurrenceId } = Route.useSearch() as ExecutarSearch;
  const [occurrenceGate, setOccurrenceGate] = useState<OccurrenceGate>("none");
  const [occurrenceContext, setOccurrenceContext] = useState<OccurrenceExecutionContext | null>(null);
  const [occurrenceRetryNonce, setOccurrenceRetryNonce] = useState(0);
  const occurrenceSeqRef = useRef(0);
  const occurrenceGateScopeRef = useRef<string | null>(null);

  // Scope of the occurrence request for THIS render. The published gate only
  // counts while its own scope is still the current one, so a response from a
  // previous occurrence/checklist/user can never authorize this render.
  const occurrenceRequestScope =
    user?.id && checklist?.id && occurrenceId
      ? `${user.id}|${checklist.id}|${occurrenceId}|${occurrenceRetryNonce}`
      : null;
  const occurrenceGateIsCurrent =
    occurrenceGateScopeRef.current === occurrenceRequestScope;
  const effectiveOccurrenceGate: OccurrenceGate = !occurrenceId
    ? "none"
    : occurrenceGateIsCurrent
      ? occurrenceGate
      : "validating";

  // RBAC check. 5E.1: `workspaceMemberId` é a identidade correta para casar
  // com checklist_assignments.workspace_member_id (workspace_members.id),
  // NUNCA user.id (auth.users.id).
  const { role, workspaceMemberId, loading: rbacLoading } = useWorkspaceRBAC(checklist?.workspace_id);

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
    if (!occurrenceRequestScope || !occurrenceId || !checklist?.id) return;

    const requestScope = occurrenceRequestScope;
    const seq = ++occurrenceSeqRef.current;
    let cancelled = false;

    (async () => {
      const result = await openChecklistExecutionOccurrence(occurrenceId, checklist.id);
      if (
        cancelled ||
        seq !== occurrenceSeqRef.current ||
        occurrenceGateScopeRef.current === requestScope
      ) {
        return;
      }

      occurrenceGateScopeRef.current = requestScope;

      if (!result.ok) {
        setOccurrenceContext(null);
        setOccurrenceGate(isOccurrenceDenial(result.reason) ? "denied" : "failed");
        return;
      }

      setOccurrenceContext(result.context);
      setOccurrenceGate(result.context.completedAt ? "completed" : "ok");
    })();

    return () => {
      cancelled = true;
    };
  }, [occurrenceRequestScope, occurrenceId, checklist?.id]);

  /**
   * 6B.2B — runs only after `finalize_public_response` succeeded. Fail-closed:
   * without a response id the binding is not silently skipped.
   */
  const handleOccurrenceComplete = useCallback(
    async (responseId: string | null): Promise<boolean> => {
      if (!occurrenceId || !checklist?.id || !responseId) return false;
      const result = await completeChecklistExecutionOccurrence(
        occurrenceId,
        checklist.id,
        responseId
      );
      return result.ok;
    },
    [occurrenceId, checklist?.id]
  );

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

  // 6B.2B — the occurrence context is still being resolved. Never render the
  // engine (and never an empty/error state) before the binding is settled.
  if (effectiveOccurrenceGate === "validating") {
    return (
      <DashboardLayout>
        <div className="flex h-screen items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-[#FF007F]" />
        </div>
      </DashboardLayout>
    );
  }

  // Denied and not-found are deliberately indistinguishable here, so an
  // occurrence from another workspace/checklist/member never leaks existence.
  if (effectiveOccurrenceGate === "denied") {
    return (
      <DashboardLayout>
        <div className="flex flex-col items-center justify-center h-[calc(100vh-200px)] text-center px-6">
          <Ban className="h-12 w-12 text-red-500 mb-4" />
          <h1 className="text-2xl font-bold mb-2">Acesso Negado</h1>
          <p className="text-neutral-500 max-w-md">{OCCURRENCE_BRIDGE_MESSAGES.bridgeDenied}</p>
          <Link to="/inicio" className="mt-6 text-[#FF007F] font-semibold hover:underline">Voltar ao início</Link>
        </div>
      </DashboardLayout>
    );
  }

  // Technical failure (network/backend). Sanitized message, retry available —
  // the submission is never assumed to have happened.
  if (effectiveOccurrenceGate === "failed") {
    return (
      <DashboardLayout>
        <div className="flex flex-col items-center justify-center h-[calc(100vh-200px)] text-center px-6">
          <AlertCircle className="h-12 w-12 text-amber-500 mb-4" />
          <h1 className="text-2xl font-bold mb-2">Não foi possível abrir esta execução</h1>
          <p className="text-neutral-500 max-w-md">{getOccurrenceBridgeErrorMessage("unavailable")}</p>
          <button
            type="button"
            onClick={() => setOccurrenceRetryNonce((n) => n + 1)}
            className="mt-6 inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-[#FF007F] text-white font-semibold hover:opacity-90 transition-opacity"
          >
            <RefreshCw className="w-4 h-4" aria-hidden />
            {OCCURRENCE_BRIDGE_MESSAGES.bridgeRetry}
          </button>
        </div>
      </DashboardLayout>
    );
  }

  // Already completed: honest state, and the engine is NOT mounted, so no new
  // response can be created for an already fulfilled obligation.
  if (effectiveOccurrenceGate === "completed") {
    return (
      <DashboardLayout>
        <div className="flex flex-col items-center justify-center h-[calc(100vh-200px)] text-center px-6">
          <CheckCircle2 className="h-12 w-12 text-emerald-500 mb-4" />
          <h1 className="text-2xl font-bold mb-2">{OCCURRENCE_BRIDGE_MESSAGES.bridgeCompleted}</h1>
          <p className="text-neutral-500 max-w-md">
            Esta rotina agendada já possui uma execução registrada
            {occurrenceContext?.occurrenceDate ? ` em ${occurrenceContext.occurrenceDate}` : ""}.
          </p>
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
        <header className="px-6 py-6 border-b border-neutral-100 bg-white">
          <div className="max-w-4xl mx-auto flex items-center justify-between">
            <Link to="/inicio" className="text-sm text-neutral-400 hover:text-neutral-600 transition-colors inline-block">
              ← Voltar
            </Link>
            
            {getAssignmentsForWorkspaceMember(checklist.checklist_assignments, workspaceMemberId).map((a: any) => {
              const status = getAssignmentStatus(a.due_at, a.completed_at);
              const badge = getStatusBadge(status);
              if (!badge) return null;
              return (
                <div key={a.id} className="flex items-center gap-2">
                  <span className={cn(
                    "px-3 py-1 rounded-full text-[10px] font-bold border flex items-center gap-1.5",
                    badge.className
                  )}>
                    <CalendarDays className="w-3.5 h-3.5" />
                    {badge.label}
                    {a.due_at && (
                      <span className="opacity-70 ml-0.5 font-medium">
                        • Prazo: {new Date(a.due_at).toLocaleString("pt-BR", { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                      </span>
                    )}
                  </span>
                </div>
              );
            })}
          </div>
        </header>
        <main className="flex-1 pb-32">
          <ExecutionEngine 
            checklist={checklist} 
            mode="authenticated"
            onSubmitted={() => setSubmitted(true)}
            analyticsId={analyticsId}
            occurrenceId={occurrenceId}
            onOccurrenceComplete={occurrenceId ? handleOccurrenceComplete : undefined}
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
