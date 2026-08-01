ALTER TABLE public.visual_standards
  ADD COLUMN IF NOT EXISTS internal_profile jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS profile_version integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS needs_validation boolean NOT NULL DEFAULT false;