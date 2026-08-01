ALTER TABLE public.visual_standards
  ADD COLUMN IF NOT EXISTS checklist_id uuid REFERENCES public.checklists(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS camera_block_id uuid,
  ADD COLUMN IF NOT EXISTS archived_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS validated_question text;

CREATE UNIQUE INDEX IF NOT EXISTS visual_standards_camera_block_unique
  ON public.visual_standards (workspace_id, checklist_id, camera_block_id)
  WHERE camera_block_id IS NOT NULL AND archived_at IS NULL;

CREATE INDEX IF NOT EXISTS visual_standards_camera_block_idx
  ON public.visual_standards (camera_block_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.visual_standards TO authenticated;
GRANT ALL ON public.visual_standards TO service_role;