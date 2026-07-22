-- Auto-generated from pg_catalog introspection.
-- Regenerated after removal of Anomalib/Railway training objects.
-- Do not edit by hand; see supabase/clean-baseline/README.md.

DO $$
BEGIN
  IF (current_setting('server_version_num')::int < 150000) THEN
    RAISE EXCEPTION 'Postgres 15+ required (found %)', current_setting('server_version');
  END IF;
END $$;

DO $$
DECLARE r text;
BEGIN
  FOREACH r IN ARRAY ARRAY['anon','authenticated','service_role'] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname=r) THEN
      RAISE EXCEPTION 'Required Supabase role missing: %', r;
    END IF;
  END LOOP;
END $$;
