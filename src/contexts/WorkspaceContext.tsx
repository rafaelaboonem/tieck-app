import { createContext, useContext, useState, useEffect, ReactNode, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

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
  setCurrentWorkspace: (ws: Workspace | null) => void;
  refreshWorkspaces: () => Promise<void>;
  isLoading: boolean;
  workspaceStatus: 'loading' | 'personal' | 'workspace';
}

const WorkspaceContext = createContext<WorkspaceContextType | undefined>(undefined);

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const { user, loading: authLoading } = useAuth();
  
  const { data: workspaces = [], isLoading: queryLoading } = useQuery({
    queryKey: ["workspaces", user?.id],
    queryFn: async (): Promise<Workspace[]> => {
      if (!user) return [];

      const { data, error } = await (supabase.rpc as any)("list_my_workspaces");

      if (error) {
        console.error("Error fetching workspaces via RPC:", error);
        return [];
      }

      return (data as any as Workspace[]) || [];
    },
    enabled: !authLoading && !!user,
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
  });

  const isLoading = authLoading || queryLoading;

  // 1. O estado de seleção bruta (URL > localStorage > null)
  const [selection, setSelection] = useState<{ type: 'workspace' | 'personal' | 'unresolved', id?: string }>(() => {
    if (typeof window === "undefined") return { type: 'unresolved' };
    
    const urlParams = new URLSearchParams(window.location.search);
    const wsParam = urlParams.get('workspace');
    if (wsParam) return { type: 'workspace', id: wsParam };

    const saved = localStorage.getItem("currentWorkspaceId");
    if (saved === "personal") return { type: 'personal' };
    if (saved) return { type: 'workspace', id: saved };
    
    return { type: 'unresolved' };
  });

  // 2. Resolver o workspace real e o status final
  const { currentWorkspace, workspaceStatus } = useMemo(() => {
    if (isLoading) return { currentWorkspace: null, workspaceStatus: 'loading' as const };
    
    // Se a seleção for workspace, tentamos encontrar
    if (selection.type === 'workspace' && selection.id) {
      const found = workspaces.find(w => w.id === selection.id);
      if (found) return { currentWorkspace: found, workspaceStatus: 'workspace' as const };
    }
    
    // Se a seleção for pessoal ou (se for workspace mas não encontrado)
    // Se não resolveu ou workspace inválido -> Bootstrap
    if (selection.type === 'personal') {
      return { currentWorkspace: null, workspaceStatus: 'personal' as const };
    }

    // Bootstrap: Prioriza o primeiro workspace se existir
    if (workspaces.length > 0) {
      return { currentWorkspace: workspaces[0], workspaceStatus: 'workspace' as const };
    }

    return { currentWorkspace: null, workspaceStatus: 'personal' as const };
  }, [isLoading, selection, workspaces]);

  useEffect(() => {
    if (isLoading) return;

    // Sincronizar a seleção com o localStorage para persistência
    if (workspaceStatus === 'workspace' && currentWorkspace) {
      if (localStorage.getItem("currentWorkspaceId") !== currentWorkspace.id) {
        localStorage.setItem("currentWorkspaceId", currentWorkspace.id);
      }
      
      // Limpar o parâmetro da URL se ele foi usado para bootstrap/seleção
      const url = new URL(window.location.href);
      if (url.searchParams.has('workspace') && url.pathname !== '/checklist') {
        url.searchParams.delete('workspace');
        window.history.replaceState({}, '', url.pathname + url.search);
      }
    } else if (workspaceStatus === 'personal') {
      if (localStorage.getItem("currentWorkspaceId") !== "personal") {
        localStorage.setItem("currentWorkspaceId", "personal");
      }
    }
  }, [currentWorkspace, workspaceStatus, isLoading]);

  const setCurrentWorkspace = (ws: Workspace | null) => {
    if (ws) {
      setSelection({ type: 'workspace', id: ws.id });
    } else {
      setSelection({ type: 'personal' });
    }
  };

  const refreshWorkspaces = async () => {
    await queryClient.invalidateQueries({ queryKey: ["workspaces", user?.id] });
  };

  return (
    <WorkspaceContext.Provider value={{ 
      workspaces, 
      currentWorkspace, 
      setCurrentWorkspace, 
      refreshWorkspaces, 
      isLoading,
      workspaceStatus
    }}>
      {children}
    </WorkspaceContext.Provider>
  );
}

export function useWorkspace() {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) throw new Error("useWorkspace must be used within WorkspaceProvider");
  return ctx;
}
