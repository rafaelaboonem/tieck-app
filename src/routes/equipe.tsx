import { createFileRoute } from '@tanstack/react-router';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { DashboardLayout } from '@/components/DashboardLayout';
import { Users, UserPlus, Shield, Mail, Clock, MoreHorizontal, ShieldCheck, UserMinus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuTrigger 
} from '@/components/ui/dropdown-menu';
import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export const Route = createFileRoute('/equipe')({
  component: TeamPage,
});

function TeamPage() {
  const { currentWorkspace } = useWorkspace();
  const [members, setMembers] = useState<any[]>([]);
  const [invitations, setInvitations] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchTeamData = async () => {
    if (!currentWorkspace) return;
    setLoading(true);
    try {
      const [membersRes, invitesRes] = await Promise.all([
        supabase
          .from('workspace_members')
          .select(`
            id,
            role,
            status,
            created_at,
            user_id,
            email_normalized,
            profiles:profiles (
              id,
              full_name,
              avatar_url
            )
          `)
          .eq('workspace_id', currentWorkspace.id),
        supabase
          .from('workspace_invitations')
          .select('*')
          .eq('workspace_id', currentWorkspace.id)
          .eq('status', 'pending')
      ]);

      if (membersRes.error) throw membersRes.error;
      if (invitesRes.error) throw invitesRes.error;

      setMembers(membersRes.data || []);
      setInvitations(invitesRes.data || []);
    } catch (error) {
      console.error('Error fetching team data:', error);
      toast.error('Erro ao carregar dados da equipe');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTeamData();
  }, [currentWorkspace?.id]);

  const getRoleLabel = (role: string) => {
    const roles: Record<string, string> = {
      owner: 'Proprietário',
      admin: 'Administrador',
      editor: 'Editor',
      viewer: 'Visualizador'
    };
    return roles[role] || role;
  };

  if (!currentWorkspace) return null;

  return (
    <DashboardLayout>
      <div className="flex flex-col h-full bg-white">
        <header className="px-6 py-8 border-b border-neutral-100 shrink-0">
          <div className="flex items-center justify-between max-w-5xl mx-auto w-full">
            <div>
              <h1 className="text-2xl font-bold text-neutral-900 flex items-center gap-2">
                <Users className="w-6 h-6 text-neutral-400" />
                Equipe
              </h1>
              <p className="text-sm text-neutral-500 mt-1">
                Gerencie os membros e permissões do workspace <span className="font-semibold text-neutral-700">{currentWorkspace.name}</span>.
              </p>
            </div>
            <Button className="bg-pink-500 hover:bg-pink-600 text-white gap-2">
              <UserPlus className="w-4 h-4" />
              Convidar
            </Button>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-6">
          <div className="max-w-5xl mx-auto w-full">
            <Tabs defaultValue="members" className="w-full">
              <TabsList className="bg-neutral-100/50 p-1 rounded-lg mb-6">
                <TabsTrigger value="members" className="data-[state=active]:bg-white data-[state=active]:shadow-sm px-6 py-2">
                  Membros ({members.length})
                </TabsTrigger>
                <TabsTrigger value="invitations" className="data-[state=active]:bg-white data-[state=active]:shadow-sm px-6 py-2">
                  Convites Pendentes ({invitations.length})
                </TabsTrigger>
                <TabsTrigger value="assignments" className="data-[state=active]:bg-white data-[state=active]:shadow-sm px-6 py-2">
                  Atribuições
                </TabsTrigger>
              </TabsList>

              <TabsContent value="members" className="space-y-4">
                <div className="border border-neutral-100 rounded-xl overflow-hidden shadow-sm">
                  <table className="w-full text-left border-collapse">
                    <thead className="bg-neutral-50 border-b border-neutral-100">
                      <tr>
                        <th className="px-6 py-3 text-xs font-bold uppercase text-neutral-500 tracking-wider">Usuário</th>
                        <th className="px-6 py-3 text-xs font-bold uppercase text-neutral-500 tracking-wider">Função</th>
                        <th className="px-6 py-3 text-xs font-bold uppercase text-neutral-500 tracking-wider">Status</th>
                        <th className="px-6 py-3 text-xs font-bold uppercase text-neutral-500 tracking-wider text-right">Ações</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-neutral-100">
                      {members.map((member) => (
                        <tr key={member.id} className="hover:bg-neutral-50/50 transition-colors group">
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-3">
                              <div className="w-9 h-9 rounded-full bg-neutral-100 flex items-center justify-center overflow-hidden border border-neutral-200">
                                {member.profiles?.avatar_url ? (
                                  <img src={member.profiles.avatar_url} alt="" className="w-full h-full object-cover" />
                                ) : (
                                  <Users className="w-4 h-4 text-neutral-400" />
                                )}
                              </div>
                              <div>
                                <div className="text-sm font-semibold text-neutral-900">{member.profiles?.full_name || 'Usuário'}</div>
                                <div className="text-xs text-neutral-500">{member.email_normalized}</div>
                              </div>
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-1.5 text-sm text-neutral-600">
                              {member.role === 'owner' ? (
                                <ShieldCheck className="w-4 h-4 text-pink-500" />
                              ) : (
                                <Shield className="w-4 h-4 text-neutral-400" />
                              )}
                              {getRoleLabel(member.role)}
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-50 text-green-700 border border-green-100">
                              Ativo
                            </span>
                          </td>
                          <td className="px-6 py-4 text-right">
                            {member.role !== 'owner' && (
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button variant="ghost" size="sm" className="h-8 w-8 p-0 hover:bg-neutral-100">
                                    <MoreHorizontal className="w-4 h-4 text-neutral-400" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end" className="w-48">
                                  <DropdownMenuItem className="text-sm">Alterar permissão</DropdownMenuItem>
                                  <DropdownMenuItem className="text-sm text-red-600 focus:text-red-600">
                                    <UserMinus className="w-4 h-4 mr-2" />
                                    Remover da equipe
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </TabsContent>

              <TabsContent value="invitations">
                {invitations.length === 0 ? (
                  <div className="py-20 text-center border-2 border-dashed border-neutral-100 rounded-2xl">
                    <Mail className="w-12 h-12 text-neutral-200 mx-auto mb-4" />
                    <h3 className="text-lg font-semibold text-neutral-900">Nenhum convite pendente</h3>
                    <p className="text-sm text-neutral-500 mt-1">
                      Convide novos membros para colaborar neste workspace.
                    </p>
                    <Button className="mt-6 bg-white border border-neutral-200 text-neutral-700 hover:bg-neutral-50">
                      Enviar primeiro convite
                    </Button>
                  </div>
                ) : (
                  <div className="grid gap-4">
                    {invitations.map((invite) => (
                      <div key={invite.id} className="flex items-center justify-between p-4 border border-neutral-100 rounded-xl hover:shadow-sm transition-all">
                        <div className="flex items-center gap-4">
                          <div className="w-10 h-10 rounded-full bg-pink-50 flex items-center justify-center">
                            <Mail className="w-5 h-5 text-pink-500" />
                          </div>
                          <div>
                            <div className="text-sm font-semibold text-neutral-900">{invite.email}</div>
                            <div className="flex items-center gap-2 text-xs text-neutral-500 mt-0.5">
                              <span className="px-1.5 py-0.5 rounded bg-neutral-100 font-medium">{getRoleLabel(invite.role)}</span>
                              <span>•</span>
                              <Clock className="w-3 h-3" />
                              <span>Expira em {new Date(invite.expires_at).toLocaleDateString()}</span>
                            </div>
                          </div>
                        </div>
                        <Button variant="outline" size="sm" className="text-xs">
                          Revogar
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </TabsContent>

              <TabsContent value="assignments">
                <div className="py-20 text-center bg-neutral-50 rounded-2xl border border-neutral-100">
                  <Clock className="w-12 h-12 text-neutral-200 mx-auto mb-4" />
                  <h3 className="text-lg font-semibold text-neutral-900">Em desenvolvimento</h3>
                  <p className="text-sm text-neutral-500 mt-1 max-w-xs mx-auto">
                    A visualização detalhada de atribuições por checklist está sendo preparada.
                  </p>
                </div>
              </TabsContent>
            </Tabs>
          </div>
        </main>
      </div>
    </DashboardLayout>
  );
}
