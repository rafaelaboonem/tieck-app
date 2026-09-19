import { createFileRoute } from "@tanstack/react-router";
import { Trash2, X } from "lucide-react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { useWorkspaceRBAC } from "@/hooks/useWorkspaceRBAC";
import { useSidebar } from "@/contexts/SidebarContext";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { useAuth } from "@/contexts/AuthContext";
import { useUserProfile } from "@/hooks/useUserProfile";
import { useNavigate } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { canCreateWorkspace, resolveFirstName } from "@/lib/home-presentation";
import { useIsMobile } from "@/hooks/use-mobile";
import { HomeTopbar } from "@/components/home/HomeTopbar";
import { HomeGreeting } from "@/components/home/HomeGreeting";
import { HomeSummaryCards } from "@/components/home/HomeSummaryCards";
import { HomeChecklistList } from "@/components/home/HomeChecklistList";
import { HomeChecklistFilter } from "@/components/home/HomeChecklistFilter";
import {
  HOME_CHECKLIST_FILTER_DEFAULT,
  filterHomeChecklists,
  type HomeChecklistFilterId,
} from "@/lib/home-checklist-filter";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

export const Route = createFileRoute("/inicio")({
  head: () => ({
    meta: [{ title: "Painel — ChecklistApp" }],
  }),
  component: Dashboard,
});

/**
 * `/inicio` (6B.2L) — Home editorial do Tieck.
 *
 * A rota continua sendo a DONA do estado e da regra: consulta, handlers,
 * seleção em lote, diálogos e RBAC permanecem como estavam. O que mudou é a
 * composição visual: topbar compacta + saudação + 3 cards resumo + UMA
 * superfície de lista (HomeTopbar/HomeGreeting/HomeSummaryCards/
 * HomeChecklistList). As superfícies antigas (resumo de 4 cards, rotinas
 * agendadas, prioridades, cartões grandes por checklist) deixaram de ser
 * renderizadas aqui — os contratos/hooks continuam existindo no projeto.
 * `/painel` segue sendo o dashboard analítico e não é tocado por esta tela.
 */
export function Dashboard() {
  const isMobile = useIsMobile();
  const { sidebarOpen } = useSidebar();
  const { currentWorkspace, workspaceStatus, workspaces = [] } = useWorkspace();
  const { user, loading: authLoading, needsEmailConfirmation } = useAuth();
  const { canManage, isViewer, role, loading: rbacLoading } = useWorkspaceRBAC(currentWorkspace?.id);
  const navigate = useNavigate();

  // Nome exibido + permissão administrativa, de fontes REAIS já usadas pelo
  // app: perfil (`profiles`) e metadados do usuário. Nunca pelo e-mail.
  const profile = useUserProfile(user?.id);
  const firstName = resolveFirstName(
    profile?.displayName,
    (user?.user_metadata as { full_name?: string } | undefined)?.full_name,
    (user?.user_metadata as { name?: string } | undefined)?.name,
  );

  const [checklists, setChecklists] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [checklistToDelete, setChecklistToDelete] = useState<any>(null);
  const [checklistToRename, setChecklistToRename] = useState<any>(null);
  const [newTitle, setNewTitle] = useState("");
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [showBulkDeleteDialog, setShowBulkDeleteDialog] = useState(false);
  // Filtro LOCAL da seção (client-side, default "Todos"): não altera consulta,
  // não vai para a URL e não mexe nos cards — só na lista apresentada.
  const [checklistFilter, setChecklistFilter] = useState<HomeChecklistFilterId>(
    HOME_CHECKLIST_FILTER_DEFAULT,
  );
  const visibleChecklists = filterHomeChecklists(checklists, checklistFilter);

  useEffect(() => {
    if (!authLoading && !user) {
      navigate({ to: "/login" });
      return;
    }
    if (!authLoading && user && needsEmailConfirmation) {
      navigate({ to: "/confirmar-email" });
      return;
    }

    const fetchChecklists = async () => {
      // Bloqueio determinístico: se estamos num workspace, ESPERAR RBAC resolver.
      // Fail-closed: se rbacLoading for true, não iniciamos a query (leak de dados).
      if (workspaceStatus === 'workspace' && (rbacLoading || !user?.id)) {
        setChecklists([]);
        return;
      }

      // Fail-closed: se o RBAC resolveu e não temos role, bloquear.
      if (workspaceStatus === 'workspace' && !rbacLoading && !role) {
        setChecklists([]);
        setIsLoading(false);
        return;
      }

      if (!user?.id) return;

      setIsLoading(true);

      try {
        let query;

        if (workspaceStatus === 'workspace' && currentWorkspace) {
          if (isViewer) {
            // FASE 5B.11: Viewer vê TODOS os checklists do workspace, mas NÃO carregamos assignments via join
            // para evitar vazar dados de terceiros. A associação será feita via RPC posteriormente.
            query = supabase.from("checklists").select("*").eq("workspace_id", currentWorkspace.id);
          } else {
            // Outras roles carregam com assignments via join normalmente.
            query = supabase.from("checklists").select("*, checklist_assignments(*)").eq("workspace_id", currentWorkspace.id);
          }
        } else {
          // Contexto Pessoal: apenas checklists sem workspace_id do próprio usuário
          query = supabase.from("checklists").select("*, checklist_assignments(*)").is("workspace_id", null).eq("user_id", user.id);
        }

        const { data, error } = await query
          .is("category", null)
          .is("view_type", null)
          .order("created_at", { ascending: false });

        if (error) throw error;

        let finalChecklists: any[] = data || [];

        // FASE 5B.11: Se for Viewer, buscar apenas os PRÓPRIOS assignments via RPC
        if (isViewer && workspaceStatus === 'workspace' && currentWorkspace) {
          const { data: myAssignments } = await supabase.rpc('list_my_checklist_assignments', {
            p_workspace_id: currentWorkspace.id
          });

          // Mapear os assignments para os checklists carregados
          // Precisamos garantir que o formato do assignment da RPC seja compatível ou mapeado para o que o componente espera
          finalChecklists = finalChecklists.map(c => ({
            ...c,
            checklist_assignments: myAssignments?.filter((a: any) => a.checklist_id === c.id) || []
          }));
        }

        setChecklists(finalChecklists);
      } catch (error) {
        console.error("Erro ao carregar checklists:", error);
        toast.error("Erro ao carregar checklists");
      } finally {
        setIsLoading(false);
      }
    };

    fetchChecklists();
  }, [authLoading, user?.id, workspaceStatus, currentWorkspace?.id, isViewer, rbacLoading]);

  const handleNew = () => {
    // Clear any leftover draft so the editor opens on the welcome/orientation
    // screen instead of restoring an old "Teste" + Camera block from a
    // previous session that wasn't dismissed via the Back button.
    try {
      localStorage.removeItem("draft_checklist_title");
      localStorage.removeItem("draft_checklist_blocks");
      localStorage.removeItem("draft_checklist_started");
    } catch {}

    // Pass current workspace ID to the checklist editor if active
    setTimeout(() => navigate({
      to: "/checklist",
      search: currentWorkspace ? { workspace: currentWorkspace.id } as any : undefined
    }), 220);
  };

  // Abre o diálogo REAL de criação de workspace que já existe no shell —
  // nenhum fluxo paralelo é criado aqui.
  const handleNewWorkspace = () => {
    window.dispatchEvent(new CustomEvent("open-create-workspace"));
  };

  const handleOpen = (item: any) => {
    // FASE 5B.6: Viewer vai para execução, outros para editor
    if (workspaceStatus === 'workspace' && isViewer) {
      navigate({ to: "/executar/$id", params: { id: item.id } });
    } else {
      navigate({ to: "/checklist", search: { id: item.id } });
    }
  };

  const handleCopyLink = (item: any) => {
    if (!item.is_published) {
      toast.error("Você precisa publicar o checklist primeiro");
      return;
    }
    const finalSlug = item.custom_slug || item.id;
    const url = `${window.location.origin}/c/${finalSlug}`;
    navigator.clipboard.writeText(url);
    toast.success("Link copiado!");
  };

  const handleDelete = async () => {
    if (!checklistToDelete) return;

    const { error } = await supabase
      .from("checklists")
      .delete()
      .eq("id", checklistToDelete.id);

    if (error) {
      toast.error("Erro ao excluir checklist");
    } else {
      toast.success("Checklist excluído");
      setChecklists(prev => prev.filter(c => c.id !== checklistToDelete.id));
      setChecklistToDelete(null);
    }
  };

  const handleDuplicate = async (checklist: any) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { id, created_at, updated_at, ...rest } = checklist;
    const { data, error } = await supabase
      .from("checklists")
      .insert([{
        ...rest,
        title: `${checklist.title} (Cópia)`,
        user_id: user.id,
        is_published: false
      }])
      .select()
      .single();

    if (error) {
      toast.error("Erro ao duplicar checklist");
    } else {
      toast.success("Checklist duplicado!");
      setChecklists(prev => [data, ...prev]);
    }
  };

  const handleRename = async () => {
    if (!checklistToRename || !newTitle.trim()) return;

    const { error } = await supabase
      .from("checklists")
      .update({ title: newTitle.trim() })
      .eq("id", checklistToRename.id);

    if (error) {
      toast.error("Erro ao renomear checklist");
    } else {
      toast.success("Checklist renomeado!");
      setChecklists(prev => prev.map(c => c.id === checklistToRename.id ? { ...c, title: newTitle.trim() } : c));
      setChecklistToRename(null);
      setNewTitle("");
    }
  };

  const toggleSelection = (id: string) => {
    setSelectedIds(prev =>
      prev.includes(id)
        ? prev.filter(i => i !== id)
        : [...prev, id]
    );
  };

  const handleBulkDelete = async () => {
    if (selectedIds.length === 0) return;

    const { error } = await supabase
      .from("checklists")
      .delete()
      .in("id", selectedIds);

    if (error) {
      toast.error("Erro ao excluir checklists");
    } else {
      toast.success(`${selectedIds.length} checklists excluídos`);
      setChecklists(prev => prev.filter(c => !selectedIds.includes(c.id)));
      setSelectedIds([]);
      setIsSelectionMode(false);
      setShowBulkDeleteDialog(false);
    }
  };

  const workspaceLabel =
    workspaceStatus === 'workspace' ? (currentWorkspace?.name || "Workspace") : "Pessoal";

  // Mesma regra do shell para a criação de workspace (usuário sem permissão não
  // vê a ação administrativa; quem não tem nenhum workspace sempre pode criar).
  const showCreateWorkspace = canCreateWorkspace({
    isAdmin: profile?.isAdmin,
    workspaceCount: workspaces.length,
  });

  // Estado vazio REAL (uma variante por contexto, sem frase inventada).
  const emptyState = workspaceStatus === 'workspace' && isViewer
    ? {
        title: "Nenhum checklist atribuído",
        description: "Quando um checklist for atribuído a você, ele aparecerá aqui.",
      }
    : !currentWorkspace
      ? {
          title: "Nenhum checklist ainda",
          description: "Arregace as mangas e vamos começar. É simples como um, dois, três.",
          // Checklist pessoal: um Viewer de workspace ainda pode criar os seus.
          onCreate: handleNew,
        }
      : {
          title: "Nenhum checklist disponível neste workspace",
          description: "Arregace as mangas e vamos começar. É simples como um, dois, três.",
        };

  return (
    // A Home esconde apenas o botão flutuante de ajuda do shell.
    <DashboardLayout showFloatingHelp={false}>
      <HomeTopbar
        workspaceLabel={workspaceLabel}
        isMobile={isMobile === true}
        sidebarOpen={sidebarOpen}
        canCreateWorkspace={showCreateWorkspace}
        onCreateWorkspace={handleNewWorkspace}
        canCreateChecklist={Boolean(canManage)}
        onCreateChecklist={handleNew}
      />

      <main className="flex-1 px-4 pb-12 sm:px-6 overflow-y-auto w-full max-w-full">
        <div className="mx-auto w-full max-w-5xl space-y-8">
          <HomeGreeting firstName={firstName} />

          {isLoading || workspaceStatus === 'loading' ? (
            <div className="space-y-6" data-testid="home-loading">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-[104px] w-full rounded-xl" />
                ))}
              </div>
              <div className="overflow-hidden rounded-xl border border-neutral-100">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-[64px] w-full rounded-none" />
                ))}
              </div>
            </div>
          ) : (
            <>
              <HomeSummaryCards checklists={checklists} />

              <section aria-label="Checklists" className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h2
                    data-testid="home-checklists-title"
                    className="text-base font-semibold text-neutral-900"
                  >
                    {isSelectionMode ? `${selectedIds.length} selecionado(s)` : "Checklists"}
                  </h2>
                  {!isSelectionMode && (
                    <HomeChecklistFilter value={checklistFilter} onChange={setChecklistFilter} />
                  )}
                  {isSelectionMode && canManage && (
                    <div className="flex items-center gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setIsSelectionMode(false);
                          setSelectedIds([]);
                        }}
                        className="text-neutral-500"
                      >
                        <X className="w-4 h-4 mr-2" />
                        Cancelar
                      </Button>
                      <Button
                        variant="destructive"
                        size="sm"
                        disabled={selectedIds.length === 0}
                        onClick={() => setShowBulkDeleteDialog(true)}
                        className="bg-red-500 hover:bg-red-600"
                      >
                        <Trash2 className="w-4 h-4 mr-2" />
                        Excluir Selecionados
                      </Button>
                    </div>
                  )}
                </div>

                <HomeChecklistList
                  checklists={visibleChecklists}
                  canManage={Boolean(canManage)}
                  selectionMode={isSelectionMode}
                  selectedIds={selectedIds}
                  emptyState={emptyState}
                  filtered={checklistFilter !== HOME_CHECKLIST_FILTER_DEFAULT}
                  actions={{
                    onOpen: handleOpen,
                    onToggleSelect: toggleSelection,
                    onSettings: (item) =>
                      navigate({ to: "/checklist", search: { id: item.id, settings: true } }),
                    onEdit: (item) => navigate({ to: "/checklist", search: { id: item.id } }),
                    onSelect: (item) => {
                      setIsSelectionMode(true);
                      setSelectedIds([item.id]);
                    },
                    onRename: (item) => {
                      setChecklistToRename(item);
                      setNewTitle(item.title);
                    },
                    onCopyLink: handleCopyLink,
                    onDuplicate: handleDuplicate,
                    onDelete: (item) => setChecklistToDelete(item),
                  }}
                />
              </section>
            </>
          )}
        </div>
      </main>

      {showBulkDeleteDialog && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white w-full max-w-sm rounded-2xl shadow-2xl p-6 overflow-hidden animate-in zoom-in-95 duration-200 text-center">
            <div className="w-16 h-16 bg-red-50 rounded-full flex items-center justify-center text-red-500 mx-auto mb-4">
              <Trash2 className="w-8 h-8" />
            </div>
            <h3 className="text-xl font-bold text-neutral-900 mb-2">Excluir {selectedIds.length} checklists?</h3>
            <p className="text-sm text-neutral-500 mb-8 leading-relaxed">
              Você tem certeza que deseja excluir os checklists selecionados? Esta ação não pode ser desfeita.
            </p>
            <div className="flex flex-col gap-3">
              <button
                onClick={handleBulkDelete}
                className="w-full py-3 bg-red-500 hover:bg-red-600 text-white font-bold rounded-xl transition-colors shadow-lg shadow-red-100"
              >
                Sim, excluir selecionados
              </button>
              <button
                onClick={() => setShowBulkDeleteDialog(false)}
                className="w-full py-3 bg-neutral-100 hover:bg-neutral-200 text-neutral-700 font-bold rounded-xl transition-colors"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {checklistToDelete && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white w-full max-w-sm rounded-2xl shadow-2xl p-6 overflow-hidden animate-in zoom-in-95 duration-200 text-center">
            <div className="w-16 h-16 bg-red-50 rounded-full flex items-center justify-center text-red-500 mx-auto mb-4">
              <Trash2 className="w-8 h-8" />
            </div>
            <h3 className="text-xl font-bold text-neutral-900 mb-2">Excluir checklist?</h3>
            <p className="text-sm text-neutral-500 mb-8 leading-relaxed">
              Você tem certeza que deseja excluir <strong>{checklistToDelete.title}</strong>? Esta ação não pode ser desfeita.
            </p>
            <div className="flex flex-col gap-3">
              <button
                onClick={handleDelete}
                className="w-full py-3 bg-red-500 hover:bg-red-600 text-white font-bold rounded-xl transition-colors shadow-lg shadow-red-100"
              >
                Sim, excluir agora
              </button>
              <button
                onClick={() => setChecklistToDelete(null)}
                className="w-full py-3 bg-neutral-100 hover:bg-neutral-200 text-neutral-700 font-bold rounded-xl transition-colors"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      <Dialog open={!!checklistToRename} onOpenChange={(open) => !open && setChecklistToRename(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Renomear checklist</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <Input
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder="Digite o novo título"
              onKeyDown={(e) => e.key === "Enter" && handleRename()}
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setChecklistToRename(null)}>
              Cancelar
            </Button>
            <Button
              onClick={handleRename}
              className="bg-pink-500 hover:bg-pink-600 text-white"
            >
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
