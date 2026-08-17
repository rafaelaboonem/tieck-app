import { useAuth } from "@/contexts/AuthContext";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export function useWorkspaceRBAC(workspaceId: string | undefined) {
  const { user } = useAuth();
  const { workspaces } = useWorkspace();
  const [role, setRole] = useState<'owner' | 'admin' | 'editor' | 'viewer' | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function checkRole() {
      if (!user || !workspaceId) {
        setRole(null);
        setLoading(false);
        return;
      }

      setLoading(true);
      try {
        // Regra canônica: Proprietário do Workspace tem poder total, 
        // mesmo sem registro na tabela workspace_members.
        const ws = workspaces.find(w => w.id === workspaceId);
        if (ws && ws.owner_id === user.id) {
          setRole('owner');
          setLoading(false);
          return;
        }

        // Consultar membership na tabela (Admin, Editor, Viewer)
        const { data, error } = await supabase
          .from("workspace_members")
          .select("role, status")
          .eq("workspace_id", workspaceId)
          .eq("user_id", user.id)
          .maybeSingle();

        if (error) throw error;

        if (data && data.status === 'active') {
          setRole(data.role as any);
        } else {
          // Fallback: se não é o owner e não tem membership ativo
          setRole(null);
        }
      } catch (err) {
        console.error("[useWorkspaceRBAC] Error:", err);
        setRole(null);
      } finally {
        setLoading(false);
      }
    }

    checkRole();
  }, [user, workspaceId, workspaces]);

  const canManage = role === 'owner' || role === 'admin' || role === 'editor';
  const isAdmin = role === 'owner' || role === 'admin';
  const isViewer = role === 'viewer';

  return { role, canManage, isAdmin, isViewer, loading };
}
