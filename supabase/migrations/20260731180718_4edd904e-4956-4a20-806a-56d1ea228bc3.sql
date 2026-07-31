CREATE OR REPLACE FUNCTION public.get_public_checklist(p_public_id text)
RETURNS TABLE(id uuid, title text, description text, blocks jsonb, settings jsonb, short_slug text, custom_slug text, published_at timestamp with time zone)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_row public.checklists%ROWTYPE;
BEGIN
  IF p_public_id IS NULL OR length(btrim(p_public_id)) = 0 THEN
    RAISE EXCEPTION 'public_id_required' USING ERRCODE = 'invalid_parameter_value';
  END IF;

  SELECT c.* INTO v_row
    FROM public.checklists c
   WHERE c.is_published = true
     AND (c.custom_slug = p_public_id OR c.id::text = p_public_id)
   LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'checklist_not_found_or_unpublished' USING ERRCODE = 'no_data_found';
  END IF;

  RETURN QUERY SELECT
    v_row.id,
    COALESCE(NULLIF(btrim((v_row.published_content->>'title')), ''),
             NULLIF(btrim(v_row.title), ''),
             'Sem título')::text,
    NULL::text,
    COALESCE(v_row.published_content->'blocks', v_row.blocks, '[]'::jsonb),
    COALESCE(v_row.published_content->'settings', v_row.settings, '{}'::jsonb),
    v_row.custom_slug,
    v_row.custom_slug,
    NULLIF(v_row.published_content->>'published_at','')::timestamptz;
END;
$function$;

REVOKE ALL ON FUNCTION public.get_public_checklist(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_checklist(text) TO anon, authenticated, service_role;