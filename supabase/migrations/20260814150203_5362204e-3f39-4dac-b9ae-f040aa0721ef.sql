
-- Fase 1 & 2: Limpeza dos registros de teste
DELETE FROM public.checklist_responses
WHERE checklist_id = 'a050976c-d5ed-44a0-af45-791a2c558dd8'
  AND visitor_id LIKE 'test-visitor-%'
  AND (answers ? 'test_block' OR answers ? 'step')
  AND NOT EXISTS (SELECT 1 FROM public.checklist_evidences ce WHERE ce.response_id = public.checklist_responses.id)
  AND NOT EXISTS (SELECT 1 FROM public.camera_ai_attempts caa WHERE caa.response_id = public.checklist_responses.id);

-- Fase 3: Recuperação do envio real órfão
-- A resposta b2615ef0-5f77-4ba9-b1cc-95ab61cb5b17 está in_progress mas tem evidência aprovada
UPDATE public.checklist_responses
SET 
    status = 'submitted',
    submitted_at = '2026-08-14 05:40:00+00', 
    answers = jsonb_build_object(
        'pfv4z3xq', jsonb_build_object(
            'evidenceId', '60b787d1-0f7f-4dcb-a904-c48208e9001a',
            'status', 'approved'
        )
    )
WHERE id = 'b2615ef0-5f77-4ba9-b1cc-95ab61cb5b17'
  AND status = 'in_progress';
