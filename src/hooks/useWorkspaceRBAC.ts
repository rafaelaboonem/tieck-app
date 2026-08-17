import { useAuth } from "@/contexts/AuthContext";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type WorkspaceRole = 'owner' | 'admin' | 'editor' | 'viewer';

export function useWorkspaceRBAC(workspaceId: string | undefined) {
  const { user } = useAuth();
  const { workspaces } = useWorkspace();

  // Encontrar o owner_id sem depender do array workspaces inteiro para evitar re-execuções desnecessárias
  // se apenas a referência do array mudou mas o owner_id do workspace em questão é o mesmo.
  const workspaceOwnerId = workspaceId 
    ? workspaces.find(w => w.id === workspaceId)?.owner_id 
    : undefined;

  const { data: role, isLoading: isRoleLoading, isFetching } = useQuery({
    queryKey: ["workspace-role", user?.id, workspaceId, workspaceOwnerId],
    queryFn: async () => {
      if (!user || !workspaceId) return null;

      // Regra canônica: Proprietário do Workspace tem poder total
      if (workspaceOwnerId === user.id) {
        return 'owner' as WorkspaceRole;
      }

      // Consultar membership na tabela (Admin, Editor, Viewer)
      const { data, error } = await supabase
        .from("workspace_members")
        .select("role, status")
        .eq("workspace_id", workspaceId)
        .eq("user_id", user.id)
        .maybeSingle();

      if (error) {
        console.error("[useWorkspaceRBAC] Error fetching role:", error);
        return null;
      }

      if (data && data.status === 'active') {
        return data.role as WorkspaceRole;
      }

      return null;
    },
    enabled: !!user && !!workspaceId,
    staleTime: 1000 * 60 * 5, // 5 minutos de cache
    gcTime: 1000 * 60 * 30,
    // Mantém o estado anterior enquanto revalida no background (evita flash de loading)
    placeholderData: (previousData) => previousData,
  });

  // O loading só deve ser verdadeiro se não temos dados e estamos carregando pela primeira vez
  // ou se o workspaceId mudou e ainda não temos cache para ele.
  const loading = isRoleLoading && !role;

  const canManage = role === 'owner' || role === 'admin' || role === 'editor';
  const isAdmin = role === 'owner' || role === 'admin';
  const isViewer = role === 'viewer';

  return { 
    role, 
    canManage, 
    isAdmin, 
    isViewer, 
    loading,
    isFetching // Útil se quisermos mostrar um indicador discreto de sync
  };
}
