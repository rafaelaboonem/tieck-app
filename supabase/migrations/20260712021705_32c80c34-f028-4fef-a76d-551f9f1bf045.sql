
-- 1) enum
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'checklist_response_status') THEN
    CREATE TYPE public.checklist_response_status AS ENUM ('in_progress', 'submitted');
  END IF;
END$$;

-- 2) allow null submitted_at + drop default now()
ALTER TABLE public.checklist_responses
  ALTER COLUMN submitted_at DROP NOT NULL,
  ALTER COLUMN submitted_at DROP DEFAULT;

-- 3) add status column
ALTER TABLE public.checklist_responses
  ADD COLUMN IF NOT EXISTS status public.checklist_response_status NOT NULL DEFAULT 'in_progress';

-- 4) backfill: linhas existentes com answers != '{}' viraram 'submitted'; demais ficam 'in_progress' com submitted_at nulo
UPDATE public.checklist_responses
   SET status = 'submitted'
 WHERE status = 'in_progress'
   AND answers IS NOT NULL
   AND answers <> '{}'::jsonb;

UPDATE public.checklist_responses
   SET submitted_at = NULL
 WHERE status = 'in_progress';

-- 5) index for common filter
CREATE INDEX IF NOT EXISTS idx_checklist_responses_status
  ON public.checklist_responses (status);
