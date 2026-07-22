-- 1. Extend evidence status states
ALTER TABLE public.evidences DROP CONSTRAINT IF EXISTS evidences_status_check;
ALTER TABLE public.evidences ADD CONSTRAINT evidences_status_check 
  CHECK (status = ANY (ARRAY['pending'::text,'processing'::text,'approved'::text,'rejected'::text,'resubmit_requested'::text,'manual_review'::text,'analysis_failed'::text]));

-- 2. Task-level AI configuration
ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS ai_review_mode text NOT NULL DEFAULT 'automatic_with_human_fallback',
  ADD COLUMN IF NOT EXISTS visual_criteria jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS reference_path text;

ALTER TABLE public.tasks DROP CONSTRAINT IF EXISTS tasks_ai_review_mode_check;
ALTER TABLE public.tasks ADD CONSTRAINT tasks_ai_review_mode_check
  CHECK (ai_review_mode IN ('automatic','automatic_with_human_fallback','human_required','disabled'));

-- 3. Analyses table
CREATE TABLE IF NOT EXISTS public.evidence_ai_analyses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  unit_id uuid NOT NULL,
  evidence_id uuid NOT NULL REFERENCES public.evidences(id) ON DELETE CASCADE,
  task_execution_id uuid NOT NULL REFERENCES public.task_executions(id) ON DELETE CASCADE,
  decision text NOT NULL CHECK (decision IN ('approved','rejected','manual_review','analysis_failed')),
  confidence numeric CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1)),
  summary text,
  image_quality jsonb NOT NULL DEFAULT '{}'::jsonb,
  criteria_results jsonb NOT NULL DEFAULT '[]'::jsonb,
  detected_problems jsonb NOT NULL DEFAULT '[]'::jsonb,
  resubmit_instructions text,
  model text,
  prompt_version text,
  processing_started_at timestamptz,
  processing_finished_at timestamptz,
  error_code text,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.evidence_ai_analyses TO authenticated;
GRANT ALL ON public.evidence_ai_analyses TO service_role;

ALTER TABLE public.evidence_ai_analyses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "read analyses by unit access" ON public.evidence_ai_analyses;
CREATE POLICY "read analyses by unit access" ON public.evidence_ai_analyses
  FOR SELECT TO authenticated
  USING (public.can_access_unit(auth.uid(), organization_id, unit_id));

CREATE INDEX IF NOT EXISTS evidence_ai_analyses_evidence_idx
  ON public.evidence_ai_analyses(evidence_id, created_at DESC);

-- Realtime for both evidences (already published) and analyses
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'evidence_ai_analyses'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.evidence_ai_analyses';
  END IF;
END $$;

-- 4. Atomic lock function: pending -> processing
CREATE OR REPLACE FUNCTION public.claim_evidence_for_analysis(p_evidence_id uuid)
RETURNS TABLE(claimed boolean, current_status text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_new_status text;
  v_current text;
BEGIN
  UPDATE public.evidences
     SET status = 'processing'
   WHERE id = p_evidence_id
     AND status IN ('pending','analysis_failed')
  RETURNING status INTO v_new_status;

  IF v_new_status IS NOT NULL THEN
    RETURN QUERY SELECT true, v_new_status;
    RETURN;
  END IF;

  SELECT status INTO v_current FROM public.evidences WHERE id = p_evidence_id;
  RETURN QUERY SELECT false, v_current;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_evidence_for_analysis(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.claim_evidence_for_analysis(uuid) TO service_role;