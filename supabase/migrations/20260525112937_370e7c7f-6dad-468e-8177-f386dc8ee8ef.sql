CREATE TABLE public.workspace_categories (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.workspace_categories ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Users can view categories in their workspaces"
ON public.workspace_categories FOR SELECT
USING (EXISTS (
    SELECT 1 FROM public.workspaces 
    WHERE workspaces.id = workspace_categories.workspace_id 
    AND (workspaces.owner_id = auth.uid() OR EXISTS (
        SELECT 1 FROM public.workspace_members 
        WHERE workspace_members.ws_id = workspaces.id AND (workspace_members.user_id = auth.uid() OR workspace_members.email = (select email from auth.users where id = auth.uid()))
    ))
));

CREATE POLICY "Owners and admins can manage categories"
ON public.workspace_categories FOR ALL
USING (EXISTS (
    SELECT 1 FROM public.workspaces 
    WHERE workspaces.id = workspace_categories.workspace_id 
    AND (workspaces.owner_id = auth.uid())
));

-- Trigger for updated_at
CREATE TRIGGER update_workspace_categories_updated_at
BEFORE UPDATE ON public.workspace_categories
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();