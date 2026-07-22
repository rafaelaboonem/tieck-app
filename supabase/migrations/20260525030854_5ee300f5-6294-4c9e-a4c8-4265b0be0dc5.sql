-- Allow members to view responses
CREATE POLICY "Members can view workspace checklist responses"
ON public.checklist_responses
FOR SELECT
USING (
    EXISTS (
        SELECT 1 FROM public.checklists c
        JOIN public.workspace_members wm ON wm.workspace_id = c.user_id
        WHERE c.id = public.checklist_responses.checklist_id
        AND (wm.user_id = auth.uid() OR wm.email = (SELECT email FROM auth.users WHERE id = auth.uid()))
        AND wm.status = 'active'
    )
);

-- Allow members to view analytics
CREATE POLICY "Members can view workspace checklist analytics"
ON public.checklist_analytics
FOR SELECT
USING (
    EXISTS (
        SELECT 1 FROM public.checklists c
        JOIN public.workspace_members wm ON wm.workspace_id = c.user_id
        WHERE c.id = public.checklist_analytics.checklist_id
        AND (wm.user_id = auth.uid() OR wm.email = (SELECT email FROM auth.users WHERE id = auth.uid()))
        AND wm.status = 'active'
    )
);
