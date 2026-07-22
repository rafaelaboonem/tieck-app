-- Permite curar imagens vindas de duas fontes: `evidences` (tarefas) e `checklist_evidences` (checklists públicos).
ALTER TABLE public.vision_curated_images
  ADD COLUMN IF NOT EXISTS checklist_evidence_id uuid REFERENCES public.checklist_evidences(id) ON DELETE CASCADE;

-- Torna `evidence_id` opcional para curadorias vindas de checklist.
ALTER TABLE public.vision_curated_images
  ALTER COLUMN evidence_id DROP NOT NULL;

-- Garante exatamente uma das duas fontes.
ALTER TABLE public.vision_curated_images
  DROP CONSTRAINT IF EXISTS vision_curated_images_source_check;
ALTER TABLE public.vision_curated_images
  ADD CONSTRAINT vision_curated_images_source_check
  CHECK ((evidence_id IS NOT NULL) <> (checklist_evidence_id IS NOT NULL));

-- Substitui a unique global por duas parciais, uma por fonte.
ALTER TABLE public.vision_curated_images
  DROP CONSTRAINT IF EXISTS vision_curated_images_dataset_id_evidence_id_key;
CREATE UNIQUE INDEX IF NOT EXISTS vision_curated_images_dataset_evidence_uidx
  ON public.vision_curated_images (dataset_id, evidence_id)
  WHERE evidence_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS vision_curated_images_dataset_checklist_evidence_uidx
  ON public.vision_curated_images (dataset_id, checklist_evidence_id)
  WHERE checklist_evidence_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS vision_curated_images_checklist_evidence_idx
  ON public.vision_curated_images (checklist_evidence_id)
  WHERE checklist_evidence_id IS NOT NULL;