import { createFileRoute } from '@tanstack/react-router';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { DashboardLayout } from '@/components/DashboardLayout';
import { Users, UserPlus, Shield, Mail, Clock, MoreHorizontal, ShieldCheck, UserMinus, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuPortal,
  DropdownMenuSubContent
} from '@/components/ui/dropdown-menu';
import { 
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';


export const Route = createFileRoute('/equipe')({
  component: TeamPage,
});

export interface WorkspaceMemberView {
  id: string;
  role: 'admin' | 'editor' | 'viewer';
  status: 'active' | 'inactive';
  created_at: string;
  user_id: string;
  email_normalized: string;
  profiles?: {
    display_name: string | null;
    avatar_url: string | null;
  };
  is_owner?: boolean;
}

export interface WorkspaceInvitationView {
  id: string;
  email_normalized: string;
  role: 'admin' | 'editor' | 'viewer';
  status: 'pending' | 'accepted' | 'revoked';
  expires_at: string;
  created_at: string;
}

export interface ChecklistAssignmentView {
  id: string;
  checklist_id: string;
  workspace_member_id: string;
  is_primary: boolean;
  checklists: {
    id: string;
    title: string | null;
  } | null;
}


function TeamPage() {
  const { currentWorkspace } = useWorkspace();
  const [members, setMembers] = useState<WorkspaceMemberView[]>([]);
  const [invitations, setInvitations] = useState<WorkspaceInvitationView[]>([]);
  const [assignments, setAssignments] = useState<ChecklistAssignmentView[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentUserRole, setCurrentUserRole] = useState<'owner' | 'admin' | 'editor' | 'viewer' | null>(null);
  
  // Modals state
  const [inviteModalOpen, setInviteModalOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<'admin' | 'editor' | 'viewer'>('viewer');
  const [inviting, setInviting] = useState(false);
  
  const [memberToEdit, setMemberToEdit] = useState<WorkspaceMemberView | null>(null);
  const [memberToRemove, setMemberToRemove] = useState<WorkspaceMemberView | null>(null);
  const [invitationToRevoke, setInvitationToRevoke] = useState<WorkspaceInvitationView | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  const fetchTeamData = async () => {
    if (!currentWorkspace) return;
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Determine current user role
      const isOwner = currentWorkspace.owner_id === user.id;
      if (isOwner) {
        setCurrentUserRole('owner');
      } else {
        const { data: memberRoleData } = await supabase
          .from('workspace_members')
          .select('role')
          .eq('workspace_id', currentWorkspace.id)
          .eq('user_id', user.id)
          .eq('status', 'active')
          .maybeSingle();
        
        setCurrentUserRole(memberRoleData?.role as any || 'viewer');
      }

      // 1. Fetch members
      const { data: membersData, error: membersError } = await supabase
        .from('workspace_members')
        .select(`
          id,
          role,
          status,
          created_at,
          user_id,
          email_normalized
        `)
        .eq('workspace_id', currentWorkspace.id);

      if (membersError) throw membersError;

      // 2. Fetch profiles for those members
      const userIds = membersData.map(m => m.user_id).filter((id): id is string => !!id);
      const { data: profilesData } = await supabase
        .from('profiles')
        .select('id, display_name, avatar_url')
        .in('id', userIds);

      const membersWithProfiles: WorkspaceMemberView[] = membersData.map(member => ({
        ...member,
        user_id: member.user_id as string,
        role: member.role as any,
        status: member.status as any,
        is_owner: currentWorkspace.owner_id === member.user_id,
        profiles: profilesData?.find(p => p.id === member.user_id)
      }));

      // 3. Fetch invitations
      const { data: invitesData, error: invitesError } = await supabase
        .from('workspace_invitations')
        .select('*')
        .eq('workspace_id', currentWorkspace.id)
        .eq('status', 'pending');

      if (invitesError) throw invitesError;

      // 4. Fetch assignments
      const { data: assignmentsData } = await supabase
        .from('checklist_assignments')
        .select(`
          id,
          checklist_id,
          workspace_member_id,
          is_primary,
          checklists:checklists (
            id,
            title
          )
        `)
        .eq('workspace_id', currentWorkspace.id);

      setMembers(membersWithProfiles);
      setInvitations(invitesData as WorkspaceInvitationView[]);
      setAssignments(assignmentsData || []);
    } catch (error) {
      console.error('Error fetching team data:', error);
      toast.error('Erro ao carregar dados da equipe');
    } finally {
      setLoading(false);
    }
  };

  const handleInvite = async () => {
    if (!currentWorkspace || !inviteEmail) return;
    setInviting(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const response = await fetch('/api/public/invitations/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token}`
        },
        body: JSON.stringify({
          workspaceId: currentWorkspace.id,
          email: inviteEmail,
          role: inviteRole
        })
      });

      const result = await response.json();
      if (!result.ok) throw new Error(result.code);

      toast.success('Convite gerado com sucesso!');
      if (result.invitation.link) {
        try {
          await navigator.clipboard.writeText(result.invitation.link);
          toast.info('Link de convite copiado para a área de transferência.');
        } catch (err) {
          console.warn('Clipboard access denied');
        }
      }
      
      setInviteModalOpen(false);
      setInviteEmail('');
      fetchTeamData();
    } catch (error: any) {
      console.error('Invite error:', error);
      const msg = error.message;
      const errorMap: Record<string, string> = {
        rate_limit: 'Limite de convites excedido. Tente mais tarde.',
        already_member: 'Este usuário já é membro deste workspace.',
        forbidden: 'Você não tem permissão para convidar nesta função.'
      };
      toast.error(errorMap[msg] || 'Erro interno ao convidar');
    } finally {
      setInviting(false);
    }
  };

  const handleRevoke = async (id: string) => {
    if (!currentWorkspace) return;
    setActionLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const response = await fetch('/api/team/invitations/revoke', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token}`
        },
        body: JSON.stringify({
          workspaceId: currentWorkspace.id,
          invitationId: id
        })
      });

      const result = await response.json();
      if (!result.ok) throw new Error(result.code);

      toast.success('Convite revogado');
      fetchTeamData();
    } catch (error: any) {
      toast.error(`Erro ao revogar convite: ${error.message}`);
    } finally {
      setActionLoading(false);
      setInvitationToRevoke(null);
    }
  };

  const handleResend = async (id: string) => {
    if (!currentWorkspace) return;
    setActionLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const response = await fetch('/api/team/invitations/resend', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token}`
        },
        body: JSON.stringify({
          workspaceId: currentWorkspace.id,
          invitationId: id
        })
      });

      const result = await response.json();
      if (!result.ok) throw new Error(result.code);

      toast.success('Convite reenviado!');
      if (result.invitation.link) {
        try {
          await navigator.clipboard.writeText(result.invitation.link);
          toast.info('Novo link copiado para a área de transferência.');
        } catch (err) {
          console.warn('Clipboard access denied');
        }
      }
      fetchTeamData();
    } catch (error: any) {
      toast.error(`Erro ao reenviar convite: ${error.message}`);
    } finally {
      setActionLoading(false);
    }
  };

  const handleRemoveMember = async (id: string) => {
    if (!currentWorkspace) return;
    setActionLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const response = await fetch('/api/team/members/update', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token}`
        },
        body: JSON.stringify({
          workspaceId: currentWorkspace.id,
          memberId: id,
          status: 'inactive'
        })
      });

      const result = await response.json();
      if (!result.ok) throw new Error(result.code);

      toast.success('Membro removido');
      fetchTeamData();
    } catch (error: any) {
      toast.error(`Erro ao remover membro: ${error.message}`);
    } finally {
      setActionLoading(false);
      setMemberToRemove(null);
    }
  };

  const handleChangeRole = async (id: string, newRole: 'admin' | 'editor' | 'viewer') => {
    if (!currentWorkspace) return;
    setActionLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const response = await fetch('/api/team/members/update', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token}`
        },
        body: JSON.stringify({
          workspaceId: currentWorkspace.id,
          memberId: id,
          role: newRole
        })
      });

      const result = await response.json();
      if (!result.ok) throw new Error(result.code);

      toast.success('Permissão atualizada');
      fetchTeamData();
    } catch (error: any) {
      toast.error(`Erro ao atualizar permissão: ${error.message}`);
    } finally {
      setActionLoading(false);
      setMemberToEdit(null);
    }
  };


  useEffect(() => {
    fetchTeamData();
  }, [currentWorkspace?.id]);

  const getRoleLabel = (member: WorkspaceMemberView) => {
    if (member.is_owner) return 'Proprietário';
    const roles: Record<string, string> = {
      admin: 'Administrador',
      editor: 'Editor',
      viewer: 'Visualizador'
    };
    return roles[member.role] || member.role;
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
            {(currentUserRole === 'admin' || currentUserRole === 'owner') && (
              <Button 
                className="bg-pink-500 hover:bg-pink-600 text-white gap-2"
                onClick={() => setInviteModalOpen(true)}
              >
                <UserPlus className="w-4 h-4" />
                Convidar
              </Button>
            )}
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
                  Atribuições ({assignments.length})
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
                                <div className="text-sm font-semibold text-neutral-900">{member.profiles?.display_name || 'Usuário'}</div>
                                <div className="text-xs text-neutral-500">{member.email_normalized}</div>
                              </div>
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-1.5 text-sm text-neutral-600">
                              {member.is_owner ? (
                                <ShieldCheck className="w-4 h-4 text-pink-500" />
                              ) : (
                                <Shield className="w-4 h-4 text-neutral-400" />
                              )}
                              {getRoleLabel(member)}
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${
                              member.status === 'active' 
                                ? 'bg-green-50 text-green-700 border-green-100' 
                                : 'bg-neutral-50 text-neutral-700 border-neutral-100'
                            }`}>
                              {member.status === 'active' ? 'Ativo' : 'Inativo'}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-right">
                            {!member.is_owner && (currentUserRole === 'owner' || (currentUserRole === 'admin' && member.role !== 'admin')) && (
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button variant="ghost" size="sm" className="h-8 w-8 p-0 hover:bg-neutral-100">
                                    <MoreHorizontal className="w-4 h-4 text-neutral-400" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end" className="w-48">
                                  <DropdownMenuLabel className="text-xs font-bold text-neutral-500 uppercase">Ações</DropdownMenuLabel>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuSub>
                                    <DropdownMenuSubTrigger className="text-sm">Alterar permissão</DropdownMenuSubTrigger>
                                    <DropdownMenuPortal>
                                      <DropdownMenuSubContent>
                                        {currentUserRole === 'owner' && (
                                          <DropdownMenuItem onClick={() => handleChangeRole(member.id, 'admin')}>Administrador</DropdownMenuItem>
                                        )}
                                        <DropdownMenuItem onClick={() => handleChangeRole(member.id, 'editor')}>Editor</DropdownMenuItem>
                                        <DropdownMenuItem onClick={() => handleChangeRole(member.id, 'viewer')}>Visualizador</DropdownMenuItem>
                                      </DropdownMenuSubContent>
                                    </DropdownMenuPortal>
                                  </DropdownMenuSub>
                                  <DropdownMenuItem 
                                    className="text-sm text-red-600 focus:text-red-600"
                                    onClick={() => setMemberToRemove(member)}
                                  >
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
                    <Button 
                      className="mt-6 bg-white border border-neutral-200 text-neutral-700 hover:bg-neutral-50"
                      onClick={() => setInviteModalOpen(true)}
                    >
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
                            <div className="text-sm font-semibold text-neutral-900">{invite.email_normalized}</div>
                            <div className="flex items-center gap-2 text-xs text-neutral-500 mt-0.5">
                              <span className="px-1.5 py-0.5 rounded bg-neutral-100 font-medium">{invite.role}</span>
                              <span>•</span>
                              <Clock className="w-3 h-3" />
                              <span>Expira em {new Date(invite.expires_at).toLocaleDateString()}</span>
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            className="text-neutral-500"
                            onClick={() => handleResend(invite.id)}
                            disabled={actionLoading}
                          >
                            <RefreshCw className={`w-4 h-4 mr-2 ${actionLoading ? 'animate-spin' : ''}`} />
                            Reenviar
                          </Button>
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            className="text-red-500 hover:text-red-600 hover:bg-red-50"
                            onClick={() => setInvitationToRevoke(invite)}
                            disabled={actionLoading}
                          >
                            Revogar
                          </Button>
                        </div>
                      </div>
                    ))}

                  </div>
                )}
              </TabsContent>


              <TabsContent value="assignments">
                <div className="border border-neutral-100 rounded-xl overflow-hidden shadow-sm bg-white">
                  <table className="w-full text-left border-collapse">
                    <thead className="bg-neutral-50 border-b border-neutral-100">
                      <tr>
                        <th className="px-6 py-3 text-xs font-bold uppercase text-neutral-500 tracking-wider">Checklist</th>
                        <th className="px-6 py-3 text-xs font-bold uppercase text-neutral-500 tracking-wider">Membro Atribuído</th>
                        <th className="px-6 py-3 text-xs font-bold uppercase text-neutral-500 tracking-wider">Tipo</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-neutral-100">
                      {assignments.length === 0 ? (
                        <tr>
                          <td colSpan={3} className="px-6 py-10 text-center text-neutral-500 text-sm">
                            Nenhuma atribuição encontrada.
                          </td>
                        </tr>
                      ) : (
                        assignments.map((assignment) => {
                          const member = members.find(m => m.id === assignment.workspace_member_id);
                          return (
                            <tr key={assignment.id} className="hover:bg-neutral-50/50 transition-colors">
                              <td className="px-6 py-4">
                                <div className="text-sm font-medium text-neutral-900">
                                  {assignment.checklists?.title || 'Checklist sem título'}
                                </div>
                              </td>
                              <td className="px-6 py-4">
                                <div className="flex items-center gap-2">
                                  <div className="w-6 h-6 rounded-full bg-neutral-100 flex items-center justify-center overflow-hidden border border-neutral-200">
                                    {member?.profiles?.avatar_url ? (
                                      <img src={member.profiles.avatar_url} alt="" className="w-full h-full object-cover" />
                                    ) : (
                                      <Users className="w-3 h-3 text-neutral-400" />
                                    )}
                                  </div>
                                  <span className="text-sm text-neutral-700">
                                    {member?.profiles?.display_name || member?.email_normalized || 'Desconhecido'}
                                  </span>
                                </div>
                              </td>
                              <td className="px-6 py-4">
                                {assignment.is_primary ? (
                                  <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-pink-50 text-pink-600 border border-pink-100">
                                    Responsável Principal
                                  </span>
                                ) : (
                                  <span className="text-xs text-neutral-500">Colaborador</span>
                                )}
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </TabsContent>
            </Tabs>
          </div>
        </main>
        {/* Invite Dialog */}
        <Dialog open={inviteModalOpen} onOpenChange={setInviteModalOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Convidar Membro</DialogTitle>
              <DialogDescription>
                Envie um convite para colaborar neste workspace.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="email">E-mail</Label>
                <Input 
                  id="email" 
                  type="email" 
                  placeholder="exemplo@empresa.com"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="role">Função</Label>
                <Select value={inviteRole} onValueChange={(v: any) => setInviteRole(v)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="admin">Administrador</SelectItem>
                    <SelectItem value="editor">Editor</SelectItem>
                    <SelectItem value="viewer">Visualizador</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setInviteModalOpen(false)}>Cancelar</Button>
              <Button onClick={handleInvite} disabled={inviting || !inviteEmail}>
                {inviting ? 'Enviando...' : 'Convidar'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Revoke Invitation Dialog */}
        <Dialog open={!!invitationToRevoke} onOpenChange={() => setInvitationToRevoke(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Revogar Convite</DialogTitle>
              <DialogDescription>
                Tem certeza que deseja revogar o convite para <strong>{invitationToRevoke?.email_normalized}</strong>?
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setInvitationToRevoke(null)}>Cancelar</Button>
              <Button variant="destructive" onClick={() => invitationToRevoke && handleRevoke(invitationToRevoke.id)} disabled={actionLoading}>
                {actionLoading ? 'Revogando...' : 'Revogar'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Remove Member Dialog */}
        <Dialog open={!!memberToRemove} onOpenChange={() => setMemberToRemove(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Remover Membro</DialogTitle>
              <DialogDescription>
                Tem certeza que deseja remover <strong>{memberToRemove?.profiles?.display_name || memberToRemove?.email_normalized}</strong> da equipe?
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setMemberToRemove(null)}>Cancelar</Button>
              <Button variant="destructive" onClick={() => memberToRemove && handleRemoveMember(memberToRemove.id)} disabled={actionLoading}>
                {actionLoading ? 'Removendo...' : 'Remover'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
