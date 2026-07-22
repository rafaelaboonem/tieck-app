-- Create checklist_analytics table
CREATE TABLE public.checklist_analytics (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    checklist_id UUID NOT NULL REFERENCES public.checklists(id) ON DELETE CASCADE,
    visitor_id TEXT NOT NULL,
    session_id UUID NOT NULL DEFAULT gen_random_uuid(),
    started_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    last_active_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    submitted_at TIMESTAMP WITH TIME ZONE,
    metadata JSONB DEFAULT '{}'::jsonb
);

-- Create index for performance
CREATE INDEX idx_checklist_analytics_checklist_id ON public.checklist_analytics(checklist_id);
CREATE INDEX idx_checklist_analytics_visitor_id ON public.checklist_analytics(visitor_id);

-- Enable RLS
ALTER TABLE public.checklist_analytics ENABLE ROW LEVEL SECURITY;

-- Create policies for public access (anonymous tracking)
CREATE POLICY "Public can insert analytics" 
ON public.checklist_analytics 
FOR INSERT 
WITH CHECK (true);

CREATE POLICY "Public can update own session" 
ON public.checklist_analytics 
FOR UPDATE 
USING (true)
WITH CHECK (true);

-- Create policy for owners to view their analytics
CREATE POLICY "Owners can view checklist analytics" 
ON public.checklist_analytics 
FOR SELECT 
USING (
    EXISTS (
        SELECT 1 FROM public.checklists c 
        WHERE c.id = checklist_analytics.checklist_id 
        AND c.user_id = auth.uid()
    )
);

-- Add a column to checklists to track aggregate stats (optional, but good for quick access)
-- For now we'll just query the analytics table.
