
-- 1) selected_run_id must belong to the same version: composite FK
ALTER TABLE public.vision_model_runs
  ADD CONSTRAINT vision_model_runs_id_version_uniq UNIQUE (id, model_version_id);

ALTER TABLE public.vision_model_versions
  DROP CONSTRAINT IF EXISTS vision_model_versions_selected_run_id_fkey;

ALTER TABLE public.vision_model_versions
  ADD CONSTRAINT vision_model_versions_selected_run_fkey
  FOREIGN KEY (selected_run_id, id)
  REFERENCES public.vision_model_runs (id, model_version_id)
  ON DELETE SET NULL
  DEFERRABLE INITIALLY IMMEDIATE;

-- 2) One active model per (slug, organization) — partial unique index
CREATE UNIQUE INDEX IF NOT EXISTS vision_anomaly_models_one_active_per_slug_org
  ON public.vision_anomaly_models (slug, COALESCE(organization_id, '00000000-0000-0000-0000-000000000000'::uuid))
  WHERE status = 'active' AND retired_at IS NULL;

-- 3) Hardening: REVOKE PUBLIC/anon on SECURITY DEFINER RPCs
REVOKE ALL ON FUNCTION public.prepare_model_version(uuid, text, bigint) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.rotate_model_version_run_token(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.revoke_model_version_run_token(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.reject_model_version(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.activate_model_version(uuid, uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.resolve_model_version_run_token(text) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.prepare_model_version(uuid, text, bigint) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.rotate_model_version_run_token(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.revoke_model_version_run_token(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.reject_model_version(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.activate_model_version(uuid, uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.resolve_model_version_run_token(text) TO service_role;
