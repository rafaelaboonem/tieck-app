import { useState, useEffect } from "react";
import { Link, useNavigate, useLocation } from "@tanstack/react-router";
import { useSidebar } from "@/contexts/SidebarContext";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { useAuth } from "@/contexts/AuthContext";
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
    Home, Search, Users, Globe, Settings, Sparkles, 
    LayoutTemplate, Rocket, Map, MessageSquare, Gift, 
    Trash2, Send, BookOpen, LifeBuoy, MessageCircle, 
    Plus, HelpCircle, ChevronDown, FolderPlus,
   LogOut, User, CheckSquare, PanelLeftClose, PanelLeftOpen, ChevronsLeft, ChevronsRight, LogIn,
   BarChart3, Share2, Inbox, MousePointer2, Image, Palette, Eye, ShieldCheck, Check, Briefcase, CreditCard,
   Clock, FileText, ChevronRight, MoreHorizontal, UserPlus, Files, Layout, Bell
  , LayoutDashboard
  } from "lucide-react";
 import { supabase } from "@/integrations/supabase/client";
 import {
   DropdownMenu,
   DropdownMenuContent,
   DropdownMenuItem,
   DropdownMenuTrigger,
 } from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import logoIcon from "../assets/local/logo-tieck.webp";
 
 type NavItem = { icon: React.ElementType; label: string; to?: string; accent?: string };
 
 
 const productNav: NavItem[] = [
   { icon: LayoutTemplate, label: "Modelos" },
   { icon: Rocket, label: "Novidades" },
   { icon: MessageSquare, label: "Sugestões" },
   { icon: Gift, label: "Recompensas" },
 ];
 
 const helpNav: NavItem[] = [
   { icon: Send, label: "Começar", accent: "text-blue-600" },
   { icon: BookOpen, label: "Guias" },
   { icon: LifeBuoy, label: "Central de ajuda" },
   { icon: MessageCircle, label: "Suporte" },
 ];
 
 function NavList({ items }: { items: NavItem[] }) {
   const navigate = useNavigate();
   return (
     <ul className="space-y-0.5">
       {items.map((item) => {
         const Icon = item.icon;
         return (
           <li key={item.label}>
             <button
               type="button"
               onClick={item.to ? () => navigate({ to: item.to }) : undefined}
               className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-sm hover:bg-neutral-100 transition-colors ${item.accent ?? "text-neutral-700"}`}
             >
               <Icon className="w-4 h-4" />
               <span>{item.label}</span>
             </button>
           </li>
         );
       })}
     </ul>
   );
  }
  
  export function DashboardLayout({ children }: { children: React.ReactNode }) {
    const { sidebarOpen, setSidebarOpen } = useSidebar();
    const { user, loading: authLoading, needsEmailConfirmation, signOut } = useAuth();
    const { workspaces, currentWorkspace, setCurrentWorkspace, refreshWorkspaces } = useWorkspace();
    const [createWsOpen, setCreateWsOpen] = useState(false);
    const [newWsName, setNewWsName] = useState("");
    const [newWsIcon, setNewWsIcon] = useState("📁");
    const [isCreating, setIsCreating] = useState(false);
    const [searchOpen, setSearchOpen] = useState(false);
    const [profile, setProfile] = useState<{ display_name: string | null; avatar_url: string | null; is_admin: boolean | null; plan_type: string | null; email: string | null } | null>(null);
    const [memberCount, setMemberCount] = useState<number>(0);
    const [hasChecklists, setHasChecklists] = useState(false);
    const [recentChecklists, setRecentChecklists] = useState<{id: string, title: string | null}[]>([]);
    const [recentOpen, setRecentOpen] = useState(true);
    const navigate = useNavigate();
    const location = useLocation();

     useEffect(() => {
      const fetchData = async () => {
         if (user) {
            // Contagem real de membros ativos
            if (currentWorkspace) {
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


           // Fetch profile
           const { data: profileData } = await supabase
             .from("profiles")
             .select("display_name, avatar_url, is_admin, plan_type")
             .eq("id", user.id)
             .single();
           if (profileData) setProfile({ ...profileData, email: user.email ?? null });

           // Check for published checklists
           const { data: checklistsData } = await supabase
             .from("checklists")
             .select("id")
             .eq("user_id", user.id)
             .limit(1);
           
           setHasChecklists(!!(checklistsData && checklistsData.length > 0));

             // Fetch recent checklists - only those created in the editor (workspace_id is null)
             const { data: recentData } = await supabase
               .from("checklists")
               .select("id, title")
               .eq("user_id", user.id)
               .is("workspace_id", null)
               .order("updated_at", { ascending: false })
               .limit(3);
             
              if (recentData) {
                setRecentChecklists(recentData);
              }
         } else {
           setProfile(null);
           setRecentChecklists([]);
           setHasChecklists(false);
         }
        };
       fetchData();
 
       const handleOpenSearch = () => setSearchOpen(true);
       window.addEventListener('open-search', handleOpenSearch);
       return () => window.removeEventListener('open-search', handleOpenSearch);
     }, [user, currentWorkspace?.id]);

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
  
    return (
        <div className="min-h-screen bg-white text-neutral-900 flex">
       {/* Sidebar */}
       {profile && (
       <aside
         className={`${sidebarOpen ? "w-64 px-3 opacity-100" : "w-0 px-0 -translate-x-full overflow-hidden opacity-0"} border-r border-neutral-200 flex flex-col py-4 shrink-0 h-screen sticky top-0 transition-all duration-300 ease-in-out z-40 bg-white shadow-xl shadow-neutral-200/20`}
       >
        <div className="flex items-center justify-between mb-8 px-1">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="flex items-center gap-1 p-1 rounded-md hover:bg-neutral-100 transition-colors ml-0"
              >
                <div className="w-8 h-8 rounded-full overflow-hidden bg-neutral-200 border border-neutral-200 shrink-0">
                  {profile?.avatar_url ? (
                    <img src={profile.avatar_url} alt="Avatar" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full bg-gradient-to-br from-orange-300 to-pink-400 flex items-center justify-center">
                      <User className="w-4 h-4 text-white" />
                    </div>
                  )}
                </div>
                <ChevronDown className="w-4 h-4 text-neutral-500 shrink-0" />
              </button>
            </DropdownMenuTrigger>
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
                    <Settings className="w-3.5 h-3.5 shrink-0" />
                    <span className="truncate">Configurações</span>
                  </Button>
                </div>
              </div>

              <div className="p-2 pt-0 max-h-[300px] overflow-y-auto">
                <div className="px-2 py-1.5 text-[10px] font-bold text-neutral-400 uppercase tracking-wider">Espaços de Trabalho</div>
                {workspaces.map((ws) => (
                  <DropdownMenuItem
                    key={ws.id}
                    onSelect={() => {
                      setCurrentWorkspace(ws);
                      navigate({ to: "/organizar", search: { id: ws.id } });
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
                      <span className="text-[13px] truncate font-medium">
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
                      <span className="text-[13px] text-neutral-500 truncate group-hover:text-[#FF007F] transition-colors">
                        {profile?.email}
                      </span>
                    </div>
                    <MoreHorizontal className="w-4 h-4 text-neutral-400 group-hover:text-[#FF007F] transition-colors" />
                  </div>
                </DropdownMenuItem>

              <button
                onClick={() => { setCreateWsOpen(true); setNewWsName(""); setNewWsIcon("📁"); }}
                className="w-full flex items-center gap-2 px-2 py-2 mb-1 text-[13px] font-semibold text-[#FF007F] hover:bg-[#FF007F]/5 rounded-md transition-all mx-0 text-left"
              >
                <Plus className="w-4 h-4" />
                Novo espaço de trabalho
              </button>

              <button
                onClick={handleLogout}
                className="w-full text-left px-2 py-2 text-[13px] text-neutral-500 hover:text-[#FF007F] hover:bg-[#FF007F]/5 rounded-md transition-all mx-0"
              >
                Sair
              </button>
              </div>
            </DropdownMenuContent>
          </DropdownMenu>
          <button
            type="button"
            onClick={() => setSidebarOpen(false)}
            className="p-1.5 rounded-md text-neutral-400 hover:text-neutral-900 hover:bg-neutral-100 transition-colors"
            title="Esconder menu"
            aria-label="Esconder menu"
          >
            <ChevronsLeft className="w-4 h-4" />
          </button>
        </div>
        
 
           <div className="mt-2 flex-1 overflow-y-auto no-scrollbar pb-8">
            {profile && (
              <div className="flex flex-col gap-6">
                <ul className="space-y-0.5">
                  {[
                    { icon: Home, label: "Início", to: "/inicio" },
                    { icon: LayoutDashboard, label: "Painel", to: "/painel" },
                    { icon: Search, label: "Buscar" },
                    { icon: Globe, label: "Domínios", to: "/dominios" },
                    { icon: Settings, label: "Configurações", to: "/configuracoes" },
                    { icon: CreditCard, label: "Meu Plano", to: "/membros" },
                    { icon: Briefcase, label: "Espaço de Trabalho", to: "/organizar" },
                    { icon: Users, label: "Equipe", to: "/equipe" },

                  ].map((item: NavItem) => {
                    const Icon = item.icon;
                    const isSearch = item.label === "Buscar";
                    const isActive = item.to === location.pathname;
                    const finalActive = isActive;
                    
                    return (
                      <li key={item.label}>
                        <button
                          type="button"
                          onClick={isSearch
                            ? () => setSearchOpen(true)
                            : item.to
                            ? () => navigate({ to: item.to })
                            : undefined}
                          className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-sm transition-colors ${
                            finalActive 
                              ? "bg-neutral-100 text-neutral-900 font-medium" 
                              : `hover:bg-neutral-100 ${item.accent ?? "text-neutral-700"}`
                          }`}
                        >
                          <Icon className="w-4 h-4" />
                          <span className="truncate">{item.label}</span>
                        </button>
                      </li>
                    );
                  })}

                  <li className="my-2 border-t border-neutral-100 mx-2" />
                  
                  <li key="Recentes" className="mb-2">
                    <button
                      type="button"
                      onClick={() => setRecentOpen(!recentOpen)}
                      className="w-full flex items-center gap-2 px-2 py-1.5 text-sm text-neutral-500 hover:text-neutral-900 transition-colors"
                    >
                      {recentOpen ? (
                        <ChevronDown className="w-4 h-4" />
                      ) : (
                        <ChevronRight className="w-4 h-4" />
                      )}
                      <span>Recentes</span>
                    </button>
                    <div 
                      className={`transition-all duration-300 ease-in-out overflow-hidden ${
                        recentOpen ? "max-h-[200px] overflow-y-auto no-scrollbar opacity-100 mt-1" : "max-h-0 opacity-0"
                      }`}
                    >
                      <ul className="space-y-0.5 ml-6">
                        {recentChecklists.length > 0 ? (
                          recentChecklists.map((chk) => (
                            <li key={chk.id}>
                              <button
                                type="button"
                                onClick={() => navigate({ to: "/checklist", search: { id: chk.id, workspace: undefined, category: undefined } })}
                                className="w-full text-left py-1 text-[13px] text-neutral-400 hover:text-neutral-900 transition-colors truncate block font-medium"
                              >
                                {chk.title || "Sem título"}
                              </button>
                            </li>
                          ))
                        ) : (
                          <li className="py-1 text-[12px] text-neutral-400 italic font-medium">
                            Nenhum checklist recente
                          </li>
                        )}
                      </ul>
                    </div>
                  </li>
                  
                  {profile?.is_admin && (
                    <li key="Admin">
                      <button
                        type="button"
                        onClick={() => navigate({ to: "/admin" })}
                        className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-sm transition-colors ${
                          location.pathname === "/admin" 
                            ? "bg-neutral-100 text-blue-600 font-medium" 
                            : "hover:bg-neutral-100 text-blue-600"
                        }`}
                      >
                        <ShieldCheck className="w-4 h-4" />
                        <span>Painel Admin</span>
                      </button>
                    </li>
                  )}
                </ul>

                <div>
                  <p className="px-2 text-xs font-medium text-neutral-500 mb-1">Produto</p>
                  <NavList items={productNav} />
                </div>
        
                <div>
                  <p className="px-2 text-xs font-medium text-neutral-500 mb-1">Ajuda</p>
                  <NavList items={helpNav} />
                </div>
              </div>
            )}
          </div>
 
          <div className="mt-auto pt-4 space-y-4">
            <button
              type="button"
              className="w-full flex items-center justify-between px-2 py-1.5 rounded-md text-sm text-blue-600 hover:bg-neutral-100"
            >
              <span className="flex items-center gap-2">
                <MessageCircle className="w-4 h-4" />
                Enviar feedback
              </span>
              <span className="w-2 h-2 rounded-full bg-blue-600" />
            </button>
 
            <div className="pt-4 border-t border-neutral-200">
              <div className="flex items-center justify-between group">
                <button 
                  onClick={() => navigate({ to: "/configuracoes" })}
                  className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-neutral-100 transition-colors flex-1 text-left"
                >
                  <div className="w-6 h-6 rounded-full overflow-hidden bg-neutral-200 shrink-0">
                    {profile?.avatar_url ? (
                      <img src={profile.avatar_url} alt="Avatar" className="w-full h-full object-cover" />
                    ) : (
                       <div className="w-full h-full bg-gradient-to-br from-neutral-200 to-neutral-300 flex items-center justify-center">
                         <User className="w-3 h-3 text-neutral-500" />
                       </div>
                     )}
                   </div>
                   <div className="flex-1 min-w-0">
                     <p className="text-sm font-medium text-neutral-900 truncate">
                       {profile?.display_name || "Visitante"}
                     </p>
                     <p className="text-[10px] text-neutral-400 truncate">
                       {profile?.email || "Crie sua conta agora"}
                     </p>
                   </div>
                 </button>
                 {profile ? (
                   <button 
                     onClick={handleLogout}
                     className="p-1.5 text-neutral-400 hover:text-red-500 hover:bg-red-50 rounded-md transition-colors"
                     title="Sair"
                   >
                     <LogOut className="w-4 h-4" />
                   </button>
                 ) : (
                   <button 
                     onClick={() => navigate({ to: "/login" })}
                     className="p-1.5 text-[#FF007F] hover:bg-[#FF007F]/10 rounded-md transition-colors"
                     title="Entrar"
                   >
                     <LogIn className="w-4 h-4" />
                   </button>
                 )}
               </div>
             </div>
           </div>

       </aside>
       )}
 
       {/* Main Content Area */}
       <div className="flex-1 flex flex-col min-h-screen">
         {profile && !sidebarOpen && (
           <button
             type="button"
             onClick={() => setSidebarOpen(true)}
             className="fixed top-[22px] left-6 z-[120] p-1 rounded-md text-neutral-400 hover:text-neutral-900 hover:bg-neutral-100 transition-colors animate-in fade-in bg-white/80 backdrop-blur-sm border border-neutral-200 shadow-sm"
             title="Mostrar menu"
             aria-label="Mostrar menu"
           >
             <ChevronsRight className="w-4 h-4" />
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
                  <CommandItem onSelect={() => { navigate({ to: "/organizar", search: { id: currentWorkspace?.id } }); setSearchOpen(false); }}>
                    <FolderPlus className="mr-2 h-4 w-4" />
                    <span>Criar workspace</span>
                  </CommandItem>
                </>
              )}
            </CommandGroup>
            <CommandGroup heading="Navegação">
              <CommandItem onSelect={() => { navigate({ to: "/equipe" }); setSearchOpen(false); }}>
                <Users className="mr-2 h-4 w-4" />
                <span>Equipe</span>
              </CommandItem>

              <CommandItem onSelect={() => { navigate({ to: "/configuracoes" }); setSearchOpen(false); }}>
                <Share2 className="mr-2 h-4 w-4" />
                <span>Compartilhar</span>
              </CommandItem>
              <CommandItem onSelect={() => { navigate({ to: "/organizar", search: { id: currentWorkspace?.id } }); setSearchOpen(false); }}>
                <Inbox className="mr-2 h-4 w-4" />
                <span>Ver envios</span>
              </CommandItem>
              <CommandItem onSelect={() => { navigate({ to: "/organizar", search: { id: currentWorkspace?.id } }); setSearchOpen(false); }}>
                <BarChart3 className="mr-2 h-4 w-4" />
                <span>Ver insights</span>
              </CommandItem>
              <CommandItem onSelect={() => { navigate({ to: "/inicio" }); setSearchOpen(false); }}>
                <Home className="mr-2 h-4 w-4" />
                <span>Início</span>
              </CommandItem>
              <CommandItem onSelect={() => { navigate({ to: "/organizar", search: { id: currentWorkspace?.id } }); setSearchOpen(false); }}>
                <CheckSquare className="mr-2 h-4 w-4" />
                <span>Checklists</span>
              </CommandItem>
              <CommandItem onSelect={() => { navigate({ to: "/dominios" }); setSearchOpen(false); }}>
                <Globe className="mr-2 h-4 w-4" />
                <span>Domínios</span>
              </CommandItem>
              <CommandItem onSelect={() => { navigate({ to: "/membros" }); setSearchOpen(false); }}>
                <Users className="mr-2 h-4 w-4" />
                <span>Membros</span>
              </CommandItem>
              <CommandItem onSelect={() => { navigate({ to: "/configuracoes" }); setSearchOpen(false); }}>
                <Settings className="mr-2 h-4 w-4" />
                <span>Configurações</span>
              </CommandItem>
              <CommandItem onSelect={() => { navigate({ to: "/organizar", search: { id: currentWorkspace?.id } }); setSearchOpen(false); }}>
                <LayoutTemplate className="mr-2 h-4 w-4" />
                <span>Modelos</span>
              </CommandItem>
              <CommandItem onSelect={() => { navigate({ to: "/membros" }); setSearchOpen(false); }}>
                <Sparkles className="mr-2 h-4 w-4" />
                <span>Atualizar plano</span>
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