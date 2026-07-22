-- Create table for specific checklist members
CREATE TABLE IF NOT EXISTS public.checklist_members (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    checklist_id UUID NOT NULL REFERENCES public.checklists(id) ON DELETE CASCADE,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'viewer', -- viewer, editor, admin
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    UNIQUE(checklist_id, email)
);

-- Enable RLS
ALTER TABLE public.checklist_members ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Users can view members of checklists in their workspaces"
ON public.checklist_members
FOR SELECT
USING (
    EXISTS (
        SELECT 1 FROM public.checklists c
        JOIN public.workspace_members wm ON c.workspace_id = wm.ws_id
        WHERE c.id = checklist_members.checklist_id
        AND wm.user_id = auth.uid()
    )
);

CREATE POLICY "Workspace admins/editors can manage checklist members"
ON public.checklist_members
FOR ALL
USING (
    EXISTS (
        SELECT 1 FROM public.checklists c
        JOIN public.workspace_members wm ON c.workspace_id = wm.ws_id
        WHERE c.id = checklist_members.checklist_id
        AND wm.user_id = auth.uid()
        AND wm.role IN ('admin', 'editor')
    )
);
