
-- =========================================================
-- RPC public.create_public_response
-- Emissora de sessões anônimas para preenchimento de checklists.
-- Evita a exposição de response_token_hash no cliente.
-- =========================================================

CREATE OR REPLACE FUNCTION public.create_public_response(
  p_checklist_id uuid,
  p_visitor_id   text
)
RETURNS TABLE (
  response_id    uuid,
  response_token text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_resp_id    uuid;
  v_token      text;
  v_token_hash text;
  v_workspace  uuid;
BEGIN
  -- 1. Validar checklist
  SELECT workspace_id INTO v_workspace
    FROM public.checklists
   WHERE id = p_checklist_id
     AND is_published = true;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'checklist_unavailable' USING ERRCODE = 'no_data_found';
  END IF;

  -- 2. Gerar token opaco
  v_token := replace(replace(replace(
    encode(extensions.gen_random_bytes(32), 'base64'),
    '+', '-'), '/', '_'), '=', '');
  
  v_token_hash := encode(extensions.digest(v_token, 'sha256'), 'hex');

  -- 3. Criar resposta (in_progress)
  INSERT INTO public.checklist_responses (
    checklist_id,
    visitor_id,
    response_token_hash,
    status,
    expires_at
  )
  VALUES (
    p_checklist_id,
    p_visitor_id,
    v_token_hash,
    'in_progress',
    now() + interval '24 hours'
  )
  RETURNING id INTO v_resp_id;

  RETURN QUERY SELECT v_resp_id, v_token;
END;
$$;

-- Permissões rigorosas
REVOKE ALL ON FUNCTION public.create_public_response(uuid, text) FROM public;
REVOKE ALL ON FUNCTION public.create_public_response(uuid, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.create_public_response(uuid, text) TO anon, service_role;

COMMENT ON FUNCTION public.create_public_response IS 'Cria uma sessão anônima para preenchimento de um checklist publicado.';
