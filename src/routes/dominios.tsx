import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Globe, Search, Copy, Edit2, Check, X, ExternalLink } from "lucide-react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { useSidebar } from "@/contexts/SidebarContext";
import { useAuth } from "@/contexts/AuthContext";
import logo from "../assets/local/logo-k.webp";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";

export const Route = createFileRoute("/dominios")({
  head: () => ({
    meta: [{ title: "Personalizar Links — ChecklistApp" }],
  }),
  component: DominiosPage,
});

interface Checklist {
  id: string;
  title: string | null;
  custom_slug: string | null;
  is_published: boolean | null;
}

function DominiosPage() {
  const { sidebarOpen } = useSidebar();
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [checklists, setChecklists] = useState<Checklist[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [profile, setProfile] = useState<any>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!loading && !user) {
      navigate({ to: "/login" });
      return;
    }
    fetchData();
  }, [user, loading, navigate]);

  const fetchData = async () => {
    setIsLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data: prof } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .single();
    
    setProfile(prof);

    const { data: checklistData } = await supabase
      .from("checklists")
      .select("id, title, custom_slug, is_published")
      .eq("user_id", user.id)
      .eq("is_published", true)
      .order("created_at", { ascending: false });
    
    if (checklistData) setChecklists(checklistData);
    setIsLoading(false);
  };

  const handleStartEdit = (checklist: Checklist) => {
    if (profile?.plan_type !== "pro") {
      toast.error("Personalização de links disponível apenas no plano PRO.");
      return;
    }
    setEditingId(checklist.id);
    setEditValue(checklist.custom_slug || "");
  };

  const handleSaveSlug = async (id: string) => {
    // Sanitizar slug: apenas letras minúsculas, números e hífens
    const sanitizedSlug = editValue
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9-]/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "");

    if (sanitizedSlug.length < 3 && sanitizedSlug !== "") {
      toast.error("O link deve ter pelo menos 3 caracteres.");
      return;
    }

    setIsSaving(true);
    const { error } = await supabase
      .from("checklists")
      .update({ custom_slug: sanitizedSlug || null })
      .eq("id", id);

    if (error) {
      if (error.code === "23505") {
        toast.error("Este link já está sendo usado por outro checklist.");
      } else {
        toast.error("Erro ao salvar link personalizado.");
      }
    } else {
      toast.success("Link atualizado com sucesso!");
      setChecklists(prev => prev.map(c => c.id === id ? { ...c, custom_slug: sanitizedSlug || null } : c));
      setEditingId(null);
    }
    setIsSaving(false);
  };

  const copyToClipboard = (slug: string | null, id: string) => {
    const baseUrl = window.location.origin;
    const finalSlug = slug || id;
    const url = `${baseUrl}/c/${finalSlug}`;
    navigator.clipboard.writeText(url);
    toast.success("Link copiado para a área de transferência!");
  };

  const isPro = profile?.plan_type === "pro";

  return (
    <DashboardLayout>
      <header className="flex items-center justify-between px-6 py-4 border-b border-neutral-200 bg-white sticky top-0 z-10">
        <div className={cn(
          "flex items-center gap-2 text-sm transition-all duration-300",
          sidebarOpen ? "pl-0" : "pl-14",
          !sidebarOpen && "pl-14 sm:pl-14", // desktop collapse
          "pl-0 sm:pl-0"
        )}>
          {/* O container acima já lida com o padding do botão desktop, mas vamos refinar */}
          <div className={cn(
            "flex items-center gap-2",
            !sidebarOpen && "ml-12 sm:ml-0" // Compensa o botão mobile fixo se estiver visível
          )}>
            <Link to="/inicio">
              <img src={logo} alt="Logo" className="w-10 h-10 sm:w-20 sm:h-20 object-contain grayscale hover:grayscale-0 transition-all cursor-pointer" />
            </Link>
            <span className="text-neutral-400">›</span>
            <span className="text-neutral-700 font-medium truncate max-w-[150px] sm:max-w-none">Personalizar Links</span>
          </div>
        </div>
        <button className="flex items-center gap-1 text-sm text-neutral-500 hover:text-neutral-900">
          <Search className="w-4 h-4" /> Buscar
        </button>
      </header>

      <main className="flex-1 px-6 py-8 overflow-y-auto bg-neutral-50/50 min-h-[calc(100vh-73px)]">
        <div className="max-w-4xl mx-auto">
          <div className="mb-8">
            <h1 className="text-2xl font-bold text-neutral-900">Links dos Checklists</h1>
            <p className="text-sm text-neutral-500 mt-1">
              Gerencie e personalize os links públicos dos seus checklists ativos.
            </p>
          </div>

          {!isPro && !isLoading && (
            <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 mb-8 flex items-start gap-3">
              <div className="p-2 bg-white rounded-lg shadow-sm">
                <Globe className="w-5 h-5 text-blue-500" />
              </div>
              <div className="flex-1">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-blue-900 flex items-center gap-2">
                    Turbine seus links com o Plano PRO
                  </h3>
                  <span className="text-[10px] bg-blue-500 text-white px-2 py-0.5 rounded-full uppercase font-bold">Recomendado</span>
                </div>
                <p className="text-sm text-blue-700 mt-1">
                  Substitua códigos aleatórios por nomes amigáveis (ex: tieck.com/c/minha-empresa) e passe mais credibilidade aos seus clientes.
                </p>
                <Button variant="outline" className="mt-3 bg-white text-blue-600 border-blue-200 hover:bg-blue-50 h-8 text-xs font-bold">
                  Conhecer Planos
                </Button>
              </div>
            </div>
          )}

          <div className="bg-white border border-neutral-200 rounded-2xl overflow-hidden shadow-sm">
            <div className="divide-y divide-neutral-100">
              {isLoading ? (
                Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="p-6">
                    <Skeleton className="h-6 w-1/3 mb-2" />
                    <Skeleton className="h-4 w-1/2" />
                  </div>
                ))
              ) : checklists.length === 0 ? (
                <div className="p-12 text-center">
                  <div className="w-16 h-16 bg-neutral-100 rounded-full flex items-center justify-center mx-auto mb-4">
                    <Globe className="w-8 h-8 text-neutral-400" />
                  </div>
                  <h3 className="text-lg font-medium text-neutral-900 mb-1">Nenhum checklist publicado</h3>
                  <p className="text-neutral-500 max-w-sm mx-auto">
                    Publique um checklist no seu painel para que ele apareça aqui e você possa personalizar o link.
                  </p>
                  <Button asChild className="mt-6 bg-blue-600 hover:bg-blue-700">
                    <Link to="/inicio">Ir para o início</Link>
                  </Button>
                </div>
              ) : (
                checklists.map((checklist) => (
                  <div 
                    key={checklist.id} 
                    className="group p-6 hover:bg-neutral-50 transition-all flex flex-col md:flex-row md:items-center justify-between gap-4"
                  >
                    <div className="flex-1 min-w-0">
                      <h3 className="text-base font-semibold text-neutral-900 truncate flex items-center gap-2">
                        {checklist.title || "Sem título"}
                        {checklist.custom_slug && checklist.custom_slug.length !== 6 ? (
                          <span className="text-[10px] bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-bold uppercase">
                            Personalizado
                          </span>
                        ) : (
                          <span className="text-[10px] bg-neutral-100 text-neutral-500 px-2 py-0.5 rounded-full font-bold uppercase">
                            Padrão
                          </span>
                        )}
                      </h3>
                      
                      <div className="mt-2 flex items-center gap-2 text-sm text-neutral-500">
                        <span className="truncate">tieck.com/c/</span>
                        {editingId === checklist.id ? (
                          <div className="flex items-center gap-2 flex-1">
                            <Input
                              value={editValue}
                              onChange={(e) => setEditValue(e.target.value)}
                              className="h-8 py-1 px-2 text-sm border-blue-300 focus:ring-blue-100 max-w-[200px]"
                              placeholder="nome-do-link"
                              autoFocus
                            />
                            <Button 
                              size="sm" 
                              className="h-8 w-8 p-0 bg-green-600 hover:bg-green-700"
                              onClick={() => handleSaveSlug(checklist.id)}
                              disabled={isSaving}
                            >
                              <Check className="w-4 h-4" />
                            </Button>
                            <Button 
                              size="sm" 
                              variant="outline" 
                              className="h-8 w-8 p-0"
                              onClick={() => setEditingId(null)}
                              disabled={isSaving}
                            >
                              <X className="w-4 h-4" />
                            </Button>
                          </div>
                        ) : (
                          <span className={`font-medium ${checklist.custom_slug ? "text-blue-600" : "text-neutral-400 font-normal italic"}`}>
                            {checklist.custom_slug || checklist.id}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 opacity-100 md:opacity-0 group-hover:opacity-100 transition-opacity">
                      {editingId !== checklist.id && (
                        <>
                          <Button 
                            variant="outline" 
                            size="sm" 
                            className="h-9 gap-2"
                            onClick={() => handleStartEdit(checklist)}
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                            Personalizar
                          </Button>
                          <Button 
                            variant="outline" 
                            size="sm" 
                            className="h-9 w-9 p-0"
                            onClick={() => copyToClipboard(checklist.custom_slug, checklist.id)}
                            title="Copiar Link"
                          >
                            <Copy className="w-3.5 h-3.5" />
                          </Button>
                          <Button 
                            variant="outline" 
                            size="sm" 
                            className="h-9 w-9 p-0"
                            asChild
                            title="Ver Checklist"
                          >
                            <a 
                              href={`/c/${checklist.custom_slug || checklist.id}`} 
                              target="_blank" 
                              rel="noopener noreferrer"
                            >
                              <ExternalLink className="w-3.5 h-3.5" />
                            </a>
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </main>
    </DashboardLayout>
  );
}
