import { useState, useEffect, useCallback } from "react";
import { Link, useNavigate, useLocation } from "@tanstack/react-router";
import { useSidebar } from "@/contexts/SidebarContext";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { useAuth } from "@/contexts/AuthContext";
import { useIsMobile } from "@/hooks/use-mobile";
import { useWorkspaceRBAC } from "@/hooks/useWorkspaceRBAC";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  RiHome5Line, RiHome5Fill,
  RiDashboard3Line, RiDashboard3Fill,
  RiFileList2Line, RiFileList2Fill,
  RiGlobalLine, RiGlobalFill,
  RiTeamLine, RiTeamFill,
  RiUser3Line, RiUser3Fill,
  RiShieldCheckLine, RiShieldCheckFill,
  RiSearch2Line,
  RiHistoryLine,
  RiArrowDownSLine,
  RiLifebuoyLine,
  RiLogoutBoxRLine,
  RiRocket2Line, RiBookOpenLine, RiCustomerService2Line,
} from "@remixicon/react";
  import {
    User, Sparkles,
    LayoutTemplate, Rocket, MessageSquare,
    Trash2, Send, BookOpen, LifeBuoy, MessageCircle,
    Plus, HelpCircle, ChevronDown, FolderPlus,
   LogOut, CheckSquare, PanelLeftClose, PanelLeftOpen, ChevronsLeft, ChevronsRight, LogIn,
   BarChart3, Share2, Inbox, MousePointer2, Image, Palette, Eye, ShieldCheck, Check, Briefcase, CreditCard,
   Clock, FileText, ChevronRight, MoreHorizontal, UserPlus, Files, Layout, Bell
  , LayoutDashboard, Menu, X as CloseIcon, Home, Globe, Users, Settings
  } from "lucide-react";
 import { supabase } from "@/integrations/supabase/client";
 import {
   DropdownMenu,
   DropdownMenuContent,
   DropdownMenuItem,
   DropdownMenuTrigger,
 } from "@/components/ui/dropdown-menu";
import { toast } from "sonner";

  type NavItem = {
    icon: React.ElementType;
    label: string;
    to?: string;
    accent?: string;
    permission?: "admin" | "manage";
  };

  // ── Shell icon map (Remix Icon) ─────────────────────────────────────────────
  // Each nav item carries a Line/Fill pair: the Line glyph is the resting state,
  // the Fill glyph signals the active destination (same geometry, more ink).
  // Deliberate exceptions to Remix: workspace avatars (ws.icon is user data) and
  // the ⌘K shortcut chip (plain kbd text).
  const shellIcons = {
    inicio:    { line: RiHome5Line,      fill: RiHome5Fill },
    painel:    { line: RiDashboard3Line, fill: RiDashboard3Fill },
    organizar: { line: RiFileList2Line,  fill: RiFileList2Fill },
    dominios:  { line: RiGlobalLine,     fill: RiGlobalFill },
    equipe:    { line: RiTeamLine,       fill: RiTeamFill },
    admin:     { line: RiShieldCheckLine,fill: RiShieldCheckFill },
  } as const;

  // Ícone do workspace vem de dados do usuário (ws.icon) — mapa único do shell.
  const WORKSPACE_ICON_MAP: Record<string, React.ElementType> = {
    Files, Layout, BarChart3, Settings, MessageSquare, Bell, Globe, Users,
  };

 // Shell nav row: coluna óptica fixa (32px) → label. Seleção em repouso
 // usa somente peso + rosa da marca; o hover recebe uma superfície neutra sutil,
 // sem contorno permanente, glow, sombra, gradiente ou dot extra.
 const NAV_ROW = {
   base: "group relative flex h-9 w-full items-center gap-3 rounded-md px-2 text-[14px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF007F]/40",
   idle: "text-neutral-600 hover:text-neutral-900",
   active: "font-semibold text-[#FF007F]",
   icon: "grid h-8 w-8 shrink-0 place-items-center",
   glyph: "w-5 h-5",
   label: "truncate transition-[opacity,translate] duration-[300ms] ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:duration-100",
 } as const;

 // Camada de superfície da linha. Absoluta e fora do fluxo: no estado expandido
 // acompanha a linha inteira; no rail vira um quadrado 36×36 centrado na coluna
 // óptica (rail de 60px → 12px de margem de cada lado). Sendo uma camada
 // absoluta, os ícones nunca se deslocam durante a animação de largura.
 // Motion do shell: UMA transformação contínua — largura, fade e deslocamentos
 // compartilham a mesma duração/easing (300ms, ease-out natural). Sob
 // prefers-reduced-motion o movimento é encurtado (100ms), sem alterar os estados finais.
 const ROW_SURFACE =
   "pointer-events-none absolute inset-y-0 rounded-md border duration-[300ms] ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:duration-100";

 const rowSurfaceClass = (collapsed: boolean | undefined, active: boolean, field = false) =>
   cn(
     ROW_SURFACE,
     // Só o campo de busca anima cor: no rail ele deixa de ser field e vira ícone,
     // e esse corte é visível; nos demais a cor responde na hora (hover ágil).
     field
       ? "transition-[left,width,border-color,background-color]"
       : "transition-[left,width]",
     collapsed ? "left-0.5 w-9" : "left-0 w-full",
     active
       ? "border-[#FF007F]/50 bg-[#FF007F]/[0.05]"
       : field && !collapsed
         ? "border-neutral-200/70 bg-white group-hover:border-neutral-300"
         : "border-transparent group-hover:bg-neutral-100"
   );

 function NavItemRow({
   label,
   to,
   active,
   icons,
   onClick,
   secondary,
   collapsed,
 }: {
   label: string;
   to: string;
   active: boolean;
   icons: { line: React.ElementType; fill: React.ElementType };
   onClick: () => void;
   secondary?: boolean;
   collapsed?: boolean;
 }) {
   const Glyph = active ? icons.fill : icons.line;
   return (
     <button
       type="button"
       onClick={onClick}
       aria-current={active ? "page" : undefined}
       aria-label={collapsed ? label : undefined}
       title={collapsed ? label : undefined}
       className={cn(
         NAV_ROW.base,
         active ? NAV_ROW.active : NAV_ROW.idle,
         secondary && !active && "text-neutral-500 hover:text-neutral-900",
         // No rail o padding volta a 4px: a coluna óptica do ícone (4..36)
         // permanece centrada sob a superfície de hover (2..38).
         collapsed && "px-1"
       )}
     >
       {/* A superfície é somente hover; o active em repouso é identificado por
           ícone + label rosa, sem borda ou caixa persistente. */}
       <span aria-hidden="true" className={rowSurfaceClass(collapsed, false)} />
       <span className={cn(NAV_ROW.icon, "relative z-10")} aria-hidden="true">
         <Glyph className={cn(NAV_ROW.glyph, active && "text-[#FF007F]")} />
       </span>
       <span className={cn(NAV_ROW.label, "relative z-10", collapsed && "opacity-0 -translate-x-1")}>{label}</span>
     </button>
   );
 }


  export function DashboardLayout({ children }: { children: React.ReactNode }) {
    const { sidebarOpen, setSidebarOpen } = useSidebar();
    const { user, loading: authLoading, needsEmailConfirmation, signOut } = useAuth();
    const { workspaces, currentWorkspace, setCurrentWorkspace, refreshWorkspaces, workspaceStatus } = useWorkspace();
    const [createWsOpen, setCreateWsOpen] = useState(false);
    const [newWsName, setNewWsName] = useState("");
    const [newWsIcon, setNewWsIcon] = useState("📁");
    const [isCreating, setIsCreating] = useState(false);
    const [searchOpen, setSearchOpen] = useState(false);
    const [searchQuery, setSearchQuery] = useState("");
    const [profile, setProfile] = useState<{ display_name: string | null; avatar_url: string | null; is_admin: boolean | null; plan_type: string | null; email: string | null } | null>(null);
    const [memberCount, setMemberCount] = useState<number>(0);
    const [hasChecklists, setHasChecklists] = useState(false);

    const { isAdmin: isWsAdmin, canManage: canWsManage, isViewer: isWsViewer, workspaceMemberId, role: wsRole, loading: rbacLoading } = useWorkspaceRBAC(currentWorkspace?.id);
    const [recentChecklists, setRecentChecklists] = useState<{id: string, title: string | null}[]>([]);
    const [allWorkspacesChecklists, setAllWorkspacesChecklists] = useState<{id: string, title: string | null, workspace_id: string | null}[]>([]);
    const [recentOpen, setRecentOpen] = useState(true);
    const navigate = useNavigate();
    const location = useLocation();

    // Id do checklist aberto — MESMA fonte usada pelo clique nos Recentes
    // (/executar/$id via pathname; /checklist?id= via search). Sem heurística:
    // se não houver id, nenhum recent fica selecionado.
    const activeChecklistId = (() => {
      if (location.pathname.startsWith("/executar/")) {
        return decodeURIComponent(location.pathname.split("/")[2] ?? "") || null;
      }
      if (location.pathname.startsWith("/checklist")) {
        const raw: unknown = location.search;
        if (typeof raw === "string") return new URLSearchParams(raw).get("id");
        if (raw && typeof raw === "object") {
          const id = (raw as Record<string, unknown>).id;
          return typeof id === "string" ? id : null;
        }
      }
      return null;
    })();

    const workspaceIconUrl = workspaceStatus === "workspace" ? currentWorkspace?.icon_url ?? null : null;
    const workspaceLabel = workspaceStatus === "workspace" && currentWorkspace ? currentWorkspace.name : "Pessoal";
    const WorkspaceGlyph =
      (currentWorkspace?.icon ? WORKSPACE_ICON_MAP[currentWorkspace.icon] : undefined) ??
      (workspaceStatus === "workspace" ? Files : User);

    useEffect(() => {
      const fetchData = async () => {
        // Fail-closed: Se estamos num workspace e o RBAC ainda está carregando,
        // limpamos estados contextuais e bloqueamos a execução.
        if (workspaceStatus === 'workspace' && (rbacLoading || !user?.id)) {
          setRecentChecklists([]);
          setAllWorkspacesChecklists([]);
          return;
        }

        // Fail-closed: se o RBAC resolveu e não temos role, bloquear.
        if (workspaceStatus === 'workspace' && !rbacLoading && !wsRole) {
          setRecentChecklists([]);
          setAllWorkspacesChecklists([]);
          return;
        }

        if (user?.id) {
          // 1. Contagem de membros (apenas se temos workspace e RBAC resolvido)
          if (currentWorkspace?.id) {
            const { count, error: countError } = await supabase
              .from("workspace_members")
              .select("*", { count: 'exact', head: true })
              .eq("workspace_id", currentWorkspace.id);

            if (!countError && count !== null) {
              setMemberCount(count);
            } else {
              setMemberCount(0);
            }
          } else {
            setMemberCount(0);
          }

          // 2. Perfil
          const { data: profileData } = await supabase
            .from("profiles")
            .select("display_name, avatar_url, is_admin, plan_type")
            .eq("id", user.id)
            .maybeSingle();

          if (profileData) {
            setProfile({ ...profileData, email: user.email ?? null });
          } else {
            setProfile({
              display_name: user.email?.split('@')[0] || "Usuário",
              avatar_url: null,
              is_admin: false,
              plan_type: "free",
              email: user.email ?? null
            });
          }

          // 3. Flags globais (pode carregar independente do workspace)
          const { data: checklistsData } = await supabase
            .from("checklists")
            .select("id")
            .eq("user_id", user.id)
            .limit(1);
          setHasChecklists(!!(checklistsData && checklistsData.length > 0));

          // 4. Resolução de Acesso Contextual (Recentes e Busca)
          let contextualQuery = supabase.from("checklists").select("id, title, workspace_id, updated_at");

          if (workspaceStatus === 'workspace' && currentWorkspace?.id) {
            contextualQuery = contextualQuery.eq("workspace_id", currentWorkspace.id);

            if (isWsViewer) {
              // FASE 5B.11: Viewer vê todos os checklists do workspace.
              // O filtro por assignments foi removido da visibilidade.
            }
          } else {
            // Contexto Pessoal
            contextualQuery = contextualQuery.is("workspace_id", null).eq("user_id", user.id);
          }

          // Executar buscas baseadas na query base filtrada
          const [{ data: recentData }, { data: allData }] = await Promise.all([
            contextualQuery.order("updated_at", { ascending: false }).limit(3),
            // Note: a query de busca pode ser mais ampla se necessário, mas respeitando o filtro base
            contextualQuery.limit(50)
          ]);

          setRecentChecklists(recentData || []);
          setAllWorkspacesChecklists(allData || []);

        } else {
          setProfile(null);
          setRecentChecklists([]);
          setAllWorkspacesChecklists([]);
          setHasChecklists(false);
        }
      };

      fetchData();

      const handleOpenSearch = () => setSearchOpen(true);
      window.addEventListener('open-search', handleOpenSearch);
      return () => window.removeEventListener('open-search', handleOpenSearch);
    }, [user?.id, currentWorkspace?.id, workspaceStatus, isWsViewer, rbacLoading]);

    // Gate: usuário logado com e-mail não confirmado não acessa o app.
    useEffect(() => {
      if (authLoading || !user) return;
      if (needsEmailConfirmation && location.pathname !== "/confirmar-email") {
        navigate({ to: "/confirmar-email" });
      }
    }, [authLoading, user, needsEmailConfirmation, location.pathname, navigate]);

    const handleLogout = async () => {
      await signOut();
      navigate({ to: "/login" });
      toast.success("Saiu com sucesso!");
    };

    const isMobile = useIsMobile();

    // Desktop recolhido = rail compacto (56px); no mobile o drawer continua off-canvas.
    const collapsed = isMobile === false && !sidebarOpen;
    // Rótulos/metadados: fade + deslocamento curto esquerdo na MESMA duração da
    // largura — a transição é uma só. Nada de display:none (evita corte no meio).
    const labelFade = cn(
      "transition-[opacity,translate] duration-[300ms] ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:duration-100",
      collapsed && "opacity-0 -translate-x-1"
    );

    // Close sidebar on navigation (mobile only)
    useEffect(() => {
      if (isMobile === true && sidebarOpen) {
        setSidebarOpen(false);
      }
    }, [location.pathname, isMobile]);

    // Handle Escape key to close sidebar
    useEffect(() => {
      const handleEsc = (e: KeyboardEvent) => {
        if (e.key === "Escape" && sidebarOpen && isMobile === true) {
          setSidebarOpen(false);
        }
      };
      window.addEventListener("keydown", handleEsc);
      return () => window.removeEventListener("keydown", handleEsc);
    }, [sidebarOpen, isMobile, setSidebarOpen]);

    // Scroll lock when mobile sidebar is open
    useEffect(() => {
      if (isMobile === true && sidebarOpen) {
        document.body.style.overflow = "hidden";
      } else {
        document.body.style.overflow = "";
      }
      return () => {
        document.body.style.overflow = "";
      };
    }, [sidebarOpen, isMobile]);

    // If viewport is not yet resolved, we render a stable skeleton to avoid flash.
    // We assume desktop by default for classes but don't show the sidebar if it's undecided.
    const isUndecided = isMobile === undefined;

    return (
        <div className="min-h-screen bg-white text-neutral-900 flex overflow-x-clip">
       {/* Mobile Backdrop */}
       {isMobile === true && sidebarOpen && (
         <div
           className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40 animate-in fade-in duration-200"
           onClick={() => setSidebarOpen(false)}
         />
       )}

       {/* Sidebar */}
       {(profile || user || authLoading) && (
       <aside
         className={cn(
           "flex flex-col shrink-0 border-r border-neutral-100 bg-white transition-[width,transform] duration-[300ms] ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:duration-100",
           isMobile === true
             ? "fixed top-0 left-0 h-[100dvh] z-50 w-[288px] max-w-[85vw]"
             : "sticky top-0 h-[100dvh] max-h-[100dvh] overflow-y-auto overflow-x-hidden",
           isUndecided && "w-0 overflow-hidden opacity-0",
           !isUndecided &&
             (isMobile === true
               ? !sidebarOpen && "-translate-x-full"
               : sidebarOpen
                 ? "w-[264px]"
                 : "w-[60px]")
         )}
       >
         {isMobile && (
           <button
             onClick={() => setSidebarOpen(false)}
             className="absolute top-4 right-4 p-2 text-neutral-400 hover:text-neutral-900"
             aria-label="Fechar menu"
           >
             <CloseIcon className="w-5 h-5" />
           </button>
         )}

         {/* Conteúdo com largura FIXA: o aside anima width e recorta o excedente,
             então nenhum ícone se desloca lateralmente durante a transição. */}
         <div className={cn("flex h-full min-h-0 flex-col", isMobile === true ? "w-[288px]" : "w-[264px]")}>
         {/* Perfil no topo: substitui a marca neste shell. Os dados vêm da sessão
             e do perfil carregado; no rail, apenas o avatar permanece visível. */}
         <DropdownMenu>
         <div className="relative mt-3 mb-3 h-10 px-3">
           <DropdownMenuTrigger asChild>
             <button
               type="button"
               className={cn(
                 "group relative flex h-11 items-center gap-3 rounded-md text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF007F]/40",
                 collapsed ? "w-10 justify-center" : "w-[calc(100%-2.25rem)] px-2"
               )}
               title={collapsed ? "Abrir menu da conta" : undefined}
               aria-label="Abrir menu da conta"
             >
             <span aria-hidden="true" className={rowSurfaceClass(collapsed, false)} />
             <span className="relative z-10 grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded-full border border-neutral-200 bg-neutral-100 text-neutral-500">
               {profile?.avatar_url ? (
                 <img src={profile.avatar_url} alt="" className="h-full w-full object-cover" />
               ) : (
                 <span className="text-[12px] font-semibold text-neutral-600">
                   {(profile?.display_name || user?.user_metadata?.full_name || user?.email || "U").charAt(0).toUpperCase()}
                 </span>
               )}
             </span>
             <span className={cn("relative z-10 min-w-0 truncate", labelFade)}>
               <span className="block truncate text-[14px] font-semibold text-neutral-800">
                 {profile?.display_name || user?.user_metadata?.full_name || user?.email?.split("@")[0] || "Usuário"}
               </span>
               <span className="block truncate text-[12px] leading-4 text-neutral-400">
                 {profile?.email || user?.email || ""}
               </span>
             </span>
             </button>
           </DropdownMenuTrigger>
           {/* Recolher: « no canto direito do topo (só no estado expandido) */}
           {!isMobile && (
             <button
               type="button"
               onClick={() => setSidebarOpen(false)}
               className={cn(
                 "absolute right-4 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-md text-neutral-400 hover:bg-neutral-100 hover:text-neutral-900 transition-[opacity,visibility,background-color,color] duration-[300ms] ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:duration-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF007F]/40",
                 collapsed ? "invisible opacity-0" : "visible opacity-100"
               )}
               title="Esconder menu"
               aria-label="Esconder menu"
               aria-expanded={sidebarOpen}
             >
               <ChevronsLeft className="w-4 h-4" />
             </button>
           )}
         </div>

         {/* Expandir: existe apenas no estado recolhido e fica no TOPO do rail,
             logo abaixo do perfil. A altura anima junto com a largura, então o
             conteúdo abaixo desce de forma coordenada — sem salto. */}
         {!isMobile && (
           <div
             className={cn(
               "grid transition-[grid-template-rows,opacity] duration-[300ms] ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:duration-100",
               collapsed ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
             )}
           >
             <div className="overflow-hidden">
               <div className="px-3 pb-1">
                 <button
                   type="button"
                   onClick={() => setSidebarOpen(true)}
                   tabIndex={collapsed ? 0 : -1}
                   aria-hidden={collapsed ? undefined : true}
                   className="group relative flex h-9 w-full items-center gap-3 rounded-md px-1 text-[14px] text-neutral-500 hover:text-neutral-900 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF007F]/40"
                   title="Expandir menu"
                   aria-label="Expandir menu"
                   aria-expanded={sidebarOpen}
                 >
                   <span aria-hidden="true" className={rowSurfaceClass(true, false)} />
                   <span className="relative z-10 grid h-8 w-8 shrink-0 place-items-center" aria-hidden="true">
                     <ChevronsRight className="w-5 h-5" />
                   </span>
                 </button>
               </div>
             </div>
           </div>
         )}

         {/* Workspace atual — contexto estrutural acima da busca. A troca de
             contexto continua disponível no menu aberto pelo perfil. */}
         <div className="px-3 pb-2">
           <div
             className={cn(
               "group relative flex w-full items-center gap-3 rounded-md h-10 text-left",
               collapsed ? "px-1" : "px-2"
             )}
             aria-label={`Workspace atual: ${workspaceLabel}`}
           >
                 <span aria-hidden="true" className={rowSurfaceClass(collapsed, false)} />
                <span className="relative z-10 grid h-8 w-8 shrink-0 place-items-center" aria-hidden="true">
                   <span className="grid h-6 w-6 place-items-center overflow-hidden rounded-md border border-neutral-200 bg-neutral-50 text-neutral-500">
                     {workspaceIconUrl ? (
                       <img src={workspaceIconUrl} alt="" className="h-full w-full object-cover" />
                     ) : (
                       <WorkspaceGlyph className="h-3.5 w-3.5" />
                     )}
                   </span>
                 </span>
                 <span className={cn("relative z-10 min-w-0 truncate text-[14px] font-medium text-neutral-700", labelFade)}>
                   {workspaceLabel}
                 </span>
               </div>
         </div>

             <DropdownMenuContent align="start" alignOffset={-4} className="w-72 p-0 overflow-hidden">
               <div className="bg-[#FF007F]/5 p-4">
                 <div className="flex items-center gap-3 mb-4 px-1">
                   <div className="w-10 h-10 rounded-full overflow-hidden bg-neutral-200 border border-neutral-200 shrink-0">
                     {profile?.avatar_url ? (
                       <img src={profile.avatar_url} alt="Avatar" className="w-full h-full object-cover" />
                     ) : (
                       <div className="w-full h-full bg-gradient-to-br from-orange-300 to-pink-400 flex items-center justify-center">
                         <User className="w-5 h-5 text-white" />
                       </div>
                     )}
                   </div>
                   <div className="flex flex-col min-w-0">
                     <span className="text-sm font-semibold text-neutral-900 truncate">
                       {profile?.display_name || "Usuário"}
                     </span>
                     <span className="text-xs text-neutral-500">
                       Plano {profile?.plan_type ? profile.plan_type.charAt(0).toUpperCase() + profile.plan_type.slice(1).toLowerCase() : "Free"} - {memberCount} membros
                     </span>
                   </div>
                 </div>

                 <div className="flex gap-2 px-1">
                   <Button
                     variant="outline"
                     size="sm"
                     className="flex-1 text-[11px] h-8 gap-1.5 bg-white hover:bg-[#FF007F]/5 hover:text-[#FF007F] hover:border-[#FF007F]/20 transition-all justify-center px-1"
                     onClick={() => navigate({ to: "/configuracoes" })}
                   >
                     <User className="w-3.5 h-3.5 shrink-0" />
                     <span className="truncate">Minha conta</span>
                   </Button>
                 </div>
               </div>

               <div className="p-2 pt-0 max-h-[300px] overflow-y-auto">
                 <div className="px-2 py-1.5 text-[10px] font-bold text-neutral-400 uppercase tracking-wider">Contexto</div>

                 {/* Opção Pessoal Explicita */}
                 <DropdownMenuItem
                   onSelect={() => {
                     setCurrentWorkspace(null);
                     navigate({ to: "/inicio" });
                   }}
                   className={`w-full flex items-center justify-between py-2 px-2 rounded-md hover:bg-[#FF007F]/5 transition-colors group mb-0.5 cursor-pointer ${workspaceStatus === 'personal' ? "bg-[#FF007F]/5 text-[#FF007F]" : "text-neutral-600"}`}
                 >
                   <div className="flex items-center gap-2 min-w-0">
                     <div className="w-5 h-5 rounded-md overflow-hidden bg-neutral-100 flex items-center justify-center shrink-0 border border-neutral-200">
                       <User className="w-3 h-3" />
                     </div>
                     <span className="text-[14px] truncate font-medium">
                       Pessoal
                     </span>
                   </div>
                   {workspaceStatus === 'personal' && <Check className="w-3.5 h-3.5" />}
                 </DropdownMenuItem>

                 <div className="px-2 py-1.5 mt-2 text-[10px] font-bold text-neutral-400 uppercase tracking-wider border-t border-neutral-100/50">Espaços de Trabalho</div>
                 {workspaces.map((ws) => (
                   <DropdownMenuItem
                     key={ws.id}
                     onSelect={() => {
                       setCurrentWorkspace(ws);
                       navigate({ to: "/inicio" });
                     }}
                     className={`w-full flex items-center justify-between py-2 px-2 rounded-md hover:bg-[#FF007F]/5 transition-colors group mb-0.5 cursor-pointer ${currentWorkspace?.id === ws.id ? "bg-[#FF007F]/5 text-[#FF007F]" : "text-neutral-600"}`}
                   >
                     <div className="flex items-center gap-2 min-w-0">
                       <div className="w-5 h-5 rounded-md overflow-hidden bg-neutral-100 flex items-center justify-center shrink-0 border border-neutral-200">
                         {ws.icon_url ? (
                           <img src={ws.icon_url} alt="Icon" className="w-full h-full object-cover" />
                         ) : (
                           (() => {
                             const IconMap: Record<string, any> = { Files, Layout, BarChart3, Settings, MessageSquare, Bell, Globe, Users };
                             const Icon = IconMap[ws.icon || "Files"] || Files;
                             return <Icon className="w-3 h-3" />;
                           })()
                         )}
                       </div>
                       <span className="text-[14px] truncate font-medium">
                         {ws.name}
                       </span>
                     </div>
                     {currentWorkspace?.id === ws.id && <Check className="w-3.5 h-3.5" />}
                   </DropdownMenuItem>
                 ))}

                 <DropdownMenuSeparator className="mx-2 my-2" />

                 <DropdownMenuItem asChild>
                   <div className="flex items-center justify-between py-2 px-2 rounded-md hover:bg-[#FF007F]/5 transition-colors group cursor-pointer mb-1 mx-0">
                     <div className="flex items-center gap-2 min-w-0">
                       <div className="w-5 h-5 rounded-full overflow-hidden bg-neutral-200 shrink-0">
                         {profile?.avatar_url ? (
                           <img src={profile.avatar_url} alt="Avatar" className="w-full h-full object-cover" />
                         ) : (
                           <div className="w-full h-full bg-gradient-to-br from-orange-300 to-pink-400 flex items-center justify-center text-[8px] text-white">
                             {profile?.display_name?.charAt(0) || "U"}
                           </div>
                         )}
                       </div>
                       <span className="text-[14px] text-neutral-500 truncate group-hover:text-[#FF007F] transition-colors">
                         {profile?.email}
                       </span>
                     </div>
                     <MoreHorizontal className="w-4 h-4 text-neutral-400 group-hover:text-[#FF007F] transition-colors" />
                   </div>
                 </DropdownMenuItem>

              {(profile?.is_admin || workspaces.length === 0) && (
                <button
                  onClick={() => { setCreateWsOpen(true); setNewWsName(""); setNewWsIcon("📁"); }}
                  className="w-full flex items-center gap-2 px-2 py-2 mb-1 text-[14px] font-semibold text-[#FF007F] hover:bg-[#FF007F]/5 rounded-md transition-all mx-0 text-left"
                >
                  <Plus className="w-4 h-4" />
                  Novo espaço de trabalho
                </button>
              )}

              <button
                onClick={handleLogout}
                className="w-full flex items-center gap-2 text-left px-2 py-2 text-[14px] text-neutral-500 hover:text-[#FF007F] hover:bg-[#FF007F]/5 rounded-md transition-all mx-0"
              >
                <RiLogoutBoxRLine className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span>Sair</span>
              </button>
              </div>
            </DropdownMenuContent>
          </DropdownMenu>

        <nav className="px-3 pb-4" aria-label="Principal">
          <button
            type="button"
            onClick={() => setSearchOpen(true)}
            className={cn(
              "group relative flex w-full items-center gap-3 h-10 rounded-md text-[14px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF007F]/40",
              collapsed ? "px-1" : "px-2",
              collapsed
                ? "text-neutral-400 hover:text-neutral-700"
                : "text-neutral-400 hover:text-neutral-500 focus-visible:text-neutral-500"
            )}
            aria-keyshortcuts="Meta+K"
            title={collapsed ? "Buscar" : undefined}
            aria-label={collapsed ? "Buscar" : undefined}
          >
            <span aria-hidden="true" className={rowSurfaceClass(collapsed, false, true)} />
            <span className={cn(NAV_ROW.icon, "relative z-10")} aria-hidden="true">
              <RiSearch2Line className={NAV_ROW.glyph} />
            </span>
            <span className={cn("relative z-10 flex-1 text-left truncate", labelFade)}>Buscar…</span>
            <kbd className={cn("relative z-10 pointer-events-none hidden sm:flex h-5 select-none items-center gap-0.5 rounded border border-neutral-200 bg-neutral-50 px-1.5 font-sans text-[10px] font-medium text-neutral-400 group-hover:border-neutral-300", labelFade)}>
              ⌘K
            </kbd>
          </button>

          <div className="mt-6 flex flex-col gap-2">
            <NavItemRow
              label="Início"
              to="/inicio"
              active={location.pathname === "/inicio"}
              icons={shellIcons.inicio}
              collapsed={collapsed}
              onClick={() => navigate({ to: "/inicio" })}
            />
            {isWsAdmin && (
              <NavItemRow
                label="Painel"
                to="/painel"
                active={location.pathname === "/painel"}
                icons={shellIcons.painel}
                collapsed={collapsed}
                onClick={() => navigate({ to: "/painel" })}
              />
            )}
            {canWsManage && (
              <NavItemRow
                label="Organizar"
                to="/organizar"
                active={location.pathname === "/organizar"}
                icons={shellIcons.organizar}
                collapsed={collapsed}
                onClick={() => navigate({ to: "/organizar" })}
              />
            )}
            {isWsAdmin && (
              <NavItemRow
                label="Domínios"
                to="/dominios"
                active={location.pathname === "/dominios"}
                icons={shellIcons.dominios}
                collapsed={collapsed}
                onClick={() => navigate({ to: "/dominios" })}
              />
            )}
            {isWsAdmin && (
              <NavItemRow
                label="Equipe"
                to="/equipe"
                active={location.pathname === "/equipe"}
                icons={shellIcons.equipe}
                collapsed={collapsed}
                onClick={() => navigate({ to: "/equipe" })}
              />
            )}
            {profile?.is_admin && (
              <NavItemRow
                label="Painel Admin"
                to="/admin"
                active={location.pathname === "/admin"}
                icons={shellIcons.admin}
                collapsed={collapsed}
                onClick={() => navigate({ to: "/admin" })}
                secondary
              />
            )}
          </div>

          {(profile || user) && (
            <div className="mt-5">
              {/* Recentes: heading com a mesma linguagem da nav (coluna óptica 28px)
                  + chevron rotativo; itens em árvore com o NÓ como marcador,
                  recorte de 3 mais recentes (ordenação updated_at existente).
                  Sem contador: a seção mostra deliberadamente só os 3 últimos. */}
              <button
                type="button"
                onClick={() => (collapsed ? setSidebarOpen(true) : setRecentOpen(!recentOpen))}
                className={cn(
                  "group relative flex h-9 w-full items-center gap-3 rounded-md text-[14px] text-neutral-600 hover:text-neutral-900 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF007F]/40",
                  collapsed ? "pl-1 pr-1.5" : "pl-2 pr-2"
                )}
                aria-expanded={collapsed ? sidebarOpen : recentOpen}
                aria-label={collapsed ? "Recentes" : undefined}
                title={collapsed ? "Recentes" : undefined}
              >
                <span aria-hidden="true" className={rowSurfaceClass(collapsed, false)} />
                <span className="relative z-10 grid h-8 w-8 shrink-0 place-items-center" aria-hidden="true">
                  <RiHistoryLine className="w-5 h-5" />
                </span>
                <span className={cn("relative z-10 font-medium truncate", labelFade)}>Recentes</span>
                <RiArrowDownSLine
                  className={cn(
                    "relative z-10 ml-auto w-4 h-4 shrink-0 text-neutral-400 transition-[transform,opacity] duration-[300ms] ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:duration-100",
                    recentOpen && "rotate-180",
                    collapsed && "opacity-0"
                  )}
                  aria-hidden="true"
                />
              </button>
              {/* Collapse animado via grid-rows (300ms ease-out, reduced-motion respeitado) */}
              <div
                className={cn(
                  "grid transition-[grid-template-rows,opacity] duration-[300ms] ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:duration-100",
                  // No rail a lista fecha por altura+opacidade (nunca display:none) e
                  // sai da árvore de foco sem desmontar — sem corte e sem flicker.
                  collapsed
                    ? "grid-rows-[0fr] opacity-0"
                    : recentOpen
                      ? "grid-rows-[1fr] opacity-100"
                      : "grid-rows-[0fr] opacity-0"
                )}
                inert={collapsed || undefined}
              >
                <div className="overflow-hidden">
                  {recentChecklists.length > 0 ? (
                    <ul className="mb-1 mt-0.5">
                      {recentChecklists.slice(0, 3).map((chk, idx, arr) => {
                        const isLast = idx === arr.length - 1;
                        // Seleção de árvore: mesma fonte do clique (pathname/search).
                        const isActive = !!activeChecklistId && activeChecklistId === chk.id;
                        return (
                          <li key={chk.id} className="relative">
                            {/* Árvore: linha estrutural neutra + ramo curto até o item */}
                            <span
                              aria-hidden="true"
                              className={cn(
                                "absolute left-[24px] top-0 w-px bg-neutral-200",
                                isLast ? "h-1/2" : "h-full"
                              )}
                            />
                            <span
                              aria-hidden="true"
                              className="absolute left-[24px] top-1/2 h-px w-[10px] bg-neutral-200"
                            />
                            {/* O NÓ É A BOLINHA: o ramo entra nela, como marcador do nó
                                da árvore. Neutra nos itens normais; rosa no ativo. */}
                            <span
                              aria-hidden="true"
                              className={cn(
                                "absolute top-1/2 -translate-y-1/2 rounded-full",
                                isActive
                                  ? "left-[31px] h-1.5 w-1.5 bg-[#FF007F]"
                                  : "left-[32px] h-1 w-1 bg-neutral-400"
                              )}
                            />
                            <button
                              type="button"
                              onClick={() => {
                                if (workspaceStatus === "workspace" && isWsViewer) {
                                  navigate({
                                    to: "/executar/$id",
                                    params: { id: chk.id }
                                  });
                                } else {
                                  navigate({
                                    to: "/checklist",
                                    search: { id: chk.id }
                                  });
                                }
                              }}
                              aria-current={isActive ? "page" : undefined}
                              className={cn(
                                "flex h-8 w-full items-center rounded-md pr-2 pl-[52px] text-left text-[14px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF007F]/40",
                                isActive
                                  ? "font-semibold text-[#FF007F] hover:bg-neutral-50"
                                  : "text-neutral-500 hover:bg-neutral-50 hover:text-neutral-900"
                              )}
                            >
                              <span className="truncate">{chk.title || "Sem título"}</span>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  ) : (
                    <p className="py-1.5 pl-[52px] text-[13px] text-neutral-400">
                      Nenhum recente neste contexto
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}
        </nav>

        </div>

       </aside>
       )}

       {/* Main Content Area */}
       <div className="flex-1 flex flex-col min-h-screen min-w-0 w-full max-w-full">
         {/* No desktop o rail compacto já traz o próprio controle de expandir;
             o botão flutuante fica apenas no mobile (drawer off-canvas). */}
         {profile && !sidebarOpen && isMobile === true && (
           <button
             type="button"
             onClick={() => setSidebarOpen(true)}
             className="fixed z-[120] top-4 left-4 h-11 w-11 p-1 flex items-center justify-center rounded-md text-neutral-400 hover:text-neutral-900 hover:bg-neutral-100 transition-colors animate-in fade-in bg-white/80 backdrop-blur-sm border border-neutral-200 shadow-sm"
             title="Mostrar menu"
             aria-label="Mostrar menu"
             aria-expanded={sidebarOpen}
           >
             <Menu className="w-6 h-6" />
           </button>
         )}
          {children}
        </div>

       <button
         type="button"
         className="fixed bottom-4 right-4 w-8 h-8 rounded-full border border-neutral-200 bg-white text-neutral-500 hover:text-neutral-900 flex items-center justify-center shadow-sm z-50"
       >
         <HelpCircle className="w-4 h-4" />
       </button>

       <Dialog open={createWsOpen} onOpenChange={setCreateWsOpen}>
         <DialogContent className="sm:max-w-md">
           <DialogHeader>
             <DialogTitle>Criar novo workspace</DialogTitle>
           </DialogHeader>
           <div className="py-4 space-y-4">
             <div>
               <label className="text-xs font-bold uppercase text-neutral-500 mb-2 block">Ícone</label>
               <div className="flex gap-2 flex-wrap">
                 {["🏠","💼","🎯","🚀","🛒","📊","🎨","🏢","💡","🌟"].map(emoji => (
                   <button
                     key={emoji}
                     type="button"
                     onClick={() => setNewWsIcon(emoji)}
                     className={`w-10 h-10 rounded-lg border-2 flex items-center justify-center text-xl transition-all ${newWsIcon === emoji ? "border-pink-500 bg-pink-50" : "border-neutral-200 hover:border-neutral-300"}`}
                   >
                     {emoji}
                   </button>
                 ))}
               </div>
             </div>
             <div>
               <label className="text-xs font-bold uppercase text-neutral-500 mb-2 block">Nome do workspace</label>
               <Input
                 value={newWsName}
                 onChange={(e) => setNewWsName(e.target.value)}
                 placeholder="Ex: Clientes, Marketing, Loja..."
                 autoFocus
               />
             </div>
           </div>
           <DialogFooter>
             <Button variant="outline" onClick={() => setCreateWsOpen(false)}>Cancelar</Button>
             <Button
               disabled={!newWsName.trim() || isCreating}
               onClick={async () => {
                 if (!newWsName.trim()) return;
                 setIsCreating(true);
                 const { data: { user } } = await supabase.auth.getUser();
                 if (!user) { setIsCreating(false); return; }
                 const { data, error } = await supabase
                   .from("workspaces")
                   .insert([{ owner_id: user.id, name: newWsName.trim(), icon: newWsIcon }])
                   .select()
                   .single();
                 if (error) { toast.error("Erro ao criar workspace"); }
                 else {
                   toast.success(`Workspace "${data.name}" criado!`);
                   await refreshWorkspaces();
                   setCreateWsOpen(false);
                 }
                 setIsCreating(false);
               }}
               className="bg-pink-500 hover:bg-pink-600 text-white"
             >
               {isCreating ? "Criando..." : "Criar"}
             </Button>
           </DialogFooter>
         </DialogContent>
       </Dialog>

       <CommandDialog open={searchOpen} onOpenChange={setSearchOpen}>
         <CommandInput placeholder="Buscar ações, navegação ou ajuda..." />
         <CommandList>
            <CommandEmpty>Nenhum resultado encontrado.</CommandEmpty>
            <CommandGroup heading="Ações">
              {location.pathname.startsWith("/checklist") ? (
                <>
                  <CommandItem onSelect={() => {
                    setSearchOpen(false);
                    window.dispatchEvent(new CustomEvent('checklist-action', { detail: 'add-logo' }));
                  }}>
                    <Image className="mr-2 h-4 w-4" />
                    <span>Adicionar Logo</span>
                  </CommandItem>
                  <CommandItem onSelect={() => {
                    setSearchOpen(false);
                    window.dispatchEvent(new CustomEvent('checklist-action', { detail: 'add-cover' }));
                  }}>
                    <LayoutTemplate className="mr-2 h-4 w-4" />
                    <span>Adicionar capa</span>
                  </CommandItem>
                  <CommandItem onSelect={() => {
                    setSearchOpen(false);
                    window.dispatchEvent(new CustomEvent('checklist-action', { detail: 'customize' }));
                  }}>
                    <Palette className="mr-2 h-4 w-4" />
                    <span>Personalizar</span>
                  </CommandItem>
                  <CommandItem onSelect={() => {
                    setSearchOpen(false);
                    window.dispatchEvent(new CustomEvent('checklist-action', { detail: 'preview' }));
                  }}>
                    <Eye className="mr-2 h-4 w-4" />
                    <span>Pré-visualização</span>
                  </CommandItem>
                  <CommandItem onSelect={() => {
                    setSearchOpen(false);
                    window.dispatchEvent(new CustomEvent('checklist-action', { detail: 'publish' }));
                  }}>
                    <Rocket className="mr-2 h-4 w-4" />
                    <span>Publicar</span>
                  </CommandItem>
                  <CommandItem onSelect={() => {
                    setSearchOpen(false);
                    window.dispatchEvent(new CustomEvent('checklist-action', { detail: 'settings' }));
                  }}>
                    <Settings className="mr-2 h-4 w-4" />
                    <span>Configuração</span>
                  </CommandItem>
                </>
              ) : (
                <>
                  {!(workspaceStatus === "workspace" && isWsViewer) && (
                    <CommandItem onSelect={() => {
                      try {
                        localStorage.removeItem("draft_checklist_title");
                        localStorage.removeItem("draft_checklist_blocks");
                        localStorage.removeItem("draft_checklist_started");
                      } catch {}
                      navigate({ to: "/checklist", search: { id: undefined, workspace: undefined, category: undefined } });
                      setSearchOpen(false);
                    }}>
                      <Plus className="mr-2 h-4 w-4" />
                      <span>Criar novo checklist</span>
                    </CommandItem>
                  )}
                  {((profile?.is_admin || workspaces.length === 0) && !isWsViewer) && (
                    <CommandItem onSelect={() => { navigate({ to: "/organizar", search: { id: currentWorkspace?.id } }); setSearchOpen(false); }}>
                      <FolderPlus className="mr-2 h-4 w-4" />
                      <span>Criar workspace</span>
                    </CommandItem>
                  )}
                </>
              )}
            </CommandGroup>
            <CommandGroup heading="Navegação">
              <CommandItem onSelect={() => { navigate({ to: "/inicio" }); setSearchOpen(false); }}>
                <Home className="mr-2 h-4 w-4" />
                <span>Início</span>
              </CommandItem>

              {isWsAdmin && (
                <>
                  <CommandItem onSelect={() => { navigate({ to: "/equipe" }); setSearchOpen(false); }}>
                    <Users className="mr-2 h-4 w-4" />
                    <span>Equipe</span>
                  </CommandItem>
                  <CommandItem onSelect={() => { navigate({ to: "/dominios" }); setSearchOpen(false); }}>
                    <Globe className="mr-2 h-4 w-4" />
                    <span>Domínios</span>
                  </CommandItem>
                  <CommandItem onSelect={() => { navigate({ to: "/membros" }); setSearchOpen(false); }}>
                    <Users className="mr-2 h-4 w-4" />
                    <span>Membros</span>
                  </CommandItem>
                  <CommandItem onSelect={() => { navigate({ to: "/membros" }); setSearchOpen(false); }}>
                    <Sparkles className="mr-2 h-4 w-4" />
                    <span>Atualizar plano</span>
                  </CommandItem>

                </>
              )}

              {allWorkspacesChecklists.length > 0 && (
                <CommandGroup heading="Checklists">
                  {allWorkspacesChecklists.map((c) => (
                    <CommandItem
                      key={c.id}
                      onSelect={() => {
                        setSearchOpen(false);
                        // FASE 5B.6: Redirecionamento condicional na busca também
                        if (workspaceStatus === 'workspace' && isWsViewer) {
                          navigate({ to: "/executar/$id", params: { id: c.id } });
                        } else {
                          navigate({ to: "/checklist", search: { id: c.id } });
                        }
                      }}
                    >
                      <FileText className="mr-2 h-4 w-4" />
                      <span>{c.title}</span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}

              {canWsManage && (
                <>
                  <CommandItem onSelect={() => { navigate({ to: "/organizar", search: { id: currentWorkspace?.id } }); setSearchOpen(false); }}>
                    <CheckSquare className="mr-2 h-4 w-4" />
                    <span>Checklists</span>
                  </CommandItem>
                  <CommandItem onSelect={() => { navigate({ to: "/organizar", search: { id: currentWorkspace?.id } }); setSearchOpen(false); }}>
                    <Inbox className="mr-2 h-4 w-4" />
                    <span>Ver envios</span>
                  </CommandItem>
                  <CommandItem onSelect={() => { navigate({ to: "/organizar", search: { id: currentWorkspace?.id } }); setSearchOpen(false); }}>
                    <BarChart3 className="mr-2 h-4 w-4" />
                    <span>Ver insights</span>
                  </CommandItem>
                  <CommandItem onSelect={() => { navigate({ to: "/organizar", search: { id: currentWorkspace?.id } }); setSearchOpen(false); }}>
                    <LayoutTemplate className="mr-2 h-4 w-4" />
                    <span>Modelos</span>
                  </CommandItem>
                </>
              )}

              <CommandItem onSelect={() => { navigate({ to: "/configuracoes" }); setSearchOpen(false); }}>
                <User className="mr-2 h-4 w-4" />
                <span>Minha conta</span>
              </CommandItem>

            </CommandGroup>
           <CommandGroup heading="Ajuda e Suporte">
             <CommandItem onSelect={() => { setSearchOpen(false); }}>
               <BookOpen className="mr-2 h-4 w-4" />
               <span>Guias e tutoriais</span>
             </CommandItem>
             <CommandItem onSelect={() => { setSearchOpen(false); }}>
               <LifeBuoy className="mr-2 h-4 w-4" />
               <span>Central de ajuda</span>
             </CommandItem>
             <CommandItem onSelect={() => { setSearchOpen(false); }}>
               <MessageCircle className="mr-2 h-4 w-4" />
               <span>Falar com suporte</span>
             </CommandItem>
           </CommandGroup>
         </CommandList>
       </CommandDialog>
        </div>
    );
 }