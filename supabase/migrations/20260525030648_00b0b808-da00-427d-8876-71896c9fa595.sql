-- Create workspace_members table
CREATE TABLE public.workspace_members (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    workspace_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'editor',
    status TEXT NOT NULL DEFAULT 'pending',
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    UNIQUE(workspace_id, email)
);

-- Enable RLS
ALTER TABLE public.workspace_members ENABLE ROW LEVEL SECURITY;

-- Policies for workspace_members
CREATE POLICY "Owners can manage their workspace members"
ON public.workspace_members
FOR ALL
USING (auth.uid() = workspace_id);

CREATE POLICY "Members can view their own memberships"
ON public.workspace_members
FOR SELECT
USING (auth.uid() = user_id OR email = (SELECT email FROM auth.users WHERE id = auth.uid()));

-- Function to handle timestamp updates
CREATE TRIGGER update_workspace_members_updated_at
BEFORE UPDATE ON public.workspace_members
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Update checklists table to allow shared access logic (handled via RLS or app-level filtering)
-- We'll use a view or specific RLS policies to allow members to see checklists

-- Add policy to checklists for members
CREATE POLICY "Members can view workspace checklists"
ON public.checklists
FOR SELECT
USING (
    auth.uid() = user_id OR 
    EXISTS (
        SELECT 1 FROM public.workspace_members 
        WHERE workspace_id = public.checklists.user_id 
        AND (user_id = auth.uid() OR email = (SELECT email FROM auth.users WHERE id = auth.uid()))
        AND status = 'active'
    )
);

CREATE POLICY "Members can update workspace checklists"
ON public.checklists
FOR UPDATE
USING (
    auth.uid() = user_id OR 
    EXISTS (
        SELECT 1 FROM public.workspace_members 
        WHERE workspace_id = public.checklists.user_id 
        AND (user_id = auth.uid() OR email = (SELECT email FROM auth.users WHERE id = auth.uid()))
        AND status = 'active'
        AND role IN ('admin', 'editor')
    )
);

-- Note: We might need a way to link invited emails to user IDs when they sign up or log in.
-- A trigger on auth.users or a check during login/session start.
