BEGIN;

CREATE TABLE IF NOT EXISTS public.checklist_evidences (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    checklist_id uuid NOT NULL REFERENCES public.checklists(id) ON DELETE CASCADE,
    response_id uuid NOT NULL REFERENCES public.checklist_responses(id) ON DELETE CASCADE,
    block_id text NOT NULL,
    storage_path text NOT NULL UNIQUE,
    mime_type text,
    size_bytes bigint,
    source text DEFAULT 'camera_ai_v4',
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_checklist_evidences_response_block 
ON public.checklist_evidences(response_id, block_id);

GRANT SELECT, INSERT ON public.checklist_evidences TO authenticated;
GRANT ALL ON public.checklist_evidences TO service_role;

ALTER TABLE public.checklist_evidences ENABLE ROW LEVEL SECURITY;

DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'camera_ai_attempts' AND column_name = 'evidence_id') THEN
    ALTER TABLE public.camera_ai_attempts ADD COLUMN evidence_id uuid REFERENCES public.checklist_evidences(id) ON DELETE SET NULL;
  END IF;
END $$;

COMMIT;
