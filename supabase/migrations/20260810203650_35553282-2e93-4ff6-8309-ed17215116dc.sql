
CREATE TABLE public.camera_openai_lab_attempts (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    workspace_id uuid NOT NULL,
    standard_id uuid REFERENCES public.visual_standards(id) ON DELETE CASCADE,
    reference_ids uuid[] NOT NULL,
    
    -- Análise Estruturada
    schema_version text NOT NULL DEFAULT 'tieck_openai_lab_v1',
    target_present boolean NOT NULL,
    same_task_context boolean NOT NULL,
    condition_observable boolean NOT NULL,
    condition_met boolean NOT NULL,
    image_quality_usable boolean NOT NULL,
    reference_consistency text NOT NULL, -- 'match' | 'mismatch' | 'insufficient'
    observed_evidence text[] NOT NULL,
    blocking_reasons text[] NOT NULL,
    capture_instruction text NOT NULL,
    model_decision text NOT NULL, -- 'approved' | 'retake' | 'not_verifiable'
    confidence numeric NOT NULL,
    
    -- Gate do Servidor
    server_decision text NOT NULL, -- 'approved' | 'retake' | 'not_verifiable' | 'technical_failure'
    
    -- Telemetria
    model text NOT NULL,
    response_id text,
    tokens_input integer,
    tokens_output integer,
    tokens_total integer,
    latency_ms integer,
    prompt_version text NOT NULL,
    error_code text,
    
    created_at timestamptz DEFAULT now()
);

GRANT SELECT, INSERT ON public.camera_openai_lab_attempts TO authenticated;
GRANT ALL ON public.camera_openai_lab_attempts TO service_role;

ALTER TABLE public.camera_openai_lab_attempts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own lab attempts"
ON public.camera_openai_lab_attempts
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own lab attempts"
ON public.camera_openai_lab_attempts
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);
