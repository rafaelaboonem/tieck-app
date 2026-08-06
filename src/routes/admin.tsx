import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { DashboardLayout } from "@/components/DashboardLayout";
import { 
  Users, 
  FileText, 
  BarChart3, 
  ShieldAlert, 
  Search, 
  MoreHorizontal,
  ArrowUpRight,
  TrendingUp,
  Mail,
  Calendar,
  Settings,
  Plus,
  LayoutTemplate,
  Rocket,
  ShieldCheck,
  Check,
  X
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { useSidebar } from "@/contexts/SidebarContext";
import logoUrl from "../assets/local/logo-tieck.webp";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

export const Route = createFileRoute("/admin")({
  head: () => ({
    meta: [{ title: "Painel Admin — Tieck" }],
  }),
  component: AdminPage,
});

function AdminPage() {
  const navigate = useNavigate();
  const { sidebarOpen } = useSidebar();
  const [isAuthorized, setIsAuthorized] = useState<boolean | null>(null);
  const [stats, setStats] = useState({
    totalUsers: 0,
    totalChecklists: 0,
    totalSubmissions: 0,
    freeUsers: 0,
    proUsers: 0,
    publishedChecklists: 0
  });
  const [users, setUsers] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const checkAuth = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        navigate({ to: "/login" });
        return;
      }

      const { data: profile } = await supabase
        .from("profiles")
        .select("is_admin")
        .eq("id", user.id)
        .single();

      if (profile?.is_admin) {
        setIsAuthorized(true);
        fetchStats();
        fetchUsers();
      } else {
        setIsAuthorized(false);
        toast.error("Acesso restrito ao administrador");
        setTimeout(() => navigate({ to: "/inicio" }), 2000);
      }
    };

    checkAuth();
  }, [navigate]);

  const fetchStats = async () => {
    try {
      const { data: profiles } = await supabase.from("profiles").select("plan_type");
      const { data: checklists } = await supabase.from("checklists").select("is_published");
      const { count: submissionCount } = await supabase.from("checklist_responses").select("*", { count: 'exact', head: true });

      if (profiles && checklists) {
        setStats({
          totalUsers: profiles.length,
          totalChecklists: checklists.length,
          totalSubmissions: submissionCount || 0,
          freeUsers: profiles.filter(p => p.plan_type === 'free' || !p.plan_type).length,
          proUsers: profiles.filter(p => p.plan_type === 'pro').length,
          publishedChecklists: checklists.filter(c => c.is_published === true).length
        });

      }
    } catch (error) {
      console.error("Erro ao carregar stats:", error);
    }
  };

  const fetchUsers = async () => {
    setIsLoading(true);
    try {
      const { data } = await supabase
        .from("profiles")
        .select("*")
        .order("created_at", { ascending: false });
      
      if (data) setUsers(data);
    } catch (error) {
      console.error("Erro ao carregar usuários:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const togglePlan = async (userId: string, currentPlan: string) => {
    const newPlan = currentPlan === 'pro' ? 'free' : 'pro';
    const { error } = await supabase
      .from("profiles")
      .update({ plan_type: newPlan })
      .eq("id", userId);

    if (error) {
      toast.error("Erro ao atualizar plano");
    } else {
      toast.success(`Plano atualizado para ${newPlan.toUpperCase()}`);
      setUsers(users.map(u => u.id === userId ? { ...u, plan_type: newPlan } : u));
      fetchStats();
    }
  };

  if (isAuthorized === null) {
    return (
      <div className="flex h-screen items-center justify-center bg-neutral-50">
        <div className="flex flex-col items-center gap-4">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent"></div>
          <p className="text-neutral-500 font-medium">Verificando autorização...</p>
        </div>
      </div>
    );
  }

  if (isAuthorized === false) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-4 bg-neutral-50 p-4 text-center">
        <div className="p-4 bg-red-50 text-red-600 rounded-full">
          <ShieldAlert className="w-12 h-12" />
        </div>
        <h1 className="text-2xl font-bold text-neutral-900">Acesso Negado</h1>
        <p className="text-neutral-500 max-w-md">
          Você não tem permissão para acessar esta área. Redirecionando para o workspace...
        </p>
      </div>
    );
  }

  return (
    <DashboardLayout>
      <header className="flex items-center justify-between px-6 py-4">
        <div className={`flex items-center gap-2 transition-all duration-300 ${sidebarOpen ? "pl-0" : "pl-14"}`}>
          <img src={logoUrl} alt="Logo" className="w-10 h-10 object-contain" />
          <span className="text-neutral-400">›</span>
          <span className="text-neutral-600 font-medium">Painel Admin</span>
        </div>
      </header>

      <main className="flex-1 px-6 py-8 overflow-y-auto bg-neutral-50/50">
        <div className="max-w-7xl mx-auto space-y-8">
          <div className="flex flex-col gap-1">
            <h1 className="text-3xl font-bold text-neutral-900 tracking-tight">Administração do Sistema</h1>
            <p className="text-neutral-500">Gerencie usuários, modelos, novidades e monitore o crescimento.</p>
          </div>

          <Tabs defaultValue="overview" className="space-y-6">
            <TabsList className="bg-white border border-neutral-200 p-1">
              <TabsTrigger value="overview">Visão Geral</TabsTrigger>
              <TabsTrigger value="users">Usuários</TabsTrigger>
              <TabsTrigger value="templates">Templates</TabsTrigger>
              <TabsTrigger value="updates">Novidades</TabsTrigger>
            </TabsList>

            <TabsContent value="overview" className="space-y-8 outline-none">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <Card className="border-none shadow-sm bg-white">
                  <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
                    <CardTitle className="text-sm font-medium text-neutral-500">Total de Usuários</CardTitle>
                    <Users className="w-4 h-4 text-blue-600" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{stats.totalUsers}</div>
                    <div className="flex items-center gap-3 mt-1">
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-50 text-blue-600 font-medium">{stats.freeUsers} Free</span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-pink-50 text-pink-600 font-medium">{stats.proUsers} Pro</span>
                    </div>
                  </CardContent>
                </Card>

                <Card className="border-none shadow-sm bg-white">
                  <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
                    <CardTitle className="text-sm font-medium text-neutral-500">Checklists Publicados</CardTitle>
                    <FileText className="w-4 h-4 text-pink-500" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{stats.publishedChecklists}</div>
                    <p className="text-xs text-neutral-400 mt-1">De um total de {stats.totalChecklists}</p>
                  </CardContent>
                </Card>

                <Card className="border-none shadow-sm bg-white">
                  <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
                    <CardTitle className="text-sm font-medium text-neutral-500">Envios Recebidos</CardTitle>
                    <BarChart3 className="w-4 h-4 text-orange-500" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{stats.totalSubmissions}</div>
                    <div className="flex items-center text-xs text-green-600 font-medium mt-1">
                      <TrendingUp className="w-3 h-3 mr-1" />
                      Crescimento constante
                    </div>
                  </CardContent>
                </Card>

                <Card className="border-none shadow-sm bg-white">
                  <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
                    <CardTitle className="text-sm font-medium text-neutral-500">Conversão Pro</CardTitle>
                    <Rocket className="w-4 h-4 text-green-600" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">
                      {stats.totalUsers > 0 ? ((stats.proUsers / stats.totalUsers) * 100).toFixed(1) : 0}%
                    </div>
                    <p className="text-xs text-neutral-400 mt-1">Taxa de conversão atual</p>
                  </CardContent>
                </Card>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <Card className="lg:col-span-2 border-none shadow-sm bg-white">
                  <CardHeader>
                    <CardTitle className="text-lg">Atividade Recente</CardTitle>
                    <CardDescription>Monitoramento das últimas ações no sistema.</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      {users.slice(0, 5).map((user) => (
                        <div key={user.id} className="flex items-center justify-between p-2 rounded-lg hover:bg-neutral-50 transition-colors">
                          <div className="flex items-center gap-3">
                            <Avatar className="w-9 h-9">
                              <AvatarImage src={user.avatar_url} />
                              <AvatarFallback>{(user.display_name || "?").charAt(0)}</AvatarFallback>
                            </Avatar>
                            <div>
                              <p className="text-sm font-semibold text-neutral-900">{user.display_name || "Sem nome"}</p>
                              <p className="text-xs text-neutral-500">Cadastrado em {new Date(user.created_at).toLocaleDateString()}</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase ${user.plan_type === 'pro' ? 'bg-pink-100 text-pink-700' : 'bg-neutral-100 text-neutral-600'}`}>
                              {user.plan_type || 'free'}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>

                <Card className="border-none shadow-sm bg-white">
                  <CardHeader>
                    <CardTitle className="text-lg">Ações Rápidas</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <Button variant="outline" className="w-full justify-start gap-2 h-11 text-sm font-medium" onClick={() => toast.info("Funcionalidade em breve")}>
                      <LayoutTemplate className="w-4 h-4 text-blue-500" /> Criar Novo Template
                    </Button>
                    <Button variant="outline" className="w-full justify-start gap-2 h-11 text-sm font-medium" onClick={() => toast.info("Funcionalidade em breve")}>
                      <Rocket className="w-4 h-4 text-pink-500" /> Adicionar Novidade
                    </Button>
                    <Button variant="outline" className="w-full justify-start gap-2 h-11 text-sm font-medium" onClick={() => toast.info("Funcionalidade em breve")}>
                      <ShieldCheck className="w-4 h-4 text-green-500" /> Administrar Acessos
                    </Button>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            <TabsContent value="users" className="outline-none">
              <Card className="border-none shadow-sm bg-white">
                <CardHeader>
                  <CardTitle>Gestão de Usuários</CardTitle>
                  <CardDescription>Visualize todos os usuários e altere seus planos de acesso.</CardDescription>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Usuário</TableHead>
                        <TableHead>Cadastro</TableHead>
                        <TableHead>Plano</TableHead>
                        <TableHead className="text-right">Ações</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {users.map((user) => (
                        <TableRow key={user.id}>
                          <TableCell className="font-medium">
                            <div className="flex items-center gap-2">
                              <Avatar className="w-8 h-8">
                                <AvatarImage src={user.avatar_url} />
                              <AvatarFallback>{(user.display_name || "?").charAt(0)}</AvatarFallback>
                              </Avatar>
                              <span>{user.display_name || "Sem nome"}</span>
                              {user.is_admin && <ShieldCheck className="w-3 h-3 text-blue-500" />}
                            </div>

                          </TableCell>
                          <TableCell className="text-neutral-500 text-sm">
                            {new Date(user.created_at).toLocaleDateString()}
                          </TableCell>
                          <TableCell>
                            <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase ${user.plan_type === 'pro' ? 'bg-pink-100 text-pink-700' : 'bg-neutral-100 text-neutral-600'}`}>
                              {user.plan_type || 'free'}
                            </span>
                          </TableCell>
                          <TableCell className="text-right">
                            <Button 
                              variant="ghost" 
                              size="sm" 
                              className="text-xs h-8"
                              onClick={() => togglePlan(user.id, user.plan_type || 'free')}
                            >
                              {user.plan_type === 'pro' ? 'Rebaixar para Free' : 'Promover para Pro'}
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="templates" className="outline-none">
               <div className="flex flex-col items-center justify-center py-12 bg-white rounded-xl border border-dashed border-neutral-200">
                  <LayoutTemplate className="w-12 h-12 text-neutral-300 mb-4" />
                  <h3 className="text-lg font-semibold text-neutral-900">Gestão de Templates</h3>
                  <p className="text-neutral-500 mb-6">Crie modelos para seus usuários começarem mais rápido.</p>
                  <Button onClick={() => toast.info("Em breve: Interface de criação de templates")}>
                    <Plus className="w-4 h-4 mr-2" /> Criar Primeiro Template
                  </Button>
               </div>
            </TabsContent>

            <TabsContent value="updates" className="outline-none">
              <div className="flex flex-col items-center justify-center py-12 bg-white rounded-xl border border-dashed border-neutral-200">
                  <Rocket className="w-12 h-12 text-neutral-300 mb-4" />
                  <h3 className="text-lg font-semibold text-neutral-900">Novidades & Atualizações</h3>
                  <p className="text-neutral-500 mb-6">Mantenha seus usuários informados sobre o que há de novo.</p>
                  <Button onClick={() => toast.info("Em breve: Editor de novidades")}>
                    <Plus className="w-4 h-4 mr-2" /> Adicionar Novidade
                  </Button>
               </div>
            </TabsContent>
          </Tabs>
        </div>
      </main>
    </DashboardLayout>
  );
}

