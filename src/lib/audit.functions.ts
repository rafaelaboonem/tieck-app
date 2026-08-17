import { createServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { z } from "zod";

export const auditCasa2 = createServerFn({ method: "GET" })
  .handler(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { error: "No user authenticated" };

    const { data: workspaces } = await supabase.from("workspaces").select("id, name, owner_id").eq("name", "Meu Workspace");
    const meuWorkspace = workspaces?.[0];

    const { data: checklists } = await supabase.from("checklists").select("id, title, workspace_id, user_id, created_at, is_published").ilike("title", "%Casa 2%");
    
    return { user: { id: user.id, email: user.email }, meuWorkspace, checklists };
  });

export const recoverCasa2 = createServerFn({ method: "POST" })
  .validator((data: { checklistId: string, workspaceId: string }) => z.object({
    checklistId: z.string(),
    workspaceId: z.string()
  }).parse(data))
  .handler(async ({ data }) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { error: "No user authenticated" };

    // Validar que o checklist pertence ao usuário
    const { data: checklist } = await supabase
      .from("checklists")
      .select("user_id, workspace_id")
      .eq("id", data.checklistId)
      .single();

    if (!checklist || checklist.user_id !== user.id) {
      return { error: "Checklist not found or unauthorized" };
    }

    // Validar que o usuário é owner do workspace
    const { data: workspace } = await supabase
      .from("workspaces")
      .select("owner_id")
      .eq("id", data.workspaceId)
      .single();

    if (!workspace || workspace.owner_id !== user.id) {
      return { error: "Workspace not found or unauthorized" };
    }

    const { error } = await supabase
      .from("checklists")
      .update({ workspace_id: data.workspaceId })
      .eq("id", data.checklistId);

    if (error) return { error: error.message };
    return { success: true };
  });
