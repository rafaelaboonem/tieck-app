CREATE OR REPLACE FUNCTION public.cleanup_expired_responses()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Delete based on current checklist settings (dynamic), not stored expires_at
  DELETE FROM public.checklist_responses r
  USING public.checklists c
  WHERE r.checklist_id = c.id
    AND COALESCE((c.settings->>'dataRetention')::boolean, false) = true
    AND r.submitted_at + (COALESCE((c.settings->>'retentionDays')::int, 3) || ' days')::interval < now();
END;
$$;