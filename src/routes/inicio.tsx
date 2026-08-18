import { createFileRoute, Link } from "@tanstack/react-router";
import { Search, Sparkles, Settings, Plus, HelpCircle, Pencil, Link2, Trash2, MoreHorizontal, Copy as CopyIcon, CheckSquare, X, Menu, User } from "lucide-react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { useWorkspaceRBAC } from "@/hooks/useWorkspaceRBAC";
import { useSidebar } from "@/contexts/SidebarContext";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { useAuth } from "@/contexts/AuthContext";
import { useNavigate } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { FileText, Clock, ChevronRight, CalendarDays } from "lucide-react";
import { getAssignmentStatus, getStatusBadge } from "@/utils/assignment-status";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";
import logoUrl from "../assets/local/logo-k.webp";
import { toast } from "sonner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/inicio")({
  head: () => ({
    meta: [{ title: "Painel — ChecklistApp" }],
  }),
  component: Dashboard,
});

export function Dashboard() {
  const isMobile = useIsMobile();
  const { sidebarOpen } = useSidebar();
  const { currentWorkspace, workspaceStatus } = useWorkspace();
  const { user, loading: authLoading, needsEmailConfirmation } = useAuth();
  const { canManage, isViewer, loading: rbacLoading } = useWorkspaceRBAC(currentWorkspace?.id);
  const navigate = useNavigate();
  const [glow, setGlow] = useState(false);
  const [checklists, setChecklists] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [checklistToDelete, setChecklistToDelete] = useState<any>(null);
  const [checklistToRename, setChecklistToRename] = useState<any>(null);
  const [newTitle, setNewTitle] = useState("");
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [showBulkDeleteDialog, setShowBulkDeleteDialog] = useState(false);

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
      // Bloqueio de flash: Não carregar até o contexto estar definido
      if (workspaceStatus === 'loading' || !user?.id) {
        return;
      }
      
      // Só ativamos o loading bloqueante se for a primeira carga ou mudança de contexto real
      // O TanStack Query (se usado) lidaria com isso, mas aqui usamos estado local.
      setIsLoading(true);
      
      try {
        let query = supabase.from("checklists").select("*, checklist_assignments(*)");
        
        if (workspaceStatus === 'workspace' && currentWorkspace) {
          query = query.eq("workspace_id", currentWorkspace.id);
        } else {
          query = query.is("workspace_id", null);
        }
        
        const { data, error } = await query
          .is("category", null)
          .is("view_type", null)
          .order("created_at", { ascending: false });
        
        if (error) throw error;
        setChecklists(data || []);
      } catch (error) {
        console.error("Erro ao carregar checklists:", error);
        toast.error("Erro ao carregar checklists");
      } finally {
        setIsLoading(false);
      }
    };

    fetchChecklists();
  }, [authLoading, user?.id, workspaceStatus, currentWorkspace?.id]);

  const handleNew = () => {
    setGlow(true);
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

  return (
     <DashboardLayout>
        <header className="flex items-center justify-between px-4 sm:px-6 py-4">
          <div className={cn(
            "flex items-center gap-2 transition-all duration-300",
            !sidebarOpen && !isMobile ? "pl-14" : "pl-0",
            isMobile && !sidebarOpen ? "pl-12" : "pl-0"
          )}>
            <img 
              src={logoUrl} 
              alt="Logo" 
              className={cn(
                "object-contain grayscale hover:grayscale-0 transition-all cursor-pointer shrink-0",
                isMobile ? "w-10 h-10" : "w-20 h-20"
              )} 
            />
            <span className="text-neutral-400">›</span>
            <span className="text-neutral-600 font-medium truncate max-w-[120px] sm:max-w-none">
              {currentWorkspace?.name || "Meu workspace"}
            </span>
          </div>
          <div className="flex items-center gap-2 sm:gap-3 text-neutral-500">
             <button className="flex items-center gap-1 text-xs sm:text-sm hover:text-neutral-900">
              <Search className="w-4 h-4" /> <span className="hidden sm:inline">Buscar</span>
            </button>
            <button className="hover:text-neutral-900">
              <Sparkles className="w-4 h-4" />
            </button>
            <button 
              onClick={() => navigate({ to: "/configuracoes" })}
              className="hover:text-neutral-900"
              title="Minha conta"
            >
              <User className="w-4 h-4" />
            </button>

          </div>
        </header>

        <main className="flex-1 px-4 sm:px-6 py-6 sm:py-8 overflow-y-auto w-full max-w-full">
          <div className="max-w-5xl mx-auto h-full w-full">
            {isLoading || workspaceStatus === 'loading' ? (
              <div className="space-y-4">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="w-full h-[70px] bg-neutral-50 animate-pulse rounded-xl border border-neutral-100" />
                ))}
              </div>
            ) : checklists.length > 0 ? (
              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <h2 className="text-xl font-bold text-neutral-900">
                    {isSelectionMode ? `${selectedIds.length} selecionado(s)` : "Checklists"}
                  </h2>
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
                <div className="flex flex-col gap-4">
                {checklists.map((item) => (
                  <div
                    key={item.id}
                    onClick={() => isSelectionMode && toggleSelection(item.id)}
                    className={cn(
                      "group relative bg-white border rounded-xl p-3 sm:p-4 sm:pl-6 transition-all cursor-default min-h-[70px] flex flex-col sm:flex-row sm:items-center justify-between overflow-hidden shadow-sm gap-3",
                      isSelectionMode && selectedIds.includes(item.id) 
                        ? "border-pink-500 bg-pink-50/30" 
                        : "border-neutral-200 hover:border-pink-300 hover:shadow-md"
                    )}
                  >
                    <div className="relative z-10 flex flex-row items-center justify-between w-full gap-2 sm:gap-4">
                      <div className="flex items-center gap-2 sm:gap-4 min-w-0 flex-1">
                        {isSelectionMode && (
                          <div className={`w-5 h-5 rounded border flex items-center justify-center transition-colors ${
                            selectedIds.includes(item.id) 
                              ? "bg-pink-500 border-pink-500 text-white" 
                              : "border-neutral-300 bg-white"
                          }`}>
                            {selectedIds.includes(item.id) && <CheckSquare className="w-3.5 h-3.5" />}
                          </div>
                        )}
                        <div className="p-1.5 bg-pink-50 rounded-lg text-pink-500 shrink-0">
                          <FileText className="w-4 h-4" />
                        </div>
                        <div 
                          className="cursor-pointer flex items-center gap-3 min-w-0"
                          onClick={() => {
                            if (isSelectionMode) return;
                            navigate({ to: "/checklist", search: { id: item.id } });
                          }}
                        >
                          <div 
                            className={`w-2 h-2 rounded-full shrink-0 ${item.is_published ? "bg-green-500" : "bg-yellow-400"}`}
                            title={item.is_published ? "Publicado" : "Não publicado"}
                          />
                          <div className="flex flex-col min-w-0 flex-1">
                            <h3 className="font-semibold text-neutral-900 truncate group-hover:text-pink-500 transition-colors text-sm">{item.title}</h3>
                            <div className="flex flex-wrap items-center gap-2 mt-1">
                              <div className="flex items-center gap-1.5 text-[10px] text-neutral-400 shrink-0 bg-neutral-50 px-2 py-0.5 rounded-full border border-neutral-100">
                                <Clock className="w-2.5 h-2.5" />
                                <span>{new Date(item.updated_at || item.created_at).toLocaleDateString("pt-BR")}</span>
                              </div>
                              {item.checklist_assignments?.map((a: any) => {
                                const status = getAssignmentStatus(a.due_at, a.completed_at);
                                const badge = getStatusBadge(status);
                                if (!badge) return null;
                                return (
                                  <div key={a.id} className="flex items-center gap-1.5">
                                    <span className={cn(
                                      "px-2 py-0.5 rounded-full text-[9px] font-bold border flex items-center gap-1",
                                      badge.className
                                    )}>
                                      <CalendarDays className="w-2.5 h-2.5" />
                                      {badge.label}
                                      {a.due_at && (
                                        <span className="opacity-70 ml-0.5 font-medium hidden sm:inline">
                                          • {new Date(a.due_at).toLocaleDateString("pt-BR", { day: '2-digit', month: '2-digit' })}
                                        </span>
                                      )}
                                    </span>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        </div>
                      </div>

                      {!isSelectionMode && canManage && (
                        <div className="flex items-center gap-1 sm:gap-2 shrink-0">
                          <div className={cn(
                            "flex items-center gap-1 transition-all",
                            isMobile ? "opacity-100" : "opacity-0 group-hover:opacity-100"
                          )}>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                navigate({ to: "/checklist", search: { id: item.id } });
                              }}
                              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-neutral-500 hover:text-[#FF007F] hover:bg-pink-50 transition-all text-xs font-medium"
                              title="Editar"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                              <span>Editar</span>
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                if (!item.is_published) {
                                  toast.error("Você precisa publicar o checklist primeiro");
                                  return;
                                }
                                const finalSlug = item.custom_slug || item.id;
                                const url = `${window.location.origin}/c/${finalSlug}`;
                                navigator.clipboard.writeText(url);
                                toast.success("Link copiado!");
                              }}
                              className="p-1.5 rounded-lg text-neutral-400 hover:text-[#FF007F] hover:bg-pink-50 transition-all"
                              title="Copiar link"
                            >
                              <Link2 className="w-4 h-4" />
                            </button>
                             <button
                               type="button"
                               onClick={(e) => {
                                 e.preventDefault();
                                 e.stopPropagation();
                                 setChecklistToDelete(item);
                               }}
                               className="p-1.5 rounded-lg text-neutral-400 hover:text-[#FF007F] hover:bg-pink-50 transition-all z-20 group/trash"
                               title="Excluir"
                             >
                               <Trash2 className="w-4 h-4 pointer-events-none group-hover/trash:text-[#FF007F]" />
                             </button>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <button
                                  onClick={(e) => e.stopPropagation()}
                                  className="p-1.5 rounded-lg text-neutral-400 hover:text-neutral-600 hover:bg-neutral-100 transition-all"
                                  title="Mais"
                                >
                                  <MoreHorizontal className="w-4 h-4" />
                                </button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="w-48">
                                <DropdownMenuItem 
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    navigate({ to: "/checklist", search: { id: item.id, settings: true } });
                                  }}
                                  className="gap-2 cursor-pointer"
                                >
                                  <Settings className="w-4 h-4" />
                                  <span>Configurações</span>
                                </DropdownMenuItem>
                                <DropdownMenuItem 
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    navigate({ to: "/checklist", search: { id: item.id } });
                                  }}
                                  className="gap-2 cursor-pointer"
                                >
                                  <Pencil className="w-4 h-4" />
                                  <span>Editar</span>
                                </DropdownMenuItem>
                                <DropdownMenuItem 
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setIsSelectionMode(true);
                                    setSelectedIds([item.id]);
                                  }}
                                  className="gap-2 cursor-pointer"
                                >
                                  <CheckSquare className="w-4 h-4" />
                                  <span>Selecionar</span>
                                </DropdownMenuItem>
                                <DropdownMenuItem 
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setChecklistToRename(item);
                                    setNewTitle(item.title);
                                  }}
                                  className="gap-2 cursor-pointer"
                                >
                                  <FileText className="w-4 h-4" />
                                  <span>Renomear</span>
                                </DropdownMenuItem>
                                {item.is_published && (
                                  <DropdownMenuItem 
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      const url = `${window.location.origin}/c/${item.id}`;
                                      navigator.clipboard.writeText(url);
                                      toast.success("Link copiado!");
                                    }}
                                    className="gap-2 cursor-pointer"
                                  >
                                    <Link2 className="w-4 h-4" />
                                    <span>Copiar Link</span>
                                  </DropdownMenuItem>
                                )}
                                <DropdownMenuItem 
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleDuplicate(item);
                                  }}
                                  className="gap-2 cursor-pointer"
                                >
                                  <CopyIcon className="w-4 h-4" />
                                  <span>Duplicar</span>
                                </DropdownMenuItem>
                                <DropdownMenuItem 
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setChecklistToDelete(item);
                                  }}
                                  className="gap-2 cursor-pointer text-red-600 focus:text-red-600 focus:bg-red-50"
                                >
                                  <Trash2 className="w-4 h-4" />
                                  <span>Excluir</span>
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
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

        {canManage && (
          <button
            onClick={handleNew}
            className="flex items-center justify-center border-2 border-dashed border-neutral-200 rounded-xl p-4 text-neutral-400 hover:border-pink-300 hover:text-pink-500 transition-all min-h-[70px]"
          >
            <Plus className="w-6 h-6 mr-2" />
            <span className="text-sm font-medium">Novo checklist</span>
          </button>
        )}
              </div>
            </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-full min-h-[400px] text-center max-w-md mx-auto">
                <div className="w-40 h-40 flex items-center justify-center text-neutral-400 mb-4">
                  <svg viewBox="0 0 200 160" className="w-full h-full" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M40 110 Q60 60 110 70 Q160 80 170 110" />
                    <circle cx="115" cy="65" r="10" />
                    <path d="M115 75 L115 100 L100 130" />
                    <path d="M115 100 L135 125" />
                    <path d="M115 80 L95 70 L80 50" />
                    <path d="M115 80 L140 65 L160 50" />
                    <ellipse cx="105" cy="135" rx="25" ry="6" fill="#fce7f3" stroke="#f9a8d4" />
                    <circle cx="105" cy="133" r="3" fill="#ec4899" stroke="#ec4899" />
                  </svg>
                </div>
                <h2 className="text-base font-semibold text-neutral-900">
                  {checklists.length === 0 ? (currentWorkspace ? "Nenhum checklist disponível neste workspace" : "Nenhum checklist ainda") : "Tudo pronto por aqui"}
                </h2>
                <p className="mt-1 text-sm text-neutral-500 mb-6">
                  {checklists.length === 0 
                    ? "Arregace as mangas e vamos começar. É simples como um, dois, três."
                    : "Você não possui checklists individuais nesta visualização."}
                </p>
                {/* 
                  O botão Novo Checklist na Home (/inicio) é para checklists PESSOAIS (workspace_id IS NULL).
                  Mesmo um Viewer de um workspace pode criar seus próprios checklists pessoais.
                  Portanto, mantemos o botão, mas removemos o glow se já houver checklists no workspace
                  ou se for uma experiência guiada.
                */}
                {!currentWorkspace && (
                  <button
                    type="button"
                    onClick={handleNew}
                    className={`inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-md transition-all ${
                      glow
                        ? "shadow-[0_0_0_4px_rgba(236,72,153,0.35),0_0_24px_rgba(236,72,153,0.7)] ring-2 ring-pink-400"
                        : ""
                    }`}
                  >
                    <Plus className="w-4 h-4" />
                    Novo checklist pessoal
                  </button>
                )}
              </div>
            )}
          </div>
        </main>

        <button
          type="button"
          className="fixed bottom-4 right-4 w-8 h-8 rounded-full border border-neutral-200 bg-white text-neutral-500 hover:text-neutral-900 flex items-center justify-center shadow-sm"
        >
          <HelpCircle className="w-4 h-4" />
        </button>


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