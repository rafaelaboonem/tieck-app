import { useAuth } from "@/contexts/AuthContext";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type WorkspaceRole = 'owner' | 'admin' | 'editor' | 'viewer';

export function useWorkspaceRBAC(workspaceId: string | undefined) {
  const { user } = useAuth();

  const { data, isLoading: isRoleLoading, isFetching } = useQuery({
    queryKey: ["workspace-role-canonical", user?.id, workspaceId],
    queryFn: async () => {
      if (!user || !workspaceId) return null;

      const { data, error } = await supabase.rpc('get_my_workspace_access', {
        p_workspace_id: workspaceId
      });

      if (error) {
        console.error("[useWorkspaceRBAC] Error fetching canonical access:", error);
        return null;
      }

      // get_my_workspace_access returns a table
      const access = data?.[0];
      if (!access) return null;

      return {
        role: access.role as WorkspaceRole,
        workspaceMemberId: access.workspace_member_id as string | null,
        isOwner: access.is_owner as boolean
      };
    },
    enabled: !!user && !!workspaceId,
    staleTime: 1000 * 60 * 5,
    gcTime: 1000 * 60 * 30,
  });

  const role = data?.role ?? null;
  const workspaceMemberId = data?.workspaceMemberId ?? null;
  const hasAccess = !!role;

  // O loading só deve ser verdadeiro se não temos dados e estamos carregando pela primeira vez
  // ou se o workspaceId mudou e ainda não temos cache para ele.
  const loading = isRoleLoading && !data;

  const canManage = role === 'owner' || role === 'admin' || role === 'editor';
  const isAdmin = role === 'owner' || role === 'admin';
  const isViewer = role === 'viewer';

  return { 
    role, 
    workspaceMemberId,
    hasAccess,
    canManage, 
    isAdmin, 
    isViewer, 
    loading,
    isFetching 
  };
}
