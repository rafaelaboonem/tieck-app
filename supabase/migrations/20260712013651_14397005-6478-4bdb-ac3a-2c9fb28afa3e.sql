
-- 1) Add hash column
ALTER TABLE public.checklist_responses
  ADD COLUMN IF NOT EXISTS response_token_hash text;

-- 2) Backfill hash from existing raw tokens (SHA-256 hex)
UPDATE public.checklist_responses
   SET response_token_hash = encode(extensions.digest(response_token, 'sha256'), 'hex')
 WHERE response_token_hash IS NULL
   AND response_token IS NOT NULL;

-- 3) Drop legacy trigger + function that generated raw tokens on insert
DROP TRIGGER IF EXISTS trg_set_checklist_response_token ON public.checklist_responses;
DROP FUNCTION IF EXISTS public.set_checklist_response_token();

-- 4) Drop unique index and plaintext column
DROP INDEX IF EXISTS public.idx_checklist_responses_token;
ALTER TABLE public.checklist_responses
  ALTER COLUMN response_token DROP NOT NULL,
  ALTER COLUMN response_token DROP DEFAULT;
ALTER TABLE public.checklist_responses
  DROP COLUMN response_token;

-- 5) Enforce hash uniqueness + not null (after backfill)
ALTER TABLE public.checklist_responses
  ALTER COLUMN response_token_hash SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_checklist_responses_token_hash
  ON public.checklist_responses(response_token_hash);

-- 6) Response creation now goes through the Edge Function (service_role).
--    Remove the public INSERT policy so anon/authenticated cannot create rows directly.
DROP POLICY IF EXISTS "Public can submit responses" ON public.checklist_responses;

-- 7) Do not expose the hash to normal clients — column-level privileges.
--    Owner may see the row (via responses_owner_view) but never the hash column.
REVOKE SELECT (response_token_hash) ON public.checklist_responses FROM anon, authenticated;
