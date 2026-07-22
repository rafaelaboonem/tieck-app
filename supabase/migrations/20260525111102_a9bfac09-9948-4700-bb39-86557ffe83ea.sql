CREATE OR REPLACE FUNCTION public.update_checklist_retention(
  p_checklist_id UUID,
  p_retention_days INT,
  p_is_enabled BOOLEAN
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Update checklist settings
  UPDATE public.checklists
  SET settings = jsonb_set(
    jsonb_set(COALESCE(settings, '{}'::jsonb), '{retentionDays}', to_jsonb(p_retention_days)),
    '{dataRetention}', to_jsonb(p_is_enabled)
  )
  WHERE id = p_checklist_id;

  -- Update responses
  IF p_is_enabled THEN
    UPDATE public.checklist_responses
    SET expires_at = submitted_at + (p_retention_days || ' days')::interval
    WHERE checklist_id = p_checklist_id;
  ELSE
    UPDATE public.checklist_responses
    SET expires_at = NULL
    WHERE checklist_id = p_checklist_id;
  END IF;
END;
$$;