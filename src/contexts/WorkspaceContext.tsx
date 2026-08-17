import { createContext, useContext, useState, useEffect, ReactNode, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface Workspace {
  id: string;
  owner_id: string | null;
  name: string;
  icon: string | null;
  icon_url: string | null;
  created_at?: string;
  updated_at?: string;
}

interface WorkspaceContextType {
  workspaces: Workspace[];
  currentWorkspace: Workspace | null;
  setCurrentWorkspace: (ws: Workspace) => void;
  refreshWorkspaces: () => Promise<void>;
  isLoading: boolean;
  workspaceStatus: 'loading' | 'personal' | 'workspace';
}

const WorkspaceContext = createContext<WorkspaceContextType | undefined>(undefined);

async function fetchWorkspacesQuery(): Promise<Workspace[]> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  // Fetch workspaces where user is owner OR a member
  // RLS handles the filtration server-side
  const { data, error } = await supabase
    .from("workspaces")
    .select("*")
    .order("created_at", { ascending: true });

  if (error) {
    console.error("Error fetching workspaces:", error);
    return [];
  }

  // If the user has access to workspaces (owned or as member), return them
  if (data && data.length > 0) return data;

  // Check if user has ANY memberships (even if workspace didn't return above)
  const { data: memberships } = await supabase
    .from("workspace_members")
    .select("workspace_id")
    .eq("user_id", user.id);

  if (memberships && memberships.length > 0) {
    // Re-fetch using explicit IDs if the general select failed for any reason
    const { data: sharedWs } = await supabase
      .from("workspaces")
      .select("*")
      .in("id", memberships.map(m => m.workspace_id));
    
    if (sharedWs && sharedWs.length > 0) return sharedWs;
  }

  // Create default workspace ONLY if user has no owned workspaces AND no memberships
  const { data: newWs, error: createError } = await supabase
    .from("workspaces")
    .insert([{ owner_id: user.id, name: "Meu Workspace", icon: "📁" }])
    .select()
    .single();

  if (createError) {
    console.error("Error creating default workspace:", createError);
    return [];
  }
  return newWs ? [newWs] : [];
}


export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const { data: workspaces = [], isLoading } = useQuery({
    queryKey: ["workspaces"],
    queryFn: fetchWorkspacesQuery,
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
  });

  const [currentId, setCurrentId] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    
    // Prioridade 1: Query string (útil pós-aceite de convite)
    const urlParams = new URLSearchParams(window.location.search);
    const wsParam = urlParams.get('workspace');
    if (wsParam) return wsParam;

    // Prioridade 2: LocalStorage
    return localStorage.getItem("currentWorkspaceId");
  });

  const currentWorkspace = useMemo(() => {
    if (!workspaces.length) return null;
    const found = workspaces.find((w) => w.id === currentId);
    
    // Se não encontrou o ID solicitado (pode ser um workspace novo recém aceito), 
    // mas temos workspaces, o primeiro da lista é o fallback seguro.
    return found || workspaces[0];
  }, [workspaces, currentId]);

  useEffect(() => {
    if (currentWorkspace && currentWorkspace.id !== currentId) {
      setCurrentId(currentWorkspace.id);
      localStorage.setItem("currentWorkspaceId", currentWorkspace.id);
      
      // Limpar o parâmetro da URL após sincronizar com o estado
      const url = new URL(window.location.href);
      if (url.searchParams.has('workspace') && url.pathname !== '/checklist') {
        url.searchParams.delete('workspace');
        window.history.replaceState({}, '', url.pathname + url.search);
      }
    }
  }, [currentWorkspace, currentId]);

  const setCurrentWorkspace = (ws: Workspace) => {
    setCurrentId(ws.id);
    localStorage.setItem("currentWorkspaceId", ws.id);
  };

  const refreshWorkspaces = async () => {
    await queryClient.invalidateQueries({ queryKey: ["workspaces"] });
  };

  return (
    <WorkspaceContext.Provider value={{ workspaces, currentWorkspace, setCurrentWorkspace, refreshWorkspaces, isLoading }}>
      {children}
    </WorkspaceContext.Provider>
  );
}

export function useWorkspace() {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) throw new Error("useWorkspace must be used within WorkspaceProvider");
  return ctx;
}
