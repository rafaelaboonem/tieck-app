CREATE TABLE public.checklist_relations (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    checklist_id UUID REFERENCES public.checklists(id) ON DELETE CASCADE,
    related_id UUID REFERENCES public.checklists(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    UNIQUE(checklist_id, related_id)
);

-- Enable RLS
ALTER TABLE public.checklist_relations ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Users can view relations of their checklists"
ON public.checklist_relations FOR SELECT
USING (EXISTS (
    SELECT 1 FROM public.checklists 
    WHERE checklists.id = checklist_relations.checklist_id 
    AND (checklists.user_id = auth.uid() OR checklists.workspace_id IN (
        SELECT ws_id FROM public.workspace_members WHERE (user_id = auth.uid() OR email = (select email from auth.users where id = auth.uid()))
    ))
));

CREATE POLICY "Users can manage relations of their checklists"
ON public.checklist_relations FOR ALL
USING (EXISTS (
    SELECT 1 FROM public.checklists 
    WHERE checklists.id = checklist_relations.checklist_id 
    AND (checklists.user_id = auth.uid())
));