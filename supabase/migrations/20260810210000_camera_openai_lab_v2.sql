-- Adiciona suporte a idempotência e rate limit persistente para o Lab OpenAI
ALTER TABLE public.camera_openai_lab_attempts 
ADD COLUMN idempotency_key uuid,
ADD COLUMN reference_count integer;

CREATE UNIQUE INDEX idx_lab_attempts_idempotency ON public.camera_openai_lab_attempts (idempotency_key) WHERE idempotency_key IS NOT NULL;

-- Garante que o usuário só acesse suas próprias tentativas
DROP POLICY IF EXISTS "Users can view their own lab attempts" ON public.camera_openai_lab_attempts;
CREATE POLICY "Users can view their own lab attempts"
ON public.camera_openai_lab_attempts
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert their own lab attempts" ON public.camera_openai_lab_attempts;
CREATE POLICY "Users can insert their own lab attempts"
ON public.camera_openai_lab_attempts
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

GRANT SELECT, INSERT ON public.camera_openai_lab_attempts TO authenticated;
GRANT ALL ON public.camera_openai_lab_attempts TO service_role;
