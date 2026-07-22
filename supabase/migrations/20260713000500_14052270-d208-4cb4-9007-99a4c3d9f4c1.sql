CREATE OR REPLACE FUNCTION public.resolve_model_version_run_token(p_token text)
RETURNS TABLE(version_id uuid, dataset_id uuid, organization_id uuid, snapshot_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp', 'extensions'
AS $function$
DECLARE
  v_hash text;
BEGIN
  IF p_token IS NULL OR length(btrim(p_token)) < 16 THEN
    RETURN;
  END IF;

  v_hash := encode(extensions.digest(btrim(p_token), 'sha256'), 'hex');

  RETURN QUERY
  SELECT mv.id, mv.dataset_id, mv.organization_id, mv.snapshot_id
  FROM public.vision_model_versions mv
  WHERE mv.run_token_hash = v_hash
    AND mv.run_token_expires_at IS NOT NULL
    AND mv.run_token_expires_at > now()
    AND mv.status IN ('preparing_dataset','queued','training','validating')
  LIMIT 1;
END;
$function$;