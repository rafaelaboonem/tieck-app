-- Reset a partial/failed install of the Tieck clean baseline.
-- Drops ONLY objects owned by this baseline (see manifest.json).
-- Never drops Supabase-managed schemas/objects.

BEGIN;

-- Triggers -----------------------------------------------------------
DROP TRIGGER IF EXISTS set_checklists_updated_at ON public.checklists;
DROP TRIGGER IF EXISTS task_executions_updated_at ON public.task_executions;
DROP TRIGGER IF EXISTS tasks_updated_at ON public.tasks;
DROP TRIGGER IF EXISTS tr_set_unique_custom_slug ON public.checklists;
DROP TRIGGER IF EXISTS trg_check_evidence_execution_consistency ON public.evidences;
DROP TRIGGER IF EXISTS trg_checklist_analyses_updated_at ON public.checklist_evidence_analyses;
DROP TRIGGER IF EXISTS trg_checklist_evidences_updated_at ON public.checklist_evidences;
DROP TRIGGER IF EXISTS trg_delete_response_storage_files ON public.checklist_responses;
DROP TRIGGER IF EXISTS trg_task_lifecycle ON public.tasks;
DROP TRIGGER IF EXISTS trg_task_rematerialize ON public.tasks;
DROP TRIGGER IF EXISTS trg_unit_lifecycle ON public.units;
DROP TRIGGER IF EXISTS trg_vision_datasets_public_id_immutable ON public.vision_datasets;
DROP TRIGGER IF EXISTS trg_vision_datasets_updated_at ON public.vision_datasets;
DROP TRIGGER IF EXISTS update_evidences_updated_at ON public.evidences;
DROP TRIGGER IF EXISTS update_shifts_updated_at ON public.shifts;
DROP TRIGGER IF EXISTS update_units_updated_at ON public.units;
DROP TRIGGER IF EXISTS update_user_domains_updated_at ON public.user_domains;
DROP TRIGGER IF EXISTS update_workspace_card_meta_updated_at ON public.workspace_card_meta;
DROP TRIGGER IF EXISTS update_workspace_categories_updated_at ON public.workspace_categories;
DROP TRIGGER IF EXISTS update_workspace_tasks_updated_at ON public.workspace_tasks;
DROP TRIGGER IF EXISTS update_workspaces_updated_at ON public.workspaces;
DROP TRIGGER IF EXISTS vision_curated_images_updated_at ON public.vision_curated_images;

-- Views --------------------------------------------------------------
DROP VIEW IF EXISTS public.analytics_unit_ranking CASCADE;
DROP VIEW IF EXISTS public.analytics_unit_daily_compliance CASCADE;
DROP VIEW IF EXISTS public.analytics_overdue_tasks CASCADE;
DROP VIEW IF EXISTS public.analytics_daily_compliance CASCADE;
DROP VIEW IF EXISTS public.analytics_critical_failures CASCADE;

-- Tables (order respects FK dependencies via CASCADE) ----------------
DROP TABLE IF EXISTS public.checklist_evidence_analyses CASCADE;
DROP TABLE IF EXISTS public.checklist_evidences CASCADE;
DROP TABLE IF EXISTS public.checklist_members CASCADE;
DROP TABLE IF EXISTS public.checklist_relations CASCADE;
DROP TABLE IF EXISTS public.checklist_responses CASCADE;
DROP TABLE IF EXISTS public.checklist_templates CASCADE;
DROP TABLE IF EXISTS public.checklist_analytics CASCADE;
DROP TABLE IF EXISTS public.evidence_ai_analyses CASCADE;
DROP TABLE IF EXISTS public.evidence_reviews CASCADE;
DROP TABLE IF EXISTS public.evidences CASCADE;
DROP TABLE IF EXISTS public.task_executions CASCADE;
DROP TABLE IF EXISTS public.tasks CASCADE;
DROP TABLE IF EXISTS public.workspace_tasks CASCADE;
DROP TABLE IF EXISTS public.workspace_card_meta CASCADE;
DROP TABLE IF EXISTS public.workspace_categories CASCADE;
DROP TABLE IF EXISTS public.vision_curated_images CASCADE;
DROP TABLE IF EXISTS public.vision_datasets CASCADE;
DROP TABLE IF EXISTS public.checklists CASCADE;
DROP TABLE IF EXISTS public.shifts CASCADE;
DROP TABLE IF EXISTS public.units CASCADE;
DROP TABLE IF EXISTS public.workspaces CASCADE;
DROP TABLE IF EXISTS public.user_domains CASCADE;
DROP TABLE IF EXISTS public.profiles CASCADE;
DROP TABLE IF EXISTS public.public_rate_limits CASCADE;
DROP TABLE IF EXISTS public.signup_otp_codes CASCADE;
DROP TABLE IF EXISTS public.signup_otps CASCADE;
DROP TABLE IF EXISTS public.system_updates CASCADE;
DROP TABLE IF EXISTS public.cleanup_log CASCADE;

-- Functions ----------------------------------------------------------
DROP FUNCTION IF EXISTS public.check_evidence_execution_consistency() CASCADE;
DROP FUNCTION IF EXISTS public.claim_checklist_analysis(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.claim_evidence_for_analysis(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.cleanup_expired_responses() CASCADE;
DROP FUNCTION IF EXISTS public.create_checklist_evidence_attempt(uuid,uuid,text,text,integer,text,uuid,integer) CASCADE;
DROP FUNCTION IF EXISTS public.delete_response_storage_files() CASCADE;
DROP FUNCTION IF EXISTS public.generate_dataset_public_id() CASCADE;
DROP FUNCTION IF EXISTS public.generate_short_slug(integer) CASCADE;
DROP FUNCTION IF EXISTS public.get_public_checklist(text) CASCADE;
DROP FUNCTION IF EXISTS public.get_user_email_by_id(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.get_user_id_by_email(text) CASCADE;
DROP FUNCTION IF EXISTS public.handle_new_user() CASCADE;
DROP FUNCTION IF EXISTS public.handle_task_lifecycle() CASCADE;
DROP FUNCTION IF EXISTS public.handle_unit_lifecycle() CASCADE;
DROP FUNCTION IF EXISTS public.handle_updated_at() CASCADE;
DROP FUNCTION IF EXISTS public.hit_public_rate_limit(text,text,integer,integer) CASCADE;
DROP FUNCTION IF EXISTS public.import_legacy_checklist_photos() CASCADE;
DROP FUNCTION IF EXISTS public.materialize_task_executions() CASCADE;
DROP FUNCTION IF EXISTS public.publish_checklist(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.rematerialize_after_task_change() CASCADE;
DROP FUNCTION IF EXISTS public.set_unique_custom_slug() CASCADE;
DROP FUNCTION IF EXISTS public.set_unique_short_slug() CASCADE;
DROP FUNCTION IF EXISTS public.submit_public_response(text,jsonb) CASCADE;
DROP FUNCTION IF EXISTS public.update_checklist_retention(uuid,integer,boolean) CASCADE;
DROP FUNCTION IF EXISTS public.update_updated_at_column() CASCADE;
DROP FUNCTION IF EXISTS public.vision_datasets_prevent_public_id_update() CASCADE;

-- Enums --------------------------------------------------------------
DROP TYPE IF EXISTS public.checklist_evidence_analysis_status CASCADE;
DROP TYPE IF EXISTS public.checklist_response_status CASCADE;
DROP TYPE IF EXISTS public.execution_status CASCADE;
DROP TYPE IF EXISTS public.task_weight CASCADE;

-- Storage buckets created by this baseline ---------------------------
-- Storage policies live on storage.objects; drop those first.
DO $$
DECLARE p record;
BEGIN
  FOR p IN
    SELECT policyname FROM pg_policies
    WHERE schemaname='storage' AND tablename='objects'
      AND policyname IN (
        'Avatars are publicly accessible',
        'Users can upload their own avatar',
        'Users can update their own avatar',
        'Users can delete their own avatar',
        'Public can view checklist assets',
        'Authenticated users can upload checklist assets',
        'Users can update their own checklist assets',
        'Users can delete their own checklist assets',
        'checklist_evidences_owner_read',
        'checklist_evidences_owner_delete',
        'vision_datasets_auth_select',
        'vision_datasets_auth_insert',
        'vision_datasets_auth_update',
        'vision_datasets_auth_delete',
        'Workspace assets are publicly accessible',
        'Authenticated users can upload workspace assets',
        'Users can update their own workspace assets',
        'Users can delete their own workspace assets'
      )
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON storage.objects', p.policyname);
  END LOOP;
END $$;

DELETE FROM storage.objects WHERE bucket_id IN
  ('avatars','checklist-assets','checklist-evidences','evidences','vision-datasets','workspace-assets');
DELETE FROM storage.buckets WHERE id IN
  ('avatars','checklist-assets','checklist-evidences','evidences','vision-datasets','workspace-assets');

COMMIT;