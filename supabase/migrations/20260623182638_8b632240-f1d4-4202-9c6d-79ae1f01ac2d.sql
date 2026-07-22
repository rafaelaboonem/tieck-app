
-- 1) Index for fast cleanup scans
CREATE INDEX IF NOT EXISTS idx_checklist_responses_checklist_submitted
  ON public.checklist_responses (checklist_id, submitted_at);

-- 2) Audit log table
CREATE TABLE IF NOT EXISTS public.cleanup_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ran_at timestamptz NOT NULL DEFAULT now(),
  deleted_count integer NOT NULL DEFAULT 0
);

GRANT ALL ON public.cleanup_log TO service_role;
ALTER TABLE public.cleanup_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role manages cleanup log"
  ON public.cleanup_log FOR ALL
  USING (false) WITH CHECK (false);

-- 3) Update function to log deletions
CREATE OR REPLACE FUNCTION public.cleanup_expired_responses()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_deleted integer;
BEGIN
  WITH deleted AS (
    DELETE FROM public.checklist_responses r
    USING public.checklists c
    WHERE r.checklist_id = c.id
      AND COALESCE((c.settings->>'dataRetention')::boolean, false) = true
      AND r.submitted_at + (COALESCE((c.settings->>'retentionDays')::int, 3) || ' days')::interval < now()
    RETURNING r.id
  )
  SELECT count(*) INTO v_deleted FROM deleted;

  INSERT INTO public.cleanup_log (deleted_count) VALUES (v_deleted);
END;
$function$;
