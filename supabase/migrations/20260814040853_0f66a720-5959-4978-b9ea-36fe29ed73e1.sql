BEGIN;

DROP FUNCTION IF EXISTS public.get_public_checklist(text);

CREATE OR REPLACE FUNCTION public.get_public_checklist(p_public_id text)
RETURNS TABLE (
  id uuid,
  title text,
  description text,
  blocks jsonb,
  settings jsonb,
  short_slug text,
  custom_slug text,
  published_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        c.id,
        -- Extração segura do título do snapshot ou fallback
        COALESCE(
            CASE 
                WHEN jsonb_typeof(c.published_content) = 'object' 
                THEN c.published_content->>'title' 
                ELSE NULL 
            END,
            c.title
        ) as title,
        -- Description não existe na tabela checklists do projeto txq
        NULL::text as description,
        -- Extração segura de blocks
        CASE 
            WHEN jsonb_typeof(c.published_content) = 'array' THEN c.published_content
            WHEN jsonb_typeof(c.published_content) = 'object' AND jsonb_typeof(c.published_content->'blocks') = 'array' THEN c.published_content->'blocks'
            ELSE '[]'::jsonb
        END as blocks,
        -- Extração segura de settings
        CASE 
            WHEN jsonb_typeof(c.published_content) = 'object' AND c.published_content ? 'settings' THEN c.published_content->'settings'
            ELSE COALESCE(c.settings, '{}'::jsonb)
        END as settings,
        -- short_slug mapeado para custom_slug
        c.custom_slug as short_slug,
        c.custom_slug,
        -- Extração segura de published_at
        CASE 
            WHEN jsonb_typeof(c.published_content) = 'object' 
                 AND (c.published_content->>'published_at') IS NOT NULL 
                 AND (c.published_content->>'published_at') != ''
            THEN (c.published_content->>'published_at')::timestamptz
            ELSE NULL::timestamptz
        END as published_at
    FROM public.checklists c
    WHERE (c.custom_slug = p_public_id OR c.id::text = p_public_id)
      AND c.is_published = true;
END;
$$;

REVOKE ALL ON FUNCTION public.get_public_checklist(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_checklist(text) TO anon, authenticated, service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;