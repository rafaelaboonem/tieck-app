-- Substituir o índice UNIQUE parcial por uma constraint UNIQUE completa
-- compatível com ON CONFLICT do PostgREST/Supabase JS.
DROP INDEX IF EXISTS public.vision_curated_images_dataset_checklist_evidence_uidx;

ALTER TABLE public.vision_curated_images
  ADD CONSTRAINT vision_curated_images_dataset_checklist_evidence_key
  UNIQUE (dataset_id, checklist_evidence_id);

-- Idem para evidence_id (legado), pelo mesmo motivo.
DROP INDEX IF EXISTS public.vision_curated_images_dataset_evidence_uidx;

ALTER TABLE public.vision_curated_images
  ADD CONSTRAINT vision_curated_images_dataset_evidence_key
  UNIQUE (dataset_id, evidence_id);