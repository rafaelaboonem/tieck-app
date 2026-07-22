CREATE TABLE public.vision_curated_images (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dataset_id uuid NOT NULL REFERENCES public.vision_datasets(id) ON DELETE CASCADE,
  evidence_id uuid NOT NULL REFERENCES public.evidences(id) ON DELETE CASCADE,
  classification text NOT NULL CHECK (classification IN ('normal','anomalous','ignored')),
  source_storage_path text NOT NULL,
  curated_storage_path text,
  sha256 text,
  response_id uuid,
  checklist_id uuid,
  block_id text,
  organization_id uuid,
  unit_id uuid,
  reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at timestamptz NOT NULL DEFAULT now(),
  note text,
  split text CHECK (split IN ('train','validation','test')),
  dataset_version text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (dataset_id, evidence_id)
);

CREATE INDEX vision_curated_images_dataset_class_idx
  ON public.vision_curated_images (dataset_id, classification);
CREATE INDEX vision_curated_images_evidence_idx
  ON public.vision_curated_images (evidence_id);
CREATE INDEX vision_curated_images_sha_idx
  ON public.vision_curated_images (sha256);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.vision_curated_images TO authenticated;
GRANT ALL ON public.vision_curated_images TO service_role;

ALTER TABLE public.vision_curated_images ENABLE ROW LEVEL SECURITY;

CREATE POLICY "curated_images_auth_select" ON public.vision_curated_images
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "curated_images_auth_insert" ON public.vision_curated_images
  FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "curated_images_auth_update" ON public.vision_curated_images
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "curated_images_auth_delete" ON public.vision_curated_images
  FOR DELETE TO authenticated USING (true);

CREATE TRIGGER vision_curated_images_updated_at
  BEFORE UPDATE ON public.vision_curated_images
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();