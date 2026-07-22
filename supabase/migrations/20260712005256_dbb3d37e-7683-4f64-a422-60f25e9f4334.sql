CREATE TABLE IF NOT EXISTS public.vision_anomaly_models (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NULL,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  task_category TEXT NULL,
  provider TEXT NOT NULL DEFAULT 'anomalib'
    CHECK (provider IN ('anomalib','openai','manual')),
  algorithm TEXT NULL CHECK (algorithm IS NULL OR algorithm IN ('patchcore','efficient_ad','padim','fastflow','stfpm','other')),
  version TEXT NOT NULL DEFAULT 'v1',
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','training','validating','active','failed','retired')),
  model_storage_path TEXT NULL,
  input_width INTEGER NULL,
  input_height INTEGER NULL,
  threshold NUMERIC NULL CHECK (threshold IS NULL OR (threshold >= 0 AND threshold <= 1)),
  training_dataset_version TEXT NULL,
  normal_image_count INTEGER NULL,
  anomalous_test_image_count INTEGER NULL,
  metrics JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  activated_at TIMESTAMPTZ NULL,
  retired_at TIMESTAMPTZ NULL,
  UNIQUE (organization_id, slug, version)
);

CREATE INDEX IF NOT EXISTS vision_anomaly_models_org_status_idx
  ON public.vision_anomaly_models (organization_id, status);
CREATE INDEX IF NOT EXISTS vision_anomaly_models_slug_idx
  ON public.vision_anomaly_models (slug);

GRANT SELECT ON public.vision_anomaly_models TO authenticated;
GRANT ALL ON public.vision_anomaly_models TO service_role;

ALTER TABLE public.vision_anomaly_models ENABLE ROW LEVEL SECURITY;

CREATE POLICY "vision_models_select_scope"
  ON public.vision_anomaly_models FOR SELECT
  TO authenticated
  USING (
    organization_id IS NULL
    OR EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND (
          ur.role IN ('admin','franqueadora')
          OR ur.organization_id = vision_anomaly_models.organization_id
        )
    )
  );

CREATE POLICY "vision_models_write_admin"
  ON public.vision_anomaly_models FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role IN ('admin','franqueadora')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role IN ('admin','franqueadora')
    )
  );

CREATE TRIGGER vision_anomaly_models_updated_at
  BEFORE UPDATE ON public.vision_anomaly_models
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS vision_provider TEXT NOT NULL DEFAULT 'manual'
    CHECK (vision_provider IN ('anomalib','openai','manual')),
  ADD COLUMN IF NOT EXISTS vision_model_id UUID NULL REFERENCES public.vision_anomaly_models(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS vision_analysis_enabled BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS vision_fallback_mode TEXT NOT NULL DEFAULT 'manual_review'
    CHECK (vision_fallback_mode IN ('none','manual_review','openai'));

ALTER TABLE public.evidence_ai_analyses
  ADD COLUMN IF NOT EXISTS provider TEXT NOT NULL DEFAULT 'openai'
    CHECK (provider IN ('anomalib','openai','manual')),
  ADD COLUMN IF NOT EXISTS model_id UUID NULL REFERENCES public.vision_anomaly_models(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS model_version TEXT NULL,
  ADD COLUMN IF NOT EXISTS anomaly_score NUMERIC NULL,
  ADD COLUMN IF NOT EXISTS threshold NUMERIC NULL,
  ADD COLUMN IF NOT EXISTS detected_regions JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS anomaly_map_storage_path TEXT NULL,
  ADD COLUMN IF NOT EXISTS inference_time_ms INTEGER NULL,
  ADD COLUMN IF NOT EXISTS raw_result JSONB NULL,
  ADD COLUMN IF NOT EXISTS fallback_of UUID NULL REFERENCES public.evidence_ai_analyses(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS evidence_ai_analyses_provider_idx
  ON public.evidence_ai_analyses (evidence_id, provider, created_at DESC);