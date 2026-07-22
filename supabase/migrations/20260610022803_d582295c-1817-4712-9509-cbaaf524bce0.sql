DROP POLICY IF EXISTS "Owners and members can view responses" ON public.checklist_responses;
DROP POLICY IF EXISTS "Owners can view responses" ON public.checklist_responses;
DROP POLICY IF EXISTS "Members can view workspace checklist responses" ON public.checklist_responses;

CREATE POLICY "Allow view responses" ON public.checklist_responses
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM checklists c
    WHERE c.id = checklist_responses.checklist_id
    AND (
      -- É o criador direto
      c.user_id = auth.uid() OR
      -- É o dono do workspace vinculado
      EXISTS (
        SELECT 1 FROM workspaces w
        WHERE w.id = c.workspace_id
        AND w.owner_id = auth.uid()
      ) OR
      -- É um membro ativo do workspace vinculado ou do workspace do criador
      EXISTS (
        SELECT 1 FROM workspace_members wm
        WHERE (wm.workspace_id = c.workspace_id OR wm.workspace_id = c.user_id)
        AND (wm.user_id = auth.uid() OR wm.email = (SELECT email FROM auth.users WHERE id = auth.uid()))
        AND wm.status = 'active'
      )
    )
  )
);

DROP POLICY IF EXISTS "Owners and members can delete responses" ON public.checklist_responses;
DROP POLICY IF EXISTS "Owners can delete responses" ON public.checklist_responses;

CREATE POLICY "Allow delete responses" ON public.checklist_responses
FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM checklists c
    WHERE c.id = checklist_responses.checklist_id
    AND (
      c.user_id = auth.uid() OR
      EXISTS (
        SELECT 1 FROM workspaces w
        WHERE w.id = c.workspace_id
        AND w.owner_id = auth.uid()
      ) OR
      EXISTS (
        SELECT 1 FROM workspace_members wm
        WHERE (wm.workspace_id = c.workspace_id OR wm.workspace_id = c.user_id)
        AND (wm.user_id = auth.uid() OR wm.email = (SELECT email FROM auth.users WHERE id = auth.uid()))
        AND wm.status = 'active'
      )
    )
  )
);
