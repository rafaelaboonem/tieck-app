ALTER TABLE public.checklists ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES public.workspaces(id);
ALTER TABLE public.checklists ADD COLUMN IF NOT EXISTS category TEXT;
ALTER TABLE public.checklists ADD COLUMN IF NOT EXISTS view_type TEXT;

CREATE INDEX IF NOT EXISTS idx_checklists_workspace_id ON public.checklists(workspace_id);
CREATE INDEX IF NOT EXISTS idx_checklists_category ON public.checklists(category);

GRANT ALL ON public.checklists TO authenticated;
GRANT ALL ON public.checklists TO service_role;
GRANT ALL ON public.checklists TO anon;