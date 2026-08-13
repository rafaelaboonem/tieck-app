CREATE OR REPLACE FUNCTION public.resolve_public_response(p_token text)
RETURNS TABLE (
    response_id uuid,
    checklist_id uuid,
    workspace_id uuid,
    status text,
    published_content jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
    v_token_hash text;
BEGIN
    IF p_token IS NULL OR btrim(p_token) = '' THEN
        RETURN;
    END IF;

    v_token_hash := encode(extensions.digest(btrim(p_token), 'sha256'), 'hex');

    RETURN QUERY
    SELECT 
        r.id as response_id,
        r.checklist_id,
        c.workspace_id,
        r.status::text,
        c.published_content
    FROM public.checklist_responses r
    JOIN public.checklists c ON c.id = r.checklist_id
    WHERE r.response_token_hash = v_token_hash
      AND r.expires_at > now()
      AND r.status = 'in_progress'
      AND c.is_published = true;
END;
$$;