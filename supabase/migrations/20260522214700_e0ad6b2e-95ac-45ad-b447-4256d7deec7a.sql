
-- Enable extensions
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Responses table
CREATE TABLE public.checklist_responses (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  checklist_id UUID NOT NULL REFERENCES public.checklists(id) ON DELETE CASCADE,
  visitor_id TEXT NOT NULL,
  answers JSONB NOT NULL DEFAULT '{}'::jsonb,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '3 days'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_checklist_responses_checklist ON public.checklist_responses(checklist_id);
CREATE INDEX idx_checklist_responses_expires ON public.checklist_responses(expires_at);

ALTER TABLE public.checklist_responses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can submit responses"
  ON public.checklist_responses FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.checklists c
      WHERE c.id = checklist_id AND c.is_published = true
    )
  );

CREATE POLICY "Owners can view responses"
  ON public.checklist_responses FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.checklists c
      WHERE c.id = checklist_id AND c.user_id = auth.uid()
    )
  );

CREATE POLICY "Owners can delete responses"
  ON public.checklist_responses FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.checklists c
      WHERE c.id = checklist_id AND c.user_id = auth.uid()
    )
  );

-- Cleanup function
CREATE OR REPLACE FUNCTION public.cleanup_expired_responses()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.checklist_responses WHERE expires_at < now();
END;
$$;

-- Hourly cleanup cron
SELECT cron.schedule(
  'cleanup-expired-checklist-responses',
  '0 * * * *',
  $$ SELECT public.cleanup_expired_responses(); $$
);
