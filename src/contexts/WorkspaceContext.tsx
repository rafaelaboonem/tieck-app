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
}

const WorkspaceContext = createContext<WorkspaceContextType | undefined>(undefined);

async function fetchWorkspacesQuery(): Promise<Workspace[]> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  // Fetch workspaces where user is owner OR a member
  // Note: RLS (ws_owner_all and ws_member_select) handles the filtration
  const { data, error } = await supabase
    .from("workspaces")
    .select("*")
    .order("created_at", { ascending: true });

  if (error) {
    console.error("Error fetching workspaces:", error);
    return [];
  }

  // If the user has access to workspaces, return them
  if (data && data.length > 0) return data;


  // Create default workspace if none exist
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
    return localStorage.getItem("currentWorkspaceId");
  });

  const currentWorkspace = useMemo(() => {
    if (!workspaces.length) return null;
    return workspaces.find((w) => w.id === currentId) ?? workspaces[0];
  }, [workspaces, currentId]);

  useEffect(() => {
    if (currentWorkspace && currentWorkspace.id !== currentId) {
      setCurrentId(currentWorkspace.id);
      localStorage.setItem("currentWorkspaceId", currentWorkspace.id);
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
