-- =========================================================
-- 6A.3.3 — Secure read RPC for Camera AI attempts
--
-- camera_ai_attempts stays CLOSED for direct client access
-- (service_role only). This SECURITY DEFINER RPC lets an
-- AUTHENTICATED user read ONLY the attempts of responses that
-- belong to checklists they can MANAGE (personal owner, or
-- workspace Owner/Admin/Editor via the canonical
-- get_checklist_access). Viewer and unauthenticated get zero
-- rows. No SELECT is granted on camera_ai_attempts.
-- =========================================================

CREATE OR REPLACE FUNCTION public.get_camera_ai_attempts_for_responses(p_response_ids uuid[])
RETURNS TABLE (
  id uuid,
  response_id uuid,
  evidence_id uuid,
  block_id text,
  status text,
  decision text,
  code text,
  evidence text,
  model text,
  duration_ms integer,
  completed_at timestamptz,
  updated_at timestamptz,
  created_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid;
  v_count integer;
BEGIN
  -- Fail-closed: no authenticated user → zero rows.
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RETURN;
  END IF;

  -- No ids → zero rows. No global queries ever.
  IF p_response_ids IS NULL OR array_length(p_response_ids, 1) IS NULL OR array_length(p_response_ids, 1) = 0 THEN
    RETURN;
  END IF;

  -- Defensive limit: at most 100 response ids per call.
  SELECT count(*) INTO v_count FROM unnest(p_response_ids) AS t(id);
  IF v_count > 100 THEN
    RETURN; -- fail-closed
  END IF;

  -- Strictly scoped: a.response_id = ANY(p_response_ids), and the checklist
  -- of each response must be manageable by the caller (get_checklist_access
  -- can_manage = personal owner OR workspace member with role owner/admin/editor).
  RETURN QUERY
  SELECT
    a.id,
    a.response_id,
    a.evidence_id,
    a.block_id,
    a.status::text,
    a.decision::text,
    a.code,
    a.evidence,
    a.model,
    a.duration_ms,
    a.completed_at,
    a.updated_at,
    a.created_at
  FROM public.camera_ai_attempts a
  JOIN public.checklist_responses r ON r.id = a.response_id
  JOIN public.checklists c ON c.id = r.checklist_id
  JOIN public.get_checklist_access(c.id, v_uid) ga ON ga.can_manage
  WHERE a.response_id = ANY(p_response_ids);
END;
$$;

-- Only authenticated callers may invoke the RPC. Nothing is granted on the
-- underlying table (still service_role only).
REVOKE ALL ON FUNCTION public.get_camera_ai_attempts_for_responses(uuid[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_camera_ai_attempts_for_responses(uuid[]) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_camera_ai_attempts_for_responses(uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_camera_ai_attempts_for_responses(uuid[]) TO service_role;

COMMENT ON FUNCTION public.get_camera_ai_attempts_for_responses IS
  'Retorna tentativas Camera AI apenas de respostas cujo checklist o usuário autenticado pode gerenciar. Escopo estrito por response_ids; sem SELECT direto na tabela.';