-- Create camera_v4_attempts table
CREATE TYPE public.camera_v4_state AS ENUM (
  'created', 
  'uploaded', 
  'identity_check', 
  'condition_check', 
  'approved', 
  'retake', 
  'not_observable', 
  'technical_failure'
);

CREATE TYPE public.camera_v4_decision AS ENUM (
  'approved', 
  'retake', 
  'not_observable', 
  'technical_failure'
);

CREATE TABLE public.camera_v4_attempts (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
    checklist_id uuid NOT NULL,
    block_id text NOT NULL,
    camera_block_id text NOT NULL,
    visual_standard_id uuid REFERENCES public.visual_standards(id) ON DELETE SET NULL,
    state public.camera_v4_state NOT NULL DEFAULT 'created',
    decision public.camera_v4_decision,
    identity_result jsonb,
    condition_result jsonb,
    metadata jsonb DEFAULT '{}'::jsonb,
    verified_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- Grants
GRANT SELECT, INSERT, UPDATE, DELETE ON public.camera_v4_attempts TO authenticated;
GRANT ALL ON public.camera_v4_attempts TO service_role;

-- RLS
ALTER TABLE public.camera_v4_attempts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can only access attempts of their own workspaces"
ON public.camera_v4_attempts
FOR ALL
TO authenticated
USING (
    workspace_id IN (
        SELECT id FROM public.workspaces WHERE owner_id = auth.uid()
    )
);

-- Indices
CREATE INDEX idx_camera_v4_attempts_workspace ON public.camera_v4_attempts(workspace_id);
CREATE INDEX idx_camera_v4_attempts_checklist ON public.camera_v4_attempts(checklist_id);
CREATE INDEX idx_camera_v4_attempts_state ON public.camera_v4_attempts(state);
