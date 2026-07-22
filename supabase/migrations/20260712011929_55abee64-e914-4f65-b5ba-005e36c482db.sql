
ALTER TABLE public.checklist_responses
  ALTER COLUMN response_token SET DEFAULT replace(replace(replace(
    encode(gen_random_bytes(32), 'base64'),
    '+', '-'), '/', '_'), '=', '');

-- Restringe a função de claim: só service_role executa (Edge Function)
REVOKE EXECUTE ON FUNCTION public.claim_checklist_analysis(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_checklist_analysis(uuid) TO service_role;
