import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useAuth } from "@/contexts/AuthContext";
import { useState, useEffect, useMemo, useCallback } from "react";
import { 
  Search, MoreHorizontal, Plus, FileText, Clock, X, ExternalLink, 
  Copy, Share2, Layout, MessageSquare, Bell, ChevronRight, 
  Settings, Trash2, Link2, Pencil, Copy as CopyIcon, 
  BarChart3, Send, CheckSquare, Check, UserPlus, FolderOpen,
  ChevronDown, Filter, LayoutGrid, List, MoreVertical,
  Globe, Users, Crown, Mail, ArrowUpRight, GripVertical,
  LayoutTemplate, Files, ArrowLeft, ArrowRight, Star, MessageCircle,
  Calendar, User as UserIcon, ArrowUpDown, Maximize2, Rows,
  Edit2, Eye, Palette, Link as LinkIcon, Copy as CopyIcon2, Trash,
  Smile, Briefcase, BookOpen, EyeOff, CheckCircle2, AlertCircle,
  CalendarDays
} from "lucide-react";
import { getAssignmentStatus, getStatusBadge } from "@/utils/assignment-status";
import { AssignmentDeadlinePopover } from "@/components/AssignmentDeadlinePopover";
import { cn } from "@/lib/utils";
import type { WorkspaceMemberView } from "./equipe";
import type { Database } from "@/integrations/supabase/types";





import { supabase } from "@/integrations/supabase/client";
import { DashboardLayout } from "@/components/DashboardLayout";
import { useSidebar } from "@/contexts/SidebarContext";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { WorkspaceOnboarding } from "@/components/WorkspaceOnboarding";
import { toast } from "sonner";
import { 
  DndContext, 
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
  DragOverEvent,
  DragStartEvent,
  DragOverlay,
  defaultDropAnimationSideEffects,
  useDroppable,
} from "@dnd-kit/core";
import { useWorkspaceRBAC } from "@/hooks/useWorkspaceRBAC";

import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { restrictToWindowEdges } from "@dnd-kit/modifiers";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
  DropdownMenuPortal,
} from "@/components/ui/dropdown-menu";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubTrigger,
  ContextMenuSubContent,
  ContextMenuPortal,
} from "@/components/ui/context-menu";


import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

// Types
interface Checklist {
  id: string;
  title: string | null;
  category: string | null;
  workspace_id: string | null;
  is_published: boolean | null;
  updated_at: string;
  view_type?: string | null;
  [key: string]: unknown;
}

interface ChecklistAssignmentView {
  id: string;
  checklist_id: string;
  workspace_member_id: string;
  is_primary: boolean;
  workspace_id: string;
  due_at: string | null;
  completed_at: string | null;
}

interface Category {
  id: string;
  name: string;
  workspace_id: string | null;
  icon_name?: string | null;
  created_at: string;
}

// --- Sortable Item Component ---
function SortableChecklistCard({ 
  checklist, 
  isSelected, 
  onSelect,
  onUpdateTitle,
  submissionCount,
  categories,
  onMove,
  onDelete,
  onEdit,
  onCopyLink,
  onDuplicate,
  accentColor,
  assignments,
  members,
  onAssign,
  onSetDeadline,
  canManage,
}: { 
  checklist: Checklist; 
  isSelected: boolean; 
  onSelect: () => void;
  submissionCount: number;
  categories: Category[];
  onMove: (id: string, cat: string | null) => void;
  onDelete: (item: Checklist) => void;
  onEdit: (id: string) => void;
  onUpdateTitle: (id: string, title: string) => void;
  onCopyLink: () => void;
  onDuplicate: (item: Checklist) => void;
  accentColor: string;
  assignments: ChecklistAssignmentView[];
  members: WorkspaceMemberView[];
  onAssign: (checklistId: string, memberId: string | null) => void;
  onSetDeadline: (assignmentId: string, dueAt: string | null) => void;
  canManage: boolean;
}) {



  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(checklist.title || "");

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging
  } = useSortable({ id: checklist.id, disabled: isEditing });

  const style = {
    transform: CSS.Translate.toString(transform),
    transition: transition || 'transform 300ms cubic-bezier(0.2, 0, 0, 1)',
    opacity: isDragging ? 0 : 1,
    zIndex: isDragging ? 100 : 1,
  };

  const handleSave = () => {
    if (editValue.trim() && editValue !== checklist.title) {
      onUpdateTitle(checklist.id, editValue.trim());
    }
    setIsEditing(false);
  };

  return (
    <div 
      ref={setNodeRef} 
      style={{ ...style }}
      {...attributes}
      {...listeners}
      onClick={() => onEdit(checklist.id)}
      className={`group relative bg-white pl-[14px] pr-4 py-4 rounded-xl border transition-all duration-200 cursor-pointer hover:shadow-md ${isSelected ? "border-neutral-300 shadow-sm" : "border-neutral-100 shadow-none hover:border-neutral-200"}`}
    >
      <div
        aria-hidden
        className="absolute left-[5px] top-1/2 -translate-y-1/2 h-5 w-[2px] rounded-full transition-all duration-200 group-hover:h-6"
        style={{
          backgroundColor: accentColor,
          opacity: 0.5,
        }}
      />
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          {isEditing ? (
            <input
              autoFocus
              className="w-full text-[13px] font-medium text-neutral-800 outline-none bg-neutral-50 rounded px-1 -ml-1"
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSave();
                if (e.key === 'Escape') {
                  setIsEditing(false);
                  setEditValue(checklist.title || "");
                }
              }}
              onBlur={handleSave}
            />
          ) : (
            <div className="flex flex-col gap-1.5">
              <h4 className="text-[13px] font-medium text-neutral-800 line-clamp-2">{checklist.title || "Sem título"}</h4>
              <div className="flex items-center gap-2">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild disabled={!canManage}>
                    <button 
                      className={`flex -space-x-1.5 p-0.5 rounded-full transition-all ${canManage ? 'hover:bg-neutral-50' : 'cursor-default'}`}
                      onClick={(e) => e.stopPropagation()}
                    >
                      {assignments.filter(a => a.checklist_id === checklist.id).length > 0 ? (
                        assignments
                          .filter(a => a.checklist_id === checklist.id)
                          .map(a => {
                            const member = members.find(m => m.id === a.workspace_member_id);
                            return (
                              <div key={a.id} className="w-5 h-5 rounded-full border border-white bg-neutral-100 overflow-hidden flex items-center justify-center">
                                {member?.profiles?.avatar_url ? (
                                  <img src={member.profiles.avatar_url} alt="" className="w-full h-full object-cover" />
                                ) : (
                                  <UserIcon className="w-2.5 h-2.5 text-neutral-400" />
                                )}
                              </div>
                            );
                          })
                      ) : (
                        <div className={`w-5 h-5 rounded-full border border-dashed border-neutral-300 bg-neutral-50 flex items-center justify-center ${canManage ? 'hover:border-neutral-400' : ''} transition-colors`}>
                          <UserPlus className="w-2.5 h-2.5 text-neutral-400" />
                        </div>
                      )}
                    </button>
                  </DropdownMenuTrigger>
                  {canManage && (
                    <DropdownMenuContent align="start" className="w-56 bg-white border border-neutral-100 shadow-xl rounded-xl p-1">
                      <div className="px-2 py-1.5 text-[10px] font-bold text-neutral-500 uppercase tracking-wider">Atribuir responsável</div>
                      {members.filter(m => m.status === 'active').map(member => {
                        const isAssigned = assignments.some(a => a.checklist_id === checklist.id && a.workspace_member_id === member.id);
                        return (
                          <DropdownMenuItem 
                            key={member.id} 
                            className="flex items-center justify-between gap-2 text-xs hover:bg-neutral-50 rounded-lg py-2"
                            onClick={(e) => {
                              e.stopPropagation();
                              onAssign(checklist.id, isAssigned ? null : member.id);
                            }}
                          >
                            <div className="flex items-center gap-2">
                              <div className="w-6 h-6 rounded-full bg-neutral-100 overflow-hidden">
                                {member.profiles?.avatar_url && <img src={member.profiles.avatar_url} className="w-full h-full object-cover" />}
                              </div>
                              <span className="truncate max-w-[120px]">{member.profiles?.display_name || 'Membro'}</span>
                            </div>
                            {isAssigned && <Check className="w-3.5 h-3.5 text-pink-500" />}
                          </DropdownMenuItem>
                        );
                      })}
                    </DropdownMenuContent>
                  )}
                </DropdownMenu>

                {assignments.filter(a => a.checklist_id === checklist.id).map(a => {
                  const status = getAssignmentStatus(a.due_at, a.completed_at);
                  const badge = getStatusBadge(status);
                  return (
                    <div key={a.id} className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                      <AssignmentDeadlinePopover 
                        dueAt={a.due_at}
                        disabled={!canManage}
                        onUpdate={(dueAt) => onSetDeadline(a.id, dueAt)}
                      />
                      {badge && (
                        <span className={cn(
                          "px-1.5 py-0.5 rounded-full text-[9px] font-bold border",
                          badge.className
                        )}>
                          {badge.label}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>


        
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button 
              className="p-1 text-neutral-400 hover:text-neutral-600 hover:bg-neutral-50 rounded transition-all shrink-0"
              onClick={(e) => e.stopPropagation()}
            >
              <MoreHorizontal className="w-4 h-4" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-64 bg-[#1a1a1a] border-neutral-800 text-neutral-300 p-1.5 rounded-xl shadow-2xl">
            <div className="px-2 py-1.5">
              <input 
                placeholder="Pesquisar ações..." 
                className="w-full bg-[#2a2a2a] border-none rounded-md px-2 py-1 text-xs outline-none focus:ring-1 focus:ring-blue-500 mb-2"
              />
              <div className="text-[10px] font-bold text-neutral-500 uppercase tracking-wider mb-1 px-1">Página</div>
            </div>
            
            <DropdownMenuItem className="gap-3 text-xs hover:bg-neutral-800 rounded-lg py-2">
              <Star className="w-4 h-4" /> Adicionar aos favoritos
            </DropdownMenuItem>
            
            <DropdownMenuItem 
              className="gap-3 text-xs hover:bg-neutral-800 rounded-lg py-2"
              onClick={() => setIsEditing(true)}
            >
              <Smile className="w-4 h-4" /> Editar ícone
            </DropdownMenuItem>
            
            <DropdownMenuSub>
              <DropdownMenuSubTrigger className="gap-3 text-xs hover:bg-neutral-800 rounded-lg py-2">
                <List className="w-4 h-4" /> Editar propriedade
              </DropdownMenuSubTrigger>
              <DropdownMenuPortal>
                <DropdownMenuSubContent className="bg-[#1a1a1a] border-neutral-800 text-neutral-300">
                  <DropdownMenuItem className="text-xs hover:bg-neutral-800">Status</DropdownMenuItem>
                  <DropdownMenuItem className="text-xs hover:bg-neutral-800">Prioridade</DropdownMenuItem>
                </DropdownMenuSubContent>
              </DropdownMenuPortal>
            </DropdownMenuSub>

            <DropdownMenuItem className="gap-3 text-xs hover:bg-neutral-800 rounded-lg py-2">
              <LayoutGrid className="w-4 h-4" /> Layout
            </DropdownMenuItem>
            
            <DropdownMenuItem className="gap-3 text-xs hover:bg-neutral-800 rounded-lg py-2">
              <Eye className="w-4 h-4" /> Visibilidade da propriedade
            </DropdownMenuItem>

            <DropdownMenuSeparator className="bg-neutral-800 my-1" />

            <DropdownMenuSub>
              <DropdownMenuSubTrigger className="gap-3 text-xs hover:bg-neutral-800 rounded-lg py-2">
                <ExternalLink className="w-4 h-4" /> Abrir em
              </DropdownMenuSubTrigger>
              <DropdownMenuPortal>
                <DropdownMenuSubContent className="bg-[#1a1a1a] border-neutral-800 text-neutral-300">
                  <DropdownMenuItem className="text-xs hover:bg-neutral-800">Nova aba</DropdownMenuItem>
                </DropdownMenuSubContent>
              </DropdownMenuPortal>
            </DropdownMenuSub>

            <DropdownMenuItem className="gap-3 text-xs hover:bg-neutral-800 rounded-lg py-2 justify-between">
              <div className="flex items-center gap-3">
                <MessageSquare className="w-4 h-4" /> Comentário
              </div>
              <span className="text-[10px] text-neutral-500">Ctrl+Shift+M</span>
            </DropdownMenuItem>

            <DropdownMenuSeparator className="bg-neutral-800 my-1" />

            <DropdownMenuItem className="gap-3 text-xs hover:bg-neutral-800 rounded-lg py-2" onClick={onCopyLink}>
              <Link2 className="w-4 h-4" /> Copiar link
            </DropdownMenuItem>

            <DropdownMenuItem className="gap-3 text-xs hover:bg-neutral-800 rounded-lg py-2 justify-between" onClick={() => onDuplicate(checklist)}>
              <div className="flex items-center gap-3">
                <Files className="w-4 h-4" /> Duplicar
              </div>
              <span className="text-[10px] text-neutral-500">Ctrl+D</span>
            </DropdownMenuItem>

            <DropdownMenuSub>
              <DropdownMenuSubTrigger className="gap-3 text-xs hover:bg-neutral-800 rounded-lg py-2 justify-between">
                <div className="flex items-center gap-3">
                  <ArrowUpRight className="w-4 h-4" /> Mover para
                </div>
                <span className="text-[10px] text-neutral-500">Ctrl+Shift+P</span>
              </DropdownMenuSubTrigger>
              <DropdownMenuPortal>
                <DropdownMenuSubContent className="bg-[#1a1a1a] border-neutral-800 text-neutral-300">
                  {categories.map(cat => (
                    <DropdownMenuItem key={cat.id} className="text-xs hover:bg-neutral-800" onClick={() => onMove(checklist.id, cat.name)}>
                      {cat.name}
                    </DropdownMenuItem>

                  ))}
                  <DropdownMenuItem className="text-xs hover:bg-neutral-800" onClick={() => onMove(checklist.id, null)}>
                    Tarefas
                  </DropdownMenuItem>
                </DropdownMenuSubContent>
              </DropdownMenuPortal>
            </DropdownMenuSub>

            <DropdownMenuItem 
              className="gap-3 text-xs text-red-400 hover:bg-red-950/30 hover:text-red-400 rounded-lg py-2 justify-between"
              onClick={() => onDelete(checklist)}
            >
              <div className="flex items-center gap-3">
                <Trash2 className="w-4 h-4" /> Mover para a lixeira
              </div>
              <span className="text-[10px] opacity-50">Del</span>
            </DropdownMenuItem>

            <div className="px-3 py-2 mt-1 border-t border-neutral-800">
              <div className="text-[9px] text-neutral-500">Última edição por Você</div>
              <div className="text-[9px] text-neutral-500">hoje às {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
            </div>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

    </div>
  );
}
function DroppableColumn({ id, children, className, style }: { id: string, children: React.ReactNode, className?: string, style?: React.CSSProperties }) {
  const { setNodeRef } = useDroppable({ id });
  return (
    <div ref={setNodeRef} id={id} className={className} style={style}>
      {children}
    </div>
  );
}


// --- Main Page ---
export const Route = createFileRoute("/organizar")({
  head: () => ({
    meta: [{ title: "Workspace" }],
  }),
  validateSearch: (search: Record<string, unknown>): { id?: string } => {
    return {
      id: typeof search.id === "string" ? search.id : undefined,
    };
  },
  component: WorkspacePage,
});

export function WorkspacePage() {
  const { user, loading: authLoading } = useAuth();
  const { workspaces, currentWorkspace, isLoading: workspaceLoading, refreshWorkspaces, setCurrentWorkspace } = useWorkspace();
  const navigate = useNavigate();
  const { id: selectedId } = Route.useSearch();
  
  const workspaceId = selectedId || currentWorkspace?.id;
  const { canManage, role: rbacRole, loading: rbacLoading } = useWorkspaceRBAC(workspaceId);

  const [checklists, setChecklists] = useState<Checklist[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [submissionCounts, setSubmissionCounts] = useState<Record<string, number>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [members, setMembers] = useState<WorkspaceMemberView[]>([]);
  const [assignments, setAssignments] = useState<ChecklistAssignmentView[]>([]);
  const [currentUserRole, setCurrentUserRole] = useState<'owner' | 'admin' | 'editor' | 'viewer' | null>(null);

  useEffect(() => {
    if (!rbacLoading) {
      setCurrentUserRole(rbacRole || null);
    }
  }, [rbacRole, rbacLoading]);



  const [showOnboarding, setShowOnboarding] = useState(false);
  const [hasCheckedOnboarding, setHasCheckedOnboarding] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeId, setActiveId] = useState<string | null>(null);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editingTitleValue, setEditingTitleValue] = useState("");

  useEffect(() => {
    if (!authLoading && !user) {
      navigate({ to: "/login" });
    }
  }, [user, authLoading, navigate]);
  
  // Modals
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
  const [selectedCategoryIcon, setSelectedCategoryIcon] = useState("Layout");
  const [isIconPickerOpen, setIsIconPickerOpen] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [checklistToDelete, setChecklistToDelete] = useState<Checklist | null>(null);
  const [isAddingItem, setIsAddingItem] = useState<{ category: string | null } | null>(null);

  // Role evaluation is now handled inside the fetchData effect

  const [selectedSubTab, setSelectedSubTab] = useState("");
  const [newItemTitle, setNewItemTitle] = useState("");
  const [renamingCategoryId, setRenamingCategoryId] = useState<string | null>(null);
  const [renamingCategoryValue, setRenamingCategoryValue] = useState("");
  const [viewSettingsOpen, setViewSettingsOpen] = useState(false);




  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 10,
      },
    }),

    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const selectedChecklist = useMemo(() => 
    checklists.find(c => c.id === selectedId), 
  [selectedId, checklists]);

  useEffect(() => {
    const fetchData = async () => {
      if (workspaceLoading) return;
      
      const workspaceId = selectedId || currentWorkspace?.id;
      if (!workspaceId) {
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      if (!user) return;
      
      try {
        const { data: wsData, error: wsError } = await supabase
          .from("workspaces")
          .select("id, name, owner_id")
          .eq("id", workspaceId)
          .single();

        if (wsError) {
          console.error("Error fetching workspace:", wsError);
          toast.error("Erro ao carregar workspace");
          setIsLoading(false);
          return;
        }

        // The role is now managed by useWorkspaceRBAC
        // Just verify access here for navigation
        const ws = workspaces.find((w: any) => w.id === workspaceId);
        const isOwner = ws?.owner_id === user.id;
        
        // If we have no role and not owner after RBAC loaded, then no access
        if (!rbacLoading && !isOwner && !rbacRole) {
          toast.error("Você não tem acesso a este workspace");
          navigate({ to: "/inicio" });
          return;
        }


        // Batch data loading
        const [checklistsRes, categoriesRes, membersRes, assignmentsRes] = await Promise.all([
          supabase.from("checklists").select("*").eq("workspace_id", workspaceId),
          supabase.from("workspace_categories").select("*").eq("workspace_id", workspaceId),
          supabase.from("workspace_members").select("*, profiles!inner(*)").eq("workspace_id", workspaceId).eq("status", "active"),
          supabase.from("checklist_assignments").select("*").eq("workspace_id", workspaceId)
        ]);

        if (checklistsRes.data) setChecklists(checklistsRes.data);
        
        // Handle categories and selectedSubTab
        const finalCats = (categoriesRes.data || []) as any[];
        setCategories(finalCats.map((c: any) => ({

          id: c.id,
          name: c.name,
          workspace_id: c.workspace_id,
          icon_name: c.icon_name,
          created_at: c.created_at
        })));
        
        if (finalCats.length > 0 && !selectedSubTab) {
          setSelectedSubTab(finalCats[0].name);
        }

        if (membersRes.data) setMembers(membersRes.data as any);
        if (assignmentsRes.data) setAssignments(assignmentsRes.data as any);

      } catch (err) {
        console.error("Workspace initialization error:", err);
        toast.error("Erro técnico no carregamento");
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, [selectedId, currentWorkspace?.id, user, workspaceLoading, navigate, selectedSubTab]);


  // Handle onboarding trigger
  useEffect(() => {
    if (!isLoading && !workspaceLoading && currentWorkspace && !hasCheckedOnboarding) {
      if (categories.length === 0) {
        // Check if user has already dismissed onboarding for this workspace
        const dismissed = localStorage.getItem(`workspace_onboarding_dismissed_${currentWorkspace.id}`);
        if (!dismissed) {
          setShowOnboarding(true);
        }
      }
      setHasCheckedOnboarding(true);
    }
  }, [isLoading, workspaceLoading, currentWorkspace, categories.length, hasCheckedOnboarding]);

  const handleOnboardingSelect = async (type: "Pessoal" | "Trabalho" | "Estudos" | "Limpo") => {
    if (!currentWorkspace) return;
    
    setShowOnboarding(false);
    localStorage.setItem(`workspace_onboarding_dismissed_${currentWorkspace.id}`, "true");

    if (type === "Limpo") return;

    const categoryData: Record<string, { name: string, icon: string }[]> = {
      Trabalho: [
        { name: "Tarefas da empresa", icon: "Briefcase" },
        { name: "Sprint atual", icon: "Clock" },
        { name: "Cronograma", icon: "Calendar" },
        { name: "Backlog", icon: "List" }
      ],
      Pessoal: [
        { name: "Saúde", icon: "User" },
        { name: "Finanças", icon: "BarChart3" },
        { name: "Viagens", icon: "Globe" },
        { name: "Hobbies", icon: "Smile" }
      ],
      Estudos: [
        { name: "Cursos", icon: "BookOpen" },
        { name: "Livros", icon: "Files" },
        { name: "Provas", icon: "LayoutTemplate" },
        { name: "Pesquisa", icon: "Search" }
      ]
    };

    const selectedCategories = categoryData[type];
    
    try {
      const { error } = await supabase
        .from("workspace_categories")
        .insert(selectedCategories.map(cat => ({
          workspace_id: currentWorkspace.id,
          name: cat.name,
          icon_name: cat.icon
        })));

      if (error) throw error;
      
      // Refresh categories
      const { data: cats } = await supabase
        .from("workspace_categories")
        .select("*")
        .eq("workspace_id", currentWorkspace.id)
        .order("created_at", { ascending: true });
      
      setCategories(cats || []);
      if (cats && cats.length > 0) {
        setSelectedSubTab(cats[0].name);
      }
      
      toast.success(`Espaço de ${type} criado com sucesso!`);
    } catch (err: any) {
      toast.error("Erro ao configurar espaço: " + err.message);
    }
  };

  const handleCreateNewWorkspaceFromHeader = async () => {
    try {
      if (!user) return;

      const { data, error } = await supabase
        .from("workspaces")
        .insert([{ 
          owner_id: user.id, 
          name: "Título aqui", 
          icon: "Files" 
        }])
        .select()
        .single();

      if (error) throw error;

      await refreshWorkspaces();
      setCurrentWorkspace(data);
      toast.success("Novo espaço de trabalho criado!");
      
      // Force start editing title on next render
      setTimeout(() => {
        startEditingTitle();
      }, 300);

    } catch (err: any) {
      toast.error("Erro ao criar workspace: " + err.message);
    }
  };

  const handleCreateCategory = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!currentWorkspace || !newCategoryName.trim()) return;

    if (categories.length >= 5) {
      return;
    }

    try {
      const { data, error } = await supabase
        .from("workspace_categories")
        .insert([{ 
          workspace_id: currentWorkspace.id, 
          name: newCategoryName.trim(),
          icon_name: selectedCategoryIcon
        }])
        .select()
        .single();

      if (error) throw error;
      setCategories(prev => [...prev, data]);
      setNewCategoryName("");
      setSelectedCategoryIcon("Layout");
      setIsCategoryModalOpen(false);

    } catch (err: any) {
      toast.error("Erro ao criar tópico: " + err.message);
    }
  };

  const handleCreateCategoryDirectly = async () => {
    if (!currentWorkspace) return;
    if (categories.length >= 4) {
      return;
    }
    try {
      const { data, error } = await supabase
        .from("workspace_categories")
        .insert([{ 
          workspace_id: currentWorkspace.id, 
          name: "Novo Grupo",
          icon_name: "Layout"
        }])
        .select()
        .single();
      if (error) throw error;
      setCategories(prev => [...prev, data]);
      setRenamingCategoryId(data.id);
      setRenamingCategoryValue(data.name);
    } catch (err: any) {
      toast.error("Erro ao criar: " + err.message);
    }
  };


  const handleAddItem = async (category: string | null, title?: string) => {
    const finalTitle = title || newItemTitle.trim();
    if (!finalTitle || !currentWorkspace) {
      setIsAddingItem(null);
      return;
    }


    
    try {
      if (!user) return;

      const { data, error } = await supabase
        .from("checklists")
        .insert([{
          title: finalTitle,
          workspace_id: currentWorkspace.id,
          category: category,
          user_id: user.id,
          // Match the filter on line ~1027: an item is visible when its
          // view_type equals selectedSubTab, OR view_type is null/empty and
          // no subtab is selected. Saving "Tarefas" when there's no subtab
          // made new items invisible. Keep it null in that case.
          view_type: selectedSubTab || null,
        }])
        .select()
        .single();

      if (error) throw error;
      
      setChecklists(prev => [data, ...prev]);
      setNewItemTitle("");
      setIsAddingItem(null);

    } catch (err: any) {
      toast.error("Erro ao criar: " + err.message);
    }
  };


  const handleMoveToChecklist = async (checklistId: string, categoryName: string | null) => {
    if (!currentWorkspace) return;
    
    try {
      const { error } = await supabase
        .from("checklists")
        .update({ 
          category: categoryName,
          workspace_id: currentWorkspace.id,
          view_type: selectedSubTab || categoryName

        })
        .eq("id", checklistId);


      if (error) throw error;
      setChecklists(prev => prev.map(c => 
        c.id === checklistId ? { ...c, category: categoryName, workspace_id: currentWorkspace.id, view_type: selectedSubTab } : c
      ));
    } catch (err) {



      toast.error("Erro ao organizar checklist");
    }
  };

  const handleUpdateItemTitle = async (id: string, newTitle: string) => {
    try {
      const { error } = await supabase
        .from("checklists")
        .update({ title: newTitle, view_type: selectedSubTab })
        .eq("id", id);




      if (error) throw error;
      setChecklists(prev => prev.map(c => c.id === id ? { ...c, title: newTitle } : c));

    } catch (err: any) {
      toast.error("Erro ao atualizar: " + err.message);
    }
  };

  const handleAssignMember = async (checklistId: string, memberId: string | null) => {
    if (!currentWorkspace || !canManage) return;
    try {
      const payload: Database['public']['Functions']['update_checklist_assignments']['Args'] = {
        p_workspace_id: currentWorkspace.id,
        p_checklist_id: checklistId,
        p_member_ids: memberId ? [memberId] : [],
        ...(memberId ? { p_primary_member_id: memberId } : {})
      };
      
      const { error } = await supabase.rpc('update_checklist_assignments', payload);

      if (error) throw error;
      
      if (!memberId) {
        setAssignments(prev => prev.filter(a => a.checklist_id !== checklistId));
        toast.success("Responsável removido");
      } else {
        const { data: newAssignments, error: fetchError } = await supabase
          .from('checklist_assignments')
          .select('*')
          .eq('checklist_id', checklistId);
        
        if (fetchError) throw fetchError;

        setAssignments(prev => [
          ...prev.filter(a => a.checklist_id !== checklistId),
          ...(newAssignments || [])
        ]);
        toast.success("Responsável atribuído");
      }
      // Data is refreshed via state updates above, no need for fetchChecklists() call
    } catch (err: unknown) {
      console.error(err);
      const message = err instanceof Error ? err.message : 'Erro ao atribuir membro';
      toast.error(message);
    }
  };
  
  const handleSetDeadline = async (assignmentId: string, dueAt: string | null) => {
    if (!canManage) return;
    try {
      const { error } = await supabase.rpc('set_assignment_deadline', {
        p_assignment_id: assignmentId,
        p_due_at: dueAt as string // Casting because migration allows NULL but types might be strict
      });

      if (error) throw error;
      
      setAssignments(prev => prev.map(a => 
        a.id === assignmentId ? { ...a, due_at: dueAt } : a
      ));
      toast.success(dueAt ? "Prazo definido" : "Prazo removido");
    } catch (err: any) {
      toast.error("Erro ao definir prazo: " + err.message);
    }
  };



  const handleDeleteChecklist = async () => {

    if (!checklistToDelete) return;
    const { error } = await supabase.from("checklists").delete().eq("id", checklistToDelete.id);
    if (!error) {
      setChecklists(prev => prev.filter(c => c.id !== checklistToDelete.id));
      setChecklistToDelete(null);

      if (selectedId === checklistToDelete.id) {
        navigate({ to: "/organizar" });
      }
    }
  };

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  };

  const handleDragOver = (event: DragOverEvent) => {
    const { active, over } = event;
    if (!over) return;

    const activeId = active.id as string;
    const overId = over.id as string;

    const activeItem = checklists.find(c => c.id === activeId);
    if (!activeItem) return;

    // Find target category
    let targetCategory: string | null = activeItem.category;
    if (overId.startsWith("cat-") || overId.startsWith("droppable-")) {
      const actualId = overId.replace("cat-", "").replace("droppable-", "");
      // If it's the unassigned column, it should be null
      const actualCatName = (actualId === 'unassigned') ? null : actualId;
      
      // We need to find the category object if actualId is an ID, or use it as name if it's the name
      // The droppable- ID is currently cat.id
      const categoryObj = categories.find(cat => cat.id === actualId);
      targetCategory = categoryObj ? categoryObj.name : actualCatName;
    } else {
      const overItem = checklists.find(c => c.id === overId);
      if (overItem) targetCategory = overItem.category;
    }

    if (activeItem.category !== targetCategory) {
      setChecklists((items) => {
        return items.map(item => 
          item.id === activeId ? { ...item, category: targetCategory } : item
        );
      });
    }
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveId(null);

    if (!over) return;

    const currentActiveId = active.id as string;
    const activeChecklist = checklists.find(c => c.id === currentActiveId);
    if (!activeChecklist) return;

    const overId = over.id as string;
    
    let targetCategory: string | null = activeChecklist.category;
    if (overId.startsWith("cat-") || overId.startsWith("droppable-")) {
      const actualId = overId.replace("cat-", "").replace("droppable-", "");
      const actualCatName = (actualId === 'unassigned') ? null : actualId;
      const categoryObj = categories.find(cat => cat.id === actualId);
      targetCategory = categoryObj ? categoryObj.name : actualCatName;
    } else {
      const overChecklist = checklists.find(c => c.id === overId);
      if (overChecklist) targetCategory = overChecklist.category;
    }

    // Persist to database if category changed
    if (targetCategory !== activeChecklist.category) {
      handleMoveToChecklist(currentActiveId, targetCategory);
    }

    // Reorder within the same category if needed
    if (active.id !== over.id && !overId.startsWith("cat-") && !overId.startsWith("droppable-")) {
      setChecklists((items) => {
        const oldIndex = items.findIndex((i) => i.id === active.id);
        const newIndex = items.findIndex((i) => i.id === over.id);
        return arrayMove(items, oldIndex, newIndex);
      });
    }
  };


  const handleDeleteWorkspace = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (workspaces.length <= 1) {
      toast.error("Você deve ter pelo menos um workspace");
      return;
    }
    
    

    try {
      const { error } = await supabase.from("workspaces").delete().eq("id", id);
      if (error) throw error;
      
      toast.success("Workspace excluído");
      await refreshWorkspaces();
      
      // If the deleted workspace was the active one, find another one to navigate to
      if (currentWorkspace?.id === id) {
        const remainingWorkspaces = workspaces.filter((w: any) => w.id !== id);
        if (remainingWorkspaces.length > 0) {
          const nextWorkspace = remainingWorkspaces[0];

          // Update the context state immediately
          setCurrentWorkspace(nextWorkspace);
          // Navigate to the same route but without the old workspace ID in search params
          // This ensures the URL is cleaned up and the workspace context handles the switch
          navigate({ 
            to: "/organizar", 
            search: { id: undefined },
            replace: true
          });
        }
      }
    } catch (err) {
      console.error(err);
      toast.error("Erro ao excluir workspace");
    }
  };

  const handleUpdateWorkspaceName = async () => {

    if (!currentWorkspace || !editingTitleValue.trim()) {
      setIsEditingTitle(false);
      return;
    }

    if (editingTitleValue === currentWorkspace.name) {
      setIsEditingTitle(false);
      return;
    }

    try {
      const { error } = await supabase
        .from("workspaces")
        .update({ name: editingTitleValue.trim() })
        .eq("id", currentWorkspace.id);

      if (error) throw error;
      await refreshWorkspaces();
    } catch (err: any) {
      toast.error("Erro ao atualizar nome: " + err.message);
    } finally {
      setIsEditingTitle(false);
    }
  };

  const handleRenameCategory = async (id: string, newName: string) => {
    if (!newName.trim()) return;
    try {
      const { error } = await supabase
        .from("workspace_categories")
        .update({ name: newName.trim() })
        .eq("id", id);
      if (error) throw error;
      setCategories(prev => prev.map(c => c.id === id ? { ...c, name: newName.trim() } : c));
      if (selectedSubTab === categories.find(c => c.id === id)?.name) {
        setSelectedSubTab(newName.trim());
      }
      // toast.success("Categoria renomeada!");
    } catch (err: any) {
      toast.error("Erro ao renomear: " + err.message);
    } finally {
      setRenamingCategoryId(null);
    }
  };

  const handleDuplicateCategory = async (cat: Category) => {
    if (categories.length >= 4) {
      return;
    }
    try {
      const { data, error } = await supabase
        .from("workspace_categories")
        .insert([{
          workspace_id: cat.workspace_id as string,
          name: `${cat.name} (Cópia)`,
          icon_name: cat.icon_name
        }])

        .select()
        .single();
      if (error) throw error;
      setCategories(prev => [...prev, data]);

    } catch (err: any) {
      toast.error("Erro ao duplicar: " + err.message);
    }
  };

  const handleDeleteCategory = async (id: string) => {
    try {
      const { error } = await supabase
        .from("workspace_categories")
        .delete()
        .eq("id", id);
      if (error) throw error;
      setCategories(prev => prev.filter(c => c.id !== id));

    } catch (err: any) {
      toast.error("Erro ao excluir: " + err.message);
    }
  };

  const handleCopyWorkspaceLink = () => {
    const url = window.location.href;
    navigator.clipboard.writeText(url);

  };

  const handlePrevTab = () => {
    if (workspaces.length <= 1) return;
    const currentIndex = workspaces.findIndex((w: any) => w.id === currentWorkspace?.id);

    if (currentIndex !== -1) {
      const prevIndex = (currentIndex - 1 + workspaces.length) % workspaces.length;
      setCurrentWorkspace(workspaces[prevIndex]);
    }
  };

  const handleNextTab = () => {
    if (workspaces.length <= 1) return;
    const currentIndex = workspaces.findIndex((w: any) => w.id === currentWorkspace?.id);
    if (currentIndex !== -1) {
      const nextIndex = (currentIndex + 1) % workspaces.length;
      setCurrentWorkspace(workspaces[nextIndex]);
    }
  };



  const handleUpdateIcon = async (iconName: string) => {
    if (!currentWorkspace) return;
    try {
      const { error } = await supabase
        .from("workspaces")
        .update({ 
          icon: iconName,
          icon_url: null 
        })
        .eq("id", currentWorkspace.id);
      
      if (error) throw error;
      await refreshWorkspaces();
      setIsIconPickerOpen(false);

    } catch (err: any) {
      toast.error("Erro ao atualizar ícone: " + err.message);
    }
  };

  const handleUpdateCategoryIcon = async (categoryId: string, iconName: string) => {
    try {
      const { error } = await supabase
        .from("workspace_categories")
        .update({ icon_name: iconName })
        .eq("id", categoryId);
      
      if (error) throw error;
      setCategories(prev => prev.map(c => c.id === categoryId ? { ...c, icon_name: iconName } : c));
    } catch (err: any) {
      toast.error("Erro ao atualizar ícone da categoria: " + err.message);
    }
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !currentWorkspace) return;

    try {
      const fileExt = file.name.split('.').pop();
      const filePath = `${currentWorkspace.id}/icon.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from('workspace-assets')
        .upload(filePath, file, { upsert: true });

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('workspace-assets')
        .getPublicUrl(filePath);

      const { error: updateError } = await supabase
        .from("workspaces")
        .update({ icon_url: publicUrl, icon: null })
        .eq("id", currentWorkspace.id);

      if (updateError) throw updateError;
      
      await refreshWorkspaces();

    } catch (err: any) {
      toast.error("Erro no upload: " + err.message);
    }
  };

  const startEditingTitle = () => {
    setEditingTitleValue(currentWorkspace?.name || "");
    setIsEditingTitle(true);
  };

  const filteredChecklists = checklists.filter(c => {
    const matchesSearch = (c.title || "").toLowerCase().includes(searchQuery.toLowerCase());
    const isUnassigned = !c.view_type && (!selectedSubTab || selectedSubTab === "Tarefas");
    const matchesTab = selectedSubTab === "Atribuições" || c.view_type === selectedSubTab || isUnassigned;
    return matchesSearch && matchesTab;
  });



  if (workspaceLoading) return null;

  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, []);

  return (
    <DashboardLayout>
      <div className="flex flex-col h-full max-h-screen overflow-hidden bg-white">
        <div className="bg-[#FEE2E2] shrink-0 overflow-hidden">
          <header className="flex items-center justify-between px-2 pt-1 h-9 overflow-hidden">
            <div className="flex items-center gap-1 h-full overflow-hidden">
              <div className="flex items-center gap-0.5 px-2 mr-1">
                <button onClick={handlePrevTab} className="p-1 rounded hover:bg-black/5 text-neutral-500 transition-colors"><ArrowLeft className="w-3.5 h-3.5" /></button>
                <button onClick={handleNextTab} className="p-1 rounded hover:bg-black/5 text-neutral-500 transition-colors"><ArrowRight className="w-3.5 h-3.5" /></button>
              </div>
              
              <div className="flex items-center gap-1 h-8 overflow-x-auto overflow-y-hidden no-scrollbar max-w-full">
                {workspaces.map((ws: any) => {
                  const isActive = ws.id === currentWorkspace?.id;
                  return (
                    <div 
                      key={ws.id}
                      onClick={() => setCurrentWorkspace(ws)}
                      className={`flex items-center h-[34px] px-3 rounded-t-lg border-x border-t transition-all cursor-pointer relative top-[1px] min-w-[120px] max-w-[200px] group ${
                        isActive 
                          ? "bg-white border-neutral-200/60 shadow-[0_-1px_2px_rgba(0,0,0,0.02)] z-10" 
                          : "bg-black/5 border-transparent hover:bg-black/10"
                      }`}
                    >
                      <div className="flex items-center gap-2 overflow-hidden flex-1">
                        <div className="w-4 h-4 bg-[#E16259] rounded flex items-center justify-center shrink-0 overflow-hidden">
                          {ws.icon_url ? (
                            <img src={ws.icon_url} alt="Icon" className="w-full h-full object-cover" />
                          ) : (
                            (() => {
                              const iconName = ws.icon || 'Files';
                              const IconMap: Record<string, any> = { Files, Layout, BarChart3, Settings, MessageSquare, Bell, Globe, Users };
                              const Icon = IconMap[iconName] || Files;
                              return <Icon className="w-2.5 h-2.5 text-white" />;
                            })()
                          )}
                        </div>
                        <span className={`text-[11px] font-medium truncate ${isActive ? 'text-neutral-700' : 'text-neutral-500'}`}>
                          {ws.name}
                        </span>
                      </div>
                      <button 
                        onClick={(e) => handleDeleteWorkspace(ws.id, e)}
                        className="opacity-0 group-hover:opacity-100 p-0.5 rounded-sm hover:bg-black/10 text-neutral-400 hover:text-neutral-600 transition-all ml-1"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  );
                })}
                <button 
                  onClick={handleCreateNewWorkspaceFromHeader} 
                  className="p-1 rounded hover:bg-white/50 text-neutral-400 ml-1 shrink-0 transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </header>
          
          <div className="flex items-center justify-end gap-1 pr-3 py-1 bg-white">
            <button className="px-2.5 py-1 text-[11px] font-semibold text-neutral-600 hover:bg-neutral-100 rounded-md transition-colors">Compartilhar</button>
            <button className="p-1.5 rounded-md hover:bg-neutral-100 text-neutral-500 transition-colors"><MessageCircle className="w-4 h-4" /></button>
            <button className="p-1.5 rounded-md hover:bg-neutral-100 text-neutral-500 transition-colors"><Star className="w-4 h-4" /></button>
            <button className="p-1.5 rounded-md hover:bg-neutral-100 text-neutral-500 transition-colors"><MoreHorizontal className="w-4 h-4" /></button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto bg-white pt-12">
          <div className="max-w-full mx-auto px-[4.25rem] pb-20">
            {/* Title Section */}
            <div className="flex items-center gap-6 mb-12">
              <DropdownMenu open={isIconPickerOpen} onOpenChange={setIsIconPickerOpen}>
                <DropdownMenuTrigger asChild>
                  <div 
                    className="w-24 h-24 bg-neutral-50 rounded-3xl flex items-center justify-center shrink-0 cursor-pointer hover:bg-neutral-100 transition-colors group relative"
                    onClick={() => setIsIconPickerOpen(true)}
                  >
                    <div className="w-14 h-14 bg-[#E16259] rounded-xl flex items-center justify-center overflow-hidden">
                      {currentWorkspace?.icon_url ? (
                        <img src={currentWorkspace.icon_url} alt="Icon" className="w-full h-full object-cover" />
                      ) : (
                        (() => {
                          const iconName = currentWorkspace?.icon || 'Files';
                          const IconMap: Record<string, any> = { Files, Layout, BarChart3, Settings, MessageSquare, Bell, Globe, Users };
                          const Icon = IconMap[iconName] || Files;
                          return <Icon className="w-9 h-9 text-white" />;
                        })()
                      )}
                    </div>
                    <div className="absolute inset-0 flex items-center justify-center bg-black/5 opacity-0 group-hover:opacity-100 rounded-3xl transition-opacity">
                      <Pencil className="w-5 h-5 text-neutral-500" />
                    </div>
                  </div>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-64 p-3">
                  <div className="text-xs font-semibold text-neutral-400 mb-3 uppercase tracking-wider">Biblioteca de Ícones</div>
                  <div className="grid grid-cols-4 gap-2 mb-4">
                    {[
                      { icon: Files, name: 'Files' },
                      { icon: Layout, name: 'Layout' },
                      { icon: BarChart3, name: 'BarChart3' },
                      { icon: Settings, name: 'Settings' },
                      { icon: MessageSquare, name: 'MessageSquare' },
                      { icon: Bell, name: 'Bell' },
                      { icon: Globe, name: 'Globe' },
                      { icon: Users, name: 'Users' }
                    ].map((item: any, i) => (
                      <button 
                        key={i}
                        onClick={() => {
                          handleUpdateIcon(item.name);
                          setIsIconPickerOpen(false);
                        }}
                        className="p-2 rounded-lg hover:bg-neutral-100 flex items-center justify-center transition-colors"
                      >
                        <item.icon className="w-5 h-5 text-neutral-600" />
                      </button>
                    ))}
                  </div>
                  <DropdownMenuSeparator />
                  <div className="mt-2">
                    <label className="flex items-center gap-2 w-full px-2 py-1.5 text-sm text-neutral-600 cursor-pointer hover:bg-neutral-100 rounded-md transition-colors">
                      <Plus className="w-4 h-4" />
                      <span>Upload de imagem</span>
                      <input type="file" className="hidden" accept="image/*" onChange={handleImageUpload} />
                    </label>
                  </div>
                </DropdownMenuContent>
              </DropdownMenu>

              {isEditingTitle ? (
                <input
                  autoFocus
                  className="text-5xl font-bold text-neutral-900 tracking-tight bg-transparent border-none outline-none focus:ring-0 p-0 w-full"
                  placeholder="Título aqui"
                  value={editingTitleValue}
                  onChange={(e) => setEditingTitleValue(e.target.value)}
                  onBlur={handleUpdateWorkspaceName}
                  onKeyDown={(e) => e.key === "Enter" && handleUpdateWorkspaceName()}
                />
              ) : (
                <h1 
                  className="text-5xl font-bold text-neutral-900 tracking-tight cursor-pointer hover:opacity-80"
                  onClick={canManage ? startEditingTitle : undefined}
                >
                  {currentWorkspace?.name || "Título aqui"}
                </h1>
              )}
            </div>

            {/* Sub-nav Tabs */}
            <div className="flex items-center justify-between mb-8">
              <div className="flex items-center gap-1 overflow-x-auto overflow-y-hidden no-scrollbar pb-1">
                {/* Categorias dinâmicas */}



                {categories.map((cat: any) => {
                  const IconMap: Record<string, any> = { Files, Layout, BarChart3, Settings, MessageSquare, Bell, Globe, Users, CheckSquare, Calendar, Clock, UserIcon, Rows };
                  const Icon = IconMap[cat.icon_name || 'Layout'] || Layout;
                  return (
                    <ContextMenu key={cat.id}>
                      <ContextMenuTrigger asChild>
                        <div 
                          onClick={() => setSelectedSubTab(cat.name)}
                          className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap group transition-colors cursor-pointer ${selectedSubTab === cat.name ? "bg-neutral-100 text-neutral-700" : "hover:bg-neutral-50 text-neutral-500"}`}
                        >
                          <Icon className="w-4 h-4" />
                          <span>{cat.name}</span>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteCategory(cat.id);
                            }}
                            className="p-0.5 rounded-md hover:bg-neutral-200 text-neutral-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all ml-1"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                      </ContextMenuTrigger>
                      <ContextMenuContent className="w-56 bg-[#1a1a1a] border-neutral-800 text-neutral-300 p-1.5 rounded-xl shadow-2xl">
                        <ContextMenuItem className="gap-2 text-xs hover:bg-neutral-800 rounded-lg py-2" onClick={() => {
                          setRenamingCategoryId(cat.id);
                          setRenamingCategoryValue(cat.name);
                        }}>
                          <Edit2 className="w-4 h-4" /> Renomear
                        </ContextMenuItem>
                        <ContextMenuSub>
                          <ContextMenuSubTrigger className="gap-2 text-xs hover:bg-neutral-800 rounded-lg py-2">
                            <Eye className="w-4 h-4" /> Exibir como
                          </ContextMenuSubTrigger>
                          <ContextMenuPortal>
                            <ContextMenuSubContent className="w-48 bg-[#1a1a1a] border-neutral-800 text-neutral-300">
                              <ContextMenuItem className="text-xs hover:bg-neutral-800">Apenas texto</ContextMenuItem>
                              <ContextMenuItem className="text-xs hover:bg-neutral-800">Apenas ícone</ContextMenuItem>
                              <ContextMenuItem className="text-xs hover:bg-neutral-800">Texto e ícone</ContextMenuItem>
                            </ContextMenuSubContent>
                          </ContextMenuPortal>
                        </ContextMenuSub>
                        <ContextMenuItem className="gap-2 text-xs hover:bg-neutral-800 rounded-lg py-2" onClick={() => setViewSettingsOpen(true)}>
                          <Palette className="w-4 h-4" /> Editar visualização
                        </ContextMenuItem>
                        <ContextMenuSeparator className="bg-neutral-800 my-1" />
                        <ContextMenuItem className="gap-2 text-xs hover:bg-neutral-800 rounded-lg py-2" onClick={handleCopyWorkspaceLink}>
                          <LinkIcon className="w-4 h-4" /> Copiar link
                        </ContextMenuItem>
                        <ContextMenuItem className="gap-2 text-xs hover:bg-neutral-800 rounded-lg py-2" onClick={() => handleDuplicateCategory(cat)}>
                          <CopyIcon2 className="w-4 h-4" /> Duplicar visualização
                        </ContextMenuItem>
                        <ContextMenuSeparator className="bg-neutral-800 my-1" />
                        <ContextMenuItem 
                          className="gap-2 text-xs text-red-400 hover:bg-red-950/30 hover:text-red-400 rounded-lg py-2"
                          onClick={() => handleDeleteCategory(cat.id)}
                        >
                          <Trash className="w-4 h-4" /> Excluir visualização
                        </ContextMenuItem>
                      </ContextMenuContent>
                    </ContextMenu>
                  );
                })}





                <div 
                  onClick={() => setSelectedSubTab("Atribuições")}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap group transition-colors cursor-pointer ${selectedSubTab === "Atribuições" ? "bg-neutral-100 text-neutral-700" : "hover:bg-neutral-50 text-neutral-500"}`}
                >
                  <Users className="w-4 h-4" />
                  <span>Atribuições</span>
                </div>

                {canManage && categories.length < 4 && (
                  <button 
                    onClick={() => setIsCategoryModalOpen(true)}
                    className="p-1.5 text-neutral-400 hover:bg-neutral-50 rounded-lg ml-1 shrink-0"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                )}
              </div>

              <div className="flex items-center gap-1 shrink-0">
                <button className="p-2 text-neutral-400 hover:bg-neutral-50 rounded-lg"><ArrowUpDown className="w-4 h-4" /></button>
                <button className="p-2 text-neutral-400 hover:bg-neutral-50 rounded-lg"><Filter className="w-4 h-4" /></button>
                <button className="p-2 text-neutral-400 hover:bg-neutral-50 rounded-lg"><Search className="w-4 h-4" /></button>
                <button className="p-2 text-neutral-400 hover:bg-neutral-50 rounded-lg"><Maximize2 className="w-4 h-4" /></button>
                <button className="p-2 text-neutral-400 hover:bg-neutral-50 rounded-lg"><MoreHorizontal className="w-4 h-4" /></button>
                {canManage && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button className="bg-[#1D7AFC] hover:bg-[#1D7AFC]/90 text-white rounded-lg px-3 py-1.5 h-auto text-sm font-medium gap-1 ml-2">
                        Novo
                        <ChevronDown className="w-3.5 h-3.5" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent>
                      <DropdownMenuItem onClick={() => navigate({ to: "/checklist", search: { workspace: currentWorkspace?.id } })}>Novo Checklist</DropdownMenuItem>
                      {categories.length < 4 && (
                        <DropdownMenuItem onClick={() => setIsCategoryModalOpen(true)}>Nova Categoria</DropdownMenuItem>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </div>
            </div>

            {/* Main Content */}
            {selectedSubTab === "Atribuições" ? (
              <div className="mt-4 border border-neutral-100 rounded-xl overflow-hidden shadow-sm bg-white overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead className="bg-neutral-50 border-b border-neutral-100">
                    <tr>
                      <th className="px-6 py-3 text-xs font-bold uppercase text-neutral-500 tracking-wider min-w-[200px]">Checklist</th>
                      <th className="px-6 py-3 text-xs font-bold uppercase text-neutral-500 tracking-wider">Responsável</th>
                      <th className="px-6 py-3 text-xs font-bold uppercase text-neutral-500 tracking-wider">Participantes</th>
                      <th className="px-6 py-3 text-xs font-bold uppercase text-neutral-500 tracking-wider text-right">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-100">
                    {checklists.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="px-6 py-10 text-center text-neutral-500 text-sm">Nenhum checklist encontrado.</td>
                      </tr>
                    ) : (
                      checklists.map((chk) => {
                        const chkAssignments = assignments.filter(a => a.checklist_id === chk.id);
                        const primary = chkAssignments.find(a => a.is_primary);
                        const participants = chkAssignments.filter(a => !a.is_primary);
                        
                        return (
                          <tr key={chk.id} className="hover:bg-neutral-50/50 transition-colors">
                            <td className="px-6 py-4">
                              <div className="flex flex-col gap-0.5">
                                <span className="text-sm font-medium text-neutral-900">{chk.title || 'Sem título'}</span>
                                <span className="text-[10px] text-neutral-400 uppercase font-bold">{chk.category || 'Tarefas'}</span>
                              </div>
                            </td>
                            <td className="px-6 py-4">
                              {primary ? (() => {
                                const member = members.find(m => m.id === primary.workspace_member_id);
                                return (
                                  <div className="flex items-center gap-2">
                                    <div className="w-6 h-6 rounded-full bg-neutral-100 overflow-hidden border border-neutral-200 shrink-0">
                                      {member?.profiles?.avatar_url && <img src={member.profiles.avatar_url} className="w-full h-full object-cover" />}
                                    </div>
                                    <span className="text-xs text-neutral-700 truncate max-w-[120px]">
                                      {member?.profiles?.display_name || member?.email_normalized || 'Desconhecido'}
                                    </span>
                                  </div>
                                );
                              })() : (
                                <span className="text-xs text-neutral-400 italic">Sem responsável</span>
                              )}
                            </td>
                            <td className="px-6 py-4">
                              <div className="flex -space-x-2">
                                {participants.slice(0, 3).map(a => {
                                  const member = members.find(m => m.id === a.workspace_member_id);
                                  return (
                                    <div key={a.id} className="w-6 h-6 rounded-full bg-white border border-neutral-200 overflow-hidden flex items-center justify-center shrink-0" title={member?.profiles?.display_name || ''}>
                                      {member?.profiles?.avatar_url ? (
                                        <img src={member.profiles.avatar_url} className="w-full h-full object-cover" />
                                      ) : (
                                        <UserIcon className="w-3 h-3 text-neutral-400" />
                                      )}
                                    </div>
                                  );
                                })}
                                {participants.length > 3 && (
                                  <div className="w-6 h-6 rounded-full bg-neutral-100 border border-neutral-200 flex items-center justify-center shrink-0">
                                    <span className="text-[10px] font-bold text-neutral-500">+{participants.length - 3}</span>
                                  </div>
                                )}
                                {participants.length === 0 && <span className="text-xs text-neutral-400">-</span>}
                              </div>
                            </td>
                            <td className="px-6 py-4 text-right">
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button variant="ghost" size="sm" className="h-8 px-2 text-xs gap-1.5">
                                    <Edit2 className="w-3.5 h-3.5" />
                                    Atribuir
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end" className="w-56 p-1">
                                  <div className="px-2 py-1.5 text-[10px] font-bold text-neutral-400 uppercase tracking-wider">Responsável Principal</div>
                                  {members.map(member => {
                                    const isPrimary = primary?.workspace_member_id === member.id;
                                    return (
                                      <DropdownMenuItem 
                                        key={member.id} 
                                        className="flex items-center justify-between gap-2 text-xs py-2"
                                        onClick={() => handleAssignMember(chk.id, isPrimary ? null : member.id)}
                                      >
                                        <div className="flex items-center gap-2">
                                          <div className="w-5 h-5 rounded-full bg-neutral-100 overflow-hidden shrink-0">
                                            {member.profiles?.avatar_url && <img src={member.profiles.avatar_url} className="w-full h-full object-cover" />}
                                          </div>
                                          <span className="truncate max-w-[120px]">{member.profiles?.display_name || 'Membro'}</span>
                                        </div>
                                        {isPrimary && <CheckCircle2 className="w-3.5 h-3.5 text-pink-500" />}
                                      </DropdownMenuItem>
                                    );
                                  })}
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem 
                                    className="text-xs text-red-600 focus:text-red-600"
                                    onClick={() => handleAssignMember(chk.id, null)}
                                  >
                                    Remover todos
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            ) : (
              <DndContext 
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragStart={handleDragStart}
                onDragOver={handleDragOver}
                onDragEnd={handleDragEnd}
                modifiers={[restrictToWindowEdges]}
              >

              <div className="flex gap-6 items-start overflow-x-auto overflow-y-hidden pb-4 no-scrollbar">
                {[{ id: 'unassigned', name: 'Tarefas' }, ...categories].map((cat, idx) => {
                  const isUnassigned = cat.id === 'unassigned';
                  const categoryName = isUnassigned ? null : cat.name;
                  const catItems = filteredChecklists.filter(c => c.category === categoryName);
                  
                  const COLUMN_COLORS = [
                    { main: '#9333ea', bg: '#f5f3ff', text: '#7e22ce' }, // Roxo
                    { main: '#ea580c', bg: '#fff7ed', text: '#c2410c' }, // Laranja
                    { main: '#2563eb', bg: '#eff6ff', text: '#1d4ed8' }, // Azul
                    { main: '#16a34a', bg: '#f0fdf4', text: '#15803d' }, // Verde
                    { main: '#dc2626', bg: '#fef2f2', text: '#b91c1c' }, // Vermelho
                  ];
                  
                  const colorConfig = COLUMN_COLORS[idx % COLUMN_COLORS.length];
                  const currentColor = colorConfig.main;
                  const currentBg = colorConfig.bg;
                  const currentText = colorConfig.text;

                  return (
                    <div key={cat.id} id={`cat-${cat.id}`} className={`w-[280px] flex-shrink-0 flex flex-col transition-colors duration-300 rounded-2xl`}>
                      <div className="flex items-center justify-between mb-4 px-1 group">
                        <div className="flex items-center gap-2">
                          {canManage && categories.length < 4 && (
                            <button 
                              onClick={(e) => {
                                e.stopPropagation();
                                handleCreateCategoryDirectly();
                              }}
                              className="w-4 h-4 rounded-md bg-neutral-100 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-neutral-200"
                            >
                              <Plus className="w-2.5 h-2.5 text-neutral-500" />
                            </button>
                          )}
                          {/* Botão Plus da categoria só se canManage */}
                          <div 
                            className="px-2 py-0.5 rounded text-[11px] font-bold flex items-center gap-1.5 cursor-pointer"
                            style={{ backgroundColor: currentBg, color: currentText }}
                            onClick={canManage ? () => {
                              if (!isUnassigned) {
                                setRenamingCategoryId(cat.id);
                                setRenamingCategoryValue(cat.name);
                              }
                            } : undefined}
                          >
                            <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: currentColor }} />
                            {renamingCategoryId === cat.id ? (
                              <input
                                autoFocus
                                className="bg-transparent border-none outline-none focus:ring-0 p-0 text-[11px] font-bold w-20"
                                style={{ color: currentText }}
                                value={renamingCategoryValue}
                                onChange={(e) => setRenamingCategoryValue(e.target.value)}
                                onBlur={() => handleRenameCategory(cat.id, renamingCategoryValue)}
                                onKeyDown={(e) => e.key === "Enter" && handleRenameCategory(cat.id, renamingCategoryValue)}
                                onClick={(e) => e.stopPropagation()}
                              />
                            ) : (
                              cat.name || "Tarefas"
                            )}
                          </div>
                          <span className="text-xs font-medium text-neutral-400">{catItems.length}</span>
                        </div>
                        <div className="flex items-center gap-1">
                          {canManage && (
                            <button 
                              onClick={() => handleAddItem(categoryName, "Nova tarefa")}
                              className="p-1 text-neutral-300 hover:text-neutral-500 rounded hover:bg-neutral-50 transition-colors"
                            >
                              <Plus className="w-3.5 h-3.5" />
                            </button>
                          )}
                          {canManage && (
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <button className="p-1 text-neutral-300 hover:text-neutral-500 rounded hover:bg-neutral-50 transition-colors">
                                  <MoreHorizontal className="w-3.5 h-3.5" />
                                </button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent className="w-48 bg-[#1a1a1a] border-neutral-800 text-neutral-300 p-1 rounded-xl shadow-2xl">
                                <DropdownMenuItem className="gap-3 text-xs hover:bg-neutral-800 rounded-lg py-2">
                                  <Rows className="w-4 h-4" /> Editar grupos
                                </DropdownMenuItem>
                                <DropdownMenuItem className="gap-3 text-xs hover:bg-neutral-800 rounded-lg py-2">
                                  <EyeOff className="w-4 h-4" /> Ocultar agregação
                                </DropdownMenuItem>
                                <DropdownMenuItem className="gap-3 text-xs hover:bg-neutral-800 rounded-lg py-2">
                                  <EyeOff className="w-4 h-4" /> Ocultar grupo
                                </DropdownMenuItem>
                                <DropdownMenuItem 
                                  className="gap-3 text-xs text-red-400 hover:bg-red-950/30 hover:text-red-400 rounded-lg py-2"
                                  onClick={() => {
                                    if (!isUnassigned) {
                                      handleDeleteCategory(cat.id);
                                    }
                                  }}
                                >
                                  <Trash2 className="w-4 h-4" /> Mover para a lixeira
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          )}
                        </div>
                      </div>


                      <DroppableColumn 
                        id={`droppable-${cat.id}`}
                        className={`flex flex-col gap-2 p-2 rounded-2xl transition-colors duration-300`}
                        style={{ backgroundColor: `${currentColor}08` }}
                      >
                        <SortableContext 
                          items={catItems.map(i => i.id)} 
                          strategy={verticalListSortingStrategy}
                        >
                          {catItems.map(item => (
                            <SortableChecklistCard 
                              key={item.id}
                              checklist={item}
                              isSelected={selectedId === item.id}
                              onSelect={() => {}} // Painel desativado conforme solicitado
                              submissionCount={submissionCounts[item.id] || 0}
                              categories={categories}
                              onMove={handleMoveToChecklist}
                              onDelete={(chk) => setChecklistToDelete(chk)}
                              onEdit={(id) => navigate({ to: "/checklist", search: { id } })}
                              onUpdateTitle={handleUpdateItemTitle}
                              onCopyLink={handleCopyWorkspaceLink}
                              onDuplicate={(item) => {
                                // Basic duplication logic
                                handleAddItem(item.category, `${item.title} (Cópia)`);
                              }}
                              accentColor={currentColor}
                              assignments={assignments}
                              members={members}
                              onAssign={handleAssignMember}
                              onSetDeadline={handleSetDeadline}
                              canManage={canManage}
                            />
                          ))}


                        </SortableContext>
                        
                        {isAddingItem?.category === categoryName && (
                          <div className="bg-white p-4 rounded-xl border shadow-sm animate-in fade-in zoom-in duration-200" style={{ borderColor: currentColor }}>
                            <input
                              autoFocus
                              className="w-full text-[13px] font-medium text-neutral-800 outline-none placeholder:text-neutral-300"
                              placeholder="Título da tarefa..."
                              value={newItemTitle}
                              onChange={(e) => setNewItemTitle(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') handleAddItem(categoryName);
                                if (e.key === 'Escape') {
                                  setIsAddingItem(null);
                                  setNewItemTitle("");
                                }
                              }}
                              onBlur={() => {
                                if (newItemTitle.trim()) {
                                  handleAddItem(categoryName);
                                } else {
                                  setIsAddingItem(null);
                                }
                              }}

                            />
                          </div>
                        )}

                        {canManage && (!isAddingItem || isAddingItem.category !== categoryName) ? (
                          <button 
                            onClick={() => {
                              setIsAddingItem({ category: categoryName });
                              setNewItemTitle("");
                            }}
                            className="flex items-center gap-2 px-3 py-2 text-sm text-neutral-400 hover:bg-neutral-50 rounded-xl transition-colors mt-1"
                          >
                            <Plus className="w-4 h-4" />
                            <span>Nova tarefa</span>
                          </button>
                        ) : null}

                      </DroppableColumn>
                    </div>
                  );
                })}
              </div>
              
              <DragOverlay adjustScale={false} dropAnimation={{
                duration: 200,
                easing: 'cubic-bezier(0.2, 0, 0, 1)',
              }}>
                {activeId ? (() => {
                  const activeItem = checklists.find(c => c.id === activeId);
                  // Deve espelhar COLUMN_COLORS: [Roxo(Tarefas), Laranja, Azul, Verde, Vermelho]
                  const colors = ['#9333ea', '#ea580c', '#2563eb', '#16a34a', '#dc2626'];
                  const catIndex = categories.findIndex(cat => cat.name === activeItem?.category);
                  const activeColor = activeItem?.category ? colors[(catIndex + 1) % colors.length] : colors[0];
                  
                  return (
                    <div 
                      className="bg-white p-4 rounded-xl border-[2.5px] shadow-2xl cursor-grabbing w-[280px] transition-all duration-200"
                      style={{ 
                        borderColor: activeColor,
                        boxShadow: `0 0 25px ${activeColor}30, 0 10px 40px -10px rgba(0,0,0,0.15)`,
                        animation: 'glow 2s infinite alternate'
                      }}
                    >
                      <h4 className="text-[13px] font-medium text-neutral-800 line-clamp-2">
                        {activeItem?.title || "Sem título"}
                      </h4>
                      <style>{`
                        @keyframes glow {
                          from { box-shadow: 0 0 10px ${activeColor}20, 0 10px 30px -10px rgba(0,0,0,0.1); }
                          to { box-shadow: 0 0 25px ${activeColor}40, 0 10px 40px -10px rgba(0,0,0,0.15); }
                        }
                      `}</style>
                    </div>
                  );

                })() : null}
              </DragOverlay>




            </DndContext>
            )}

          </div>
        </div>


        <Dialog open={isCategoryModalOpen} onOpenChange={setIsCategoryModalOpen}>
          <DialogContent className="sm:max-w-[450px] rounded-[2rem] p-10 backdrop-blur-sm bg-white/90">
            <DialogHeader>
              <DialogTitle className="text-2xl font-bold">Criar novo tópico</DialogTitle>
            </DialogHeader>
            <form onSubmit={(e) => handleCreateCategory(e)} className="space-y-8 pt-4">
              <div className="space-y-3">
                <label className="text-[10px] font-bold text-neutral-400 uppercase tracking-[0.2em] ml-1">Nome do Tópico</label>
                <Input 
                  autoFocus 
                  value={newCategoryName} 
                  onChange={(e) => setNewCategoryName(e.target.value)}
                  placeholder="Ex: Tarefas, Em andamento..."
                  className="h-14 rounded-2xl bg-neutral-50 border-neutral-200 text-base px-5 focus:ring-pink-500"
                />
              </div>

              <div className="space-y-3">
                <label className="text-[10px] font-bold text-neutral-400 uppercase tracking-[0.2em] ml-1">Ícone representativo</label>
                <div className="grid grid-cols-6 gap-2 p-4 bg-neutral-50 rounded-2xl border border-neutral-100">
                  {[
                    { icon: Rows, name: 'Rows' },
                    { icon: CheckSquare, name: 'CheckSquare' },
                    { icon: Layout, name: 'Layout' },
                    { icon: Clock, name: 'Clock' },
                    { icon: Calendar, name: 'Calendar' },
                    { icon: UserIcon, name: 'UserIcon' },
                    { icon: Files, name: 'Files' },
                    { icon: BarChart3, name: 'BarChart3' },
                    { icon: Settings, name: 'Settings' },
                    { icon: MessageSquare, name: 'MessageSquare' },
                    { icon: Globe, name: 'Globe' },
                    { icon: Users, name: 'Users' }
                  ].map((item) => (
                    <button
                      key={item.name}
                      type="button"
                      onClick={() => setSelectedCategoryIcon(item.name)}
                      className={`p-2 rounded-xl flex items-center justify-center transition-all ${selectedCategoryIcon === item.name ? 'bg-pink-500 text-white shadow-lg shadow-pink-200 scale-110' : 'hover:bg-neutral-200 text-neutral-600'}`}
                    >
                      <item.icon className="w-5 h-5" />
                    </button>
                  ))}
                </div>
              </div>

              <DialogFooter className="sm:justify-start gap-3">
                <Button type="submit" className="flex-1 rounded-2xl bg-pink-500 hover:bg-pink-600 font-bold h-14 text-white">Criar Tópico</Button>
                <Button type="button" variant="ghost" className="rounded-2xl font-bold h-14" onClick={() => setIsCategoryModalOpen(false)}>Cancelar</Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        <Dialog open={!!checklistToDelete} onOpenChange={() => setChecklistToDelete(null)}>
          <DialogContent className="sm:max-w-[400px] rounded-[2.5rem] p-10">
            <DialogHeader>
              <DialogTitle className="text-2xl font-bold text-red-600">Excluir Checklist</DialogTitle>
            </DialogHeader>
            <div className="py-6">
              <p className="text-neutral-500 text-base leading-relaxed">
                Tem certeza que deseja excluir <span className="font-bold text-neutral-900">"{checklistToDelete?.title}"</span>? Todos os dados vinculados serão removidos permanentemente.
              </p>
            </div>
            <DialogFooter className="flex flex-col gap-3 sm:flex-col">
              <Button variant="destructive" className="w-full rounded-2xl font-bold h-14" onClick={handleDeleteChecklist}>Sim, excluir agora</Button>
              <Button variant="ghost" className="w-full rounded-2xl font-bold h-14" onClick={() => setChecklistToDelete(null)}>Cancelar e manter</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={viewSettingsOpen} onOpenChange={setViewSettingsOpen}>
          <DialogContent className="sm:max-w-[450px] rounded-[2rem] p-10 backdrop-blur-sm bg-white/90">
            <DialogHeader>
              <DialogTitle className="text-2xl font-bold">Editar Visualização</DialogTitle>
            </DialogHeader>
            <div className="space-y-6 pt-4">
              <div className="p-8 border-2 border-dashed border-neutral-200 rounded-2xl flex flex-col items-center justify-center text-center gap-4">
                <Palette className="w-12 h-12 text-neutral-300" />
                <div className="space-y-1">
                  <p className="text-sm font-medium text-neutral-600">Personalização de Visualização</p>
                  <p className="text-xs text-neutral-400">Em breve você poderá personalizar cores, filtros e ordenação desta categoria.</p>
                </div>
              </div>
              <Button onClick={() => setViewSettingsOpen(false)} className="w-full rounded-2xl bg-[#1D7AFC] hover:bg-[#1D7AFC]/90 font-bold h-14 text-white">
                Salvar alterações
              </Button>
            </div>
          </DialogContent>
        </Dialog>
        
        <WorkspaceOnboarding 
          isOpen={showOnboarding} 
          onSelect={handleOnboardingSelect} 
        />
      </div>
    </DashboardLayout>
  );
}

