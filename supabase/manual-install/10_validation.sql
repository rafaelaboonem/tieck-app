-- Structural validation ----------------------------------------------
DO $$
DECLARE
  v_missing text := '';
  v_forbidden text := '';
  t text;
  f text;
BEGIN
  -- Required tables
  FOREACH t IN ARRAY ARRAY[
    'checklist_analytics','checklist_evidence_analyses','checklist_evidences','checklist_members',
    'checklist_relations','checklist_responses','checklist_templates','checklists','cleanup_log',
    'evidence_ai_analyses','evidence_reviews','evidences','profiles','public_rate_limits','shifts',
    'signup_otp_codes','signup_otps','system_updates','task_executions','tasks','units','user_domains',
    'vision_datasets','vision_curated_images','workspace_card_meta','workspace_categories',
    'workspace_tasks','workspaces'
  ] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.tables
       WHERE table_schema='public' AND table_type='BASE TABLE' AND table_name=t
    ) THEN
      v_missing := v_missing || t || ' ';
    END IF;
  END LOOP;

  -- Forbidden legacy tables must NOT exist
  FOREACH t IN ARRAY ARRAY[
    'user_roles','workspace_members',
    'vision_anomaly_models','vision_dataset_snapshots','vision_dataset_snapshot_images',
    'vision_model_versions','vision_model_runs','vision_model_audit'
  ] LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.tables
       WHERE table_schema='public' AND table_name=t
    ) THEN
      v_forbidden := v_forbidden || t || ' ';
    END IF;
  END LOOP;

  -- Forbidden legacy types must NOT exist
  IF EXISTS (
    SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace
     WHERE n.nspname='public' AND t.typname='app_role'
  ) THEN
    v_forbidden := v_forbidden || 'app_role(type) ';
  END IF;

  -- Forbidden legacy functions must NOT exist
  FOREACH f IN ARRAY ARRAY[
    'has_role','is_reviewer','is_workspace_member','can_access_unit','can_manage_vision_training',
    'user_has_workspace_access','validate_checklist_publication','handle_new_workspace_owner',
    'activate_model_version','prepare_model_version','reject_model_version',
    'resolve_model_version_run_token','revoke_model_version_run_token',
    'rotate_model_version_run_token'
  ] LOOP
    IF EXISTS (
      SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
       WHERE n.nspname='public' AND p.proname=f
    ) THEN
      v_forbidden := v_forbidden || f || '() ';
    END IF;
  END LOOP;

  -- Required functions (owner-only access + public read/submit RPCs)
  FOREACH f IN ARRAY ARRAY['get_public_checklist','submit_public_response','publish_checklist'] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
       WHERE n.nspname='public' AND p.proname=f
    ) THEN
      v_missing := v_missing || f || '() ';
    END IF;
  END LOOP;

  IF length(v_missing) > 0 THEN
    RAISE EXCEPTION 'Missing required objects: %', v_missing;
  END IF;
  IF length(v_forbidden) > 0 THEN
    RAISE EXCEPTION 'Forbidden legacy objects still present: %', v_forbidden;
  END IF;

  -- Required buckets
  IF NOT EXISTS (SELECT 1 FROM storage.buckets WHERE id='evidences' AND public = false) THEN
    RAISE EXCEPTION 'Missing or non-private bucket: evidences';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM storage.buckets WHERE id='checklist-evidences' AND public = false) THEN
    RAISE EXCEPTION 'Missing or non-private bucket: checklist-evidences';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM storage.buckets WHERE id='vision-datasets' AND public = false) THEN
    RAISE EXCEPTION 'Missing or non-private bucket: vision-datasets';
  END IF;

  -- Required views
  FOREACH t IN ARRAY ARRAY[
    'analytics_critical_failures','analytics_daily_compliance','analytics_overdue_tasks',
    'analytics_unit_daily_compliance','analytics_unit_ranking'
  ] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.views
       WHERE table_schema='public' AND table_name=t
    ) THEN
      RAISE EXCEPTION 'Missing required view: %', t;
    END IF;
  END LOOP;

  -- RLS must be enabled on core tables
  IF EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
     WHERE n.nspname='public' AND c.relkind='r'
       AND c.relname IN ('checklists','evidences','tasks','task_executions','workspaces')
       AND NOT c.relrowsecurity
  ) THEN
    RAISE EXCEPTION 'RLS not enabled on one or more core tables';
  END IF;

  -- No anon SELECT policy may exist on public.checklists.
  IF EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'public' AND tablename = 'checklists'
       AND 'anon' = ANY(roles)
       AND (cmd IS NULL OR cmd = 'SELECT' OR cmd = 'ALL')
  ) THEN
    RAISE EXCEPTION 'Anonymous SELECT policy on public.checklists is forbidden';
  END IF;

  -- anon must NOT be granted SELECT on public.checklists
  IF EXISTS (
    SELECT 1 FROM information_schema.role_table_grants
     WHERE table_schema='public' AND table_name='checklists'
       AND grantee='anon' AND privilege_type='SELECT'
  ) THEN
    RAISE EXCEPTION 'Anonymous role has SELECT grant on public.checklists (must be revoked)';
  END IF;

  -- Legacy is_public column/policy must not exist
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema='public' AND column_name='is_public'
  ) THEN
    RAISE EXCEPTION 'Legacy column is_public still present in public schema';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname='public' AND policyname='ctpl_public_read'
  ) THEN
    RAISE EXCEPTION 'Legacy policy ctpl_public_read must be dropped';
  END IF;
  IF EXISTS (
    SELECT 1 FROM information_schema.role_table_grants
     WHERE table_schema='public' AND table_name='checklist_templates'
       AND grantee='anon' AND privilege_type='SELECT'
  ) THEN
    RAISE EXCEPTION 'Anonymous role has SELECT grant on public.checklist_templates (must be revoked)';
  END IF;

  -- HARDENING: anon and PUBLIC must have ZERO direct privileges on any
  -- table in the public schema. Public access only via SECURITY DEFINER RPCs.
  IF EXISTS (
    SELECT 1 FROM information_schema.role_table_grants
     WHERE table_schema='public' AND grantee IN ('anon','PUBLIC')
  ) THEN
    RAISE EXCEPTION 'Direct table privileges granted to anon/PUBLIC in public schema (must be revoked)';
  END IF;

  -- anon must retain EXECUTE only on the whitelisted public RPCs.
  FOREACH f IN ARRAY ARRAY['get_public_checklist','submit_public_response'] LOOP
    IF NOT EXISTS (
      SELECT 1
        FROM information_schema.role_routine_grants
       WHERE routine_schema='public' AND routine_name=f
         AND grantee='anon' AND privilege_type='EXECUTE'
    ) THEN
      RAISE EXCEPTION 'anon is missing EXECUTE on required RPC public.%()', f;
    END IF;
  END LOOP;

  RAISE NOTICE 'Manual install validation: OK';
END $$;
