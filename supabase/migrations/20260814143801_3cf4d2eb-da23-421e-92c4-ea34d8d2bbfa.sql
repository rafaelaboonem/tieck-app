CREATE OR REPLACE FUNCTION public.finalize_public_response(
  p_response_token text,
  p_checklist_id uuid,
  p_answers jsonb
)
RETURNS TABLE (
  response_id uuid,
  status text,
  submitted_at timestamptz,
  already_submitted boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_token_hash text;
  v_response_id uuid;
  v_current_status text;
  v_evidence_id uuid;
  v_block_id text;
  v_submitted_at timestamptz;
BEGIN
  -- 1. Calcular hash do token
  v_token_hash := encode(digest(p_response_token, 'sha256'), 'hex');

  -- 2. Localizar a resposta
  SELECT cr.id, cr.status INTO v_response_id, v_current_status
  FROM public.checklist_responses cr
  WHERE cr.response_token_hash = v_token_hash
    AND cr.checklist_id = p_checklist_id;

  IF v_response_id IS NULL THEN
    RAISE EXCEPTION 'invalid_response_token' USING ERRCODE = 'P0001';
  END IF;

  -- 3. Validar se o checklist continua publicado
  IF NOT EXISTS (SELECT 1 FROM public.checklists WHERE id = p_checklist_id AND is_published = true) THEN
    RAISE EXCEPTION 'checklist_not_published' USING ERRCODE = 'P0002';
  END IF;

  -- 4. Idempotência
  IF v_current_status = 'submitted' THEN
    SELECT cr.submitted_at INTO v_submitted_at
    FROM public.checklist_responses cr
    WHERE cr.id = v_response_id;
    
    RETURN QUERY SELECT v_response_id, 'submitted'::text, v_submitted_at, true;
    RETURN;
  END IF;

  -- 5. Validação de evidências Camera AI nas respostas
  FOR v_block_id, v_evidence_id IN 
    SELECT key, (value->>'evidenceId')::uuid 
    FROM jsonb_each(p_answers) 
    WHERE value ? 'evidenceId' 
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM public.checklist_evidences ce
      WHERE ce.id = v_evidence_id 
        AND ce.response_id = v_response_id 
        AND ce.checklist_id = p_checklist_id
        AND ce.block_id = v_block_id
        AND ce.uploaded = true
    ) THEN
      RAISE EXCEPTION 'invalid_evidence_id' USING ERRCODE = 'P0003';
    END IF;
  END LOOP;

  -- 6. Finalizar resposta
  UPDATE public.checklist_responses
  SET 
    answers = p_answers,
    status = 'submitted',
    submitted_at = now()
  WHERE id = v_response_id
  RETURNING checklist_responses.submitted_at INTO v_submitted_at;

  RETURN QUERY SELECT v_response_id, 'submitted'::text, v_submitted_at, false;
END;
$$;
