-- Auto-generated from pg_catalog introspection.
-- Regenerated after removal of Anomalib/Railway training objects.
-- Do not edit by hand; see supabase/clean-baseline/README.md.

-- Realtime replication ------------------------------------------------
-- Ensure the supabase_realtime publication exists (managed by Supabase).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname='supabase_realtime') THEN
    CREATE PUBLICATION supabase_realtime;
  END IF;
END $$;

-- Add tables that the app consumes via realtime channels.
ALTER PUBLICATION supabase_realtime ADD TABLE public.task_executions;
ALTER PUBLICATION supabase_realtime ADD TABLE public.evidences;
ALTER PUBLICATION supabase_realtime ADD TABLE public.checklist_responses;
ALTER PUBLICATION supabase_realtime ADD TABLE public.checklist_evidences;
ALTER PUBLICATION supabase_realtime ADD TABLE public.checklist_evidence_analyses;

-- Full row payload for realtime consumers that need previous values.
ALTER TABLE public.task_executions REPLICA IDENTITY FULL;
ALTER TABLE public.evidences REPLICA IDENTITY FULL;
ALTER TABLE public.checklist_responses REPLICA IDENTITY FULL;
ALTER TABLE public.checklist_evidences REPLICA IDENTITY FULL;
ALTER TABLE public.checklist_evidence_analyses REPLICA IDENTITY FULL;

-- Cron jobs ------------------------------------------------------------
-- pg_cron is not required by the manual baseline. Cleanup/materialisation
-- functions (cleanup_expired_responses, materialize_task_executions) are
-- callable manually or scheduled externally.
