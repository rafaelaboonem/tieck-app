DROP POLICY IF EXISTS "Members can view workspace checklist analytics" ON public.checklist_analytics;

CREATE POLICY "Members can view workspace checklist analytics"
ON public.checklist_analytics
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.checklists c
    JOIN public.workspace_members wm
      ON wm.workspace_id = c.workspace_id
    WHERE c.id = checklist_analytics.checklist_id
      AND wm.status = 'active'
      AND (
        wm.user_id = auth.uid()
        OR wm.email = (
          SELECT email::text FROM auth.users WHERE id = auth.uid()
        )
      )
  )
);