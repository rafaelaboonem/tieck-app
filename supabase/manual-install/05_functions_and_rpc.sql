-- Auto-generated from pg_catalog introspection.
-- Regenerated after removal of Anomalib/Railway training objects.
-- Do not edit by hand; see supabase/clean-baseline/README.md.

-- Name: check_evidence_execution_consistency(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.check_evidence_execution_consistency() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE
  ex_org uuid;
  ex_unit uuid;
  ex_task uuid;
BEGIN
  SELECT organization_id, unit_id, task_id
    INTO ex_org, ex_unit, ex_task
  FROM public.task_executions
  WHERE id = NEW.task_execution_id;

  IF ex_org IS NULL THEN
    RAISE EXCEPTION 'Execução % não encontrada para vínculo de evidência', NEW.task_execution_id
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  IF NEW.organization_id IS DISTINCT FROM ex_org THEN
    RAISE EXCEPTION 'organization_id da evidência (%) difere da execução (%)', NEW.organization_id, ex_org
      USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.unit_id IS DISTINCT FROM ex_unit THEN
    RAISE EXCEPTION 'unit_id da evidência (%) difere da execução (%)', NEW.unit_id, ex_unit
      USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.task_id IS DISTINCT FROM ex_task THEN
    RAISE EXCEPTION 'task_id da evidência (%) difere da execução (%)', NEW.task_id, ex_task
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;


--

-- Name: claim_checklist_analysis(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.claim_checklist_analysis(p_analysis_id uuid) RETURNS TABLE(claimed boolean, current_status text)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_new_status public.checklist_evidence_analysis_status;
  v_current    public.checklist_evidence_analysis_status;
BEGIN
  UPDATE public.checklist_evidence_analyses
     SET status = 'processing',
         processing_started_at = now()
   WHERE id = p_analysis_id
     AND status = 'pending'
  RETURNING status INTO v_new_status;

  IF v_new_status IS NOT NULL THEN
    RETURN QUERY SELECT true, v_new_status::text;
    RETURN;
  END IF;

  SELECT status INTO v_current FROM public.checklist_evidence_analyses WHERE id = p_analysis_id;
  RETURN QUERY SELECT false, v_current::text;
END;
$$;


--

-- Name: claim_evidence_for_analysis(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.claim_evidence_for_analysis(p_evidence_id uuid) RETURNS TABLE(claimed boolean, current_status text)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_new_status text;
  v_current text;
BEGIN
  UPDATE public.evidences
     SET status = 'processing'
   WHERE id = p_evidence_id
     AND status IN ('pending','analysis_failed')
  RETURNING status INTO v_new_status;

  IF v_new_status IS NOT NULL THEN
    RETURN QUERY SELECT true, v_new_status;
    RETURN;
  END IF;

  SELECT status INTO v_current FROM public.evidences WHERE id = p_evidence_id;
  RETURN QUERY SELECT false, v_current;
END;
$$;


--

-- Name: cleanup_expired_responses(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.cleanup_expired_responses() RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_deleted integer;
BEGIN
  WITH deleted AS (
    DELETE FROM public.checklist_responses r
    USING public.checklists c
    WHERE r.checklist_id = c.id
      AND COALESCE((c.settings->>'dataRetention')::boolean, false) = true
      AND r.submitted_at + (COALESCE((c.settings->>'retentionDays')::int, 3) || ' days')::interval < now()
    RETURNING r.id
  )
  SELECT count(*) INTO v_deleted FROM deleted;

  INSERT INTO public.cleanup_log (deleted_count) VALUES (v_deleted);
END;
$$;


--

-- Name: create_checklist_evidence_attempt(uuid, uuid, text, text, integer, text, uuid, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.create_checklist_evidence_attempt(p_checklist_id uuid, p_response_id uuid, p_block_id text, p_mime_type text, p_size_bytes integer, p_storage_path text, p_evidence_id uuid, p_max_attempts integer DEFAULT 10) RETURNS TABLE(evidence_id uuid, attempt_number integer, previous_evidence_id uuid, storage_path text)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_lock_key bigint;
  v_next integer;
  v_prev uuid;
BEGIN
  -- Lock consultivo por (response, block) — serializa start-upload concorrentes.
  v_lock_key := ('x' || substr(md5(p_response_id::text || ':' || p_block_id), 1, 15))::bit(60)::bigint;
  PERFORM pg_advisory_xact_lock(v_lock_key);

  SELECT COALESCE(MAX(ce.attempt_number), 0) + 1,
         (SELECT ce2.id FROM public.checklist_evidences ce2
           WHERE ce2.response_id = p_response_id AND ce2.block_id = p_block_id
           ORDER BY ce2.attempt_number DESC LIMIT 1)
    INTO v_next, v_prev
  FROM public.checklist_evidences ce
  WHERE ce.response_id = p_response_id AND ce.block_id = p_block_id;

  IF v_next > p_max_attempts THEN
    RAISE EXCEPTION 'attempt_limit_reached' USING ERRCODE = 'check_violation';
  END IF;

  INSERT INTO public.checklist_evidences (
    id, checklist_id, response_id, block_id,
    storage_path, attempt_number, previous_evidence_id,
    mime_type, size_bytes, uploaded
  ) VALUES (
    p_evidence_id, p_checklist_id, p_response_id, p_block_id,
    p_storage_path, v_next, v_prev,
    p_mime_type, p_size_bytes, false
  );

  RETURN QUERY SELECT p_evidence_id, v_next, v_prev, p_storage_path;
END;
$$;


--

-- Name: delete_response_storage_files(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.delete_response_storage_files() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'storage'
    AS $_$
DECLARE
  v_url text;
  v_path text;
  v_marker text := '/checklist-assets/';
  v_idx int;
BEGIN
  IF OLD.answers IS NULL THEN
    RETURN OLD;
  END IF;

  -- Walk every string value in the answers jsonb tree, looking for URLs that point to the checklist-assets bucket.
  FOR v_url IN
    SELECT value::text
    FROM jsonb_path_query(OLD.answers, 'strict $.**?(@.type() == "string")') AS value
  LOOP
    -- value::text wraps strings in quotes; strip them
    v_url := btrim(v_url, '"');

    v_idx := position(v_marker IN v_url);
    IF v_idx > 0 THEN
      v_path := substring(v_url FROM v_idx + length(v_marker));
      -- Strip any query string
      v_path := split_part(v_path, '?', 1);

      IF v_path <> '' THEN
        BEGIN
          DELETE FROM storage.objects
          WHERE bucket_id = 'checklist-assets'
            AND name = v_path;
        EXCEPTION WHEN OTHERS THEN
          -- Never block the response deletion if storage cleanup fails
          RAISE WARNING 'Falha ao apagar arquivo do storage %: %', v_path, SQLERRM;
        END;
      END IF;
    END IF;
  END LOOP;

  RETURN OLD;
END;
$_$;


--

-- Name: generate_dataset_public_id(); Type: FUNCTION; Schema: public; Owner: -
--

-- Moved to 02b_prereq_functions.sql (used in column DEFAULT on vision_datasets).


--

-- Name: generate_short_slug(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.generate_short_slug(length integer DEFAULT 6) RETURNS text
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
DECLARE
  chars text := 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  result text := '';
  i integer := 0;
BEGIN
  FOR i IN 1..length LOOP
    result := result || substr(chars, floor(random() * length(chars) + 1)::integer, 1);
  END LOOP;
  RETURN result;
END;
$$;


--

-- Name: get_user_email_by_id(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_user_email_by_id(user_uuid uuid) RETURNS text
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'auth'
    AS $$
DECLARE
  user_email TEXT;
BEGIN
  -- Tenta buscar no auth.users (requer privilégios de service_role)
  -- Mas como estamos chamando via RPC, precisamos garantir que o search_path e permissões estejam ok
  SELECT email INTO user_email FROM auth.users WHERE id = user_uuid;
  
  RETURN user_email;
END;
$$;


--

-- Name: get_user_id_by_email(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_user_id_by_email(email_to_find text) RETURNS TABLE(user_id uuid)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  RETURN QUERY SELECT id FROM auth.users WHERE email = email_to_find;
END;
$$;


--

-- Name: handle_new_user(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.handle_new_user() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name, first_name, last_name, avatar_url)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'display_name', NEW.email),
    NEW.raw_user_meta_data->>'first_name',
    NEW.raw_user_meta_data->>'last_name',
    NEW.raw_user_meta_data->>'avatar_url'
  );
  RETURN NEW;
END;
$$;


--

-- Name: handle_task_lifecycle(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.handle_task_lifecycle() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
BEGIN
  -- Desativação: cancela slots futuros pendentes
  IF OLD.is_active = true AND NEW.is_active = false THEN
    UPDATE public.task_executions
       SET status = 'cancelled'::public.execution_status,
           cancelled_at = now(),
           cancellation_reason = 'task_deactivated'
     WHERE task_id = NEW.id
       AND status = 'pending'
       AND scheduled_at > now();
  END IF;

  -- Reativação: reinicia active_from para não gerar atraso retroativo
  IF OLD.is_active = false AND NEW.is_active = true THEN
    NEW.active_from := now();
  END IF;

  -- Alteração de horário: cancela slot antigo pendente futuro
  IF NEW.is_active = true
     AND OLD.scheduled_time IS DISTINCT FROM NEW.scheduled_time THEN
    UPDATE public.task_executions
       SET status = 'cancelled'::public.execution_status,
           cancelled_at = now(),
           cancellation_reason = 'schedule_changed'
     WHERE task_id = NEW.id
       AND status = 'pending'
       AND scheduled_at > now();
  END IF;

  RETURN NEW;
END;
$$;


--

-- Name: handle_unit_lifecycle(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.handle_unit_lifecycle() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
BEGIN
  IF OLD.is_active = true AND NEW.is_active = false THEN
    UPDATE public.task_executions
       SET status = 'cancelled'::public.execution_status,
           cancelled_at = now(),
           cancellation_reason = 'unit_deactivated'
     WHERE unit_id = NEW.id
       AND status = 'pending'
       AND scheduled_at > now();
  END IF;
  RETURN NEW;
END;
$$;


--

-- Name: handle_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.handle_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


--

-- Name: hit_public_rate_limit(text, text, integer, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.hit_public_rate_limit(p_key_hash text, p_action text, p_window_seconds integer, p_limit integer) RETURNS TABLE(allowed boolean, current_hits integer)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_window timestamptz;
  v_hits integer;
BEGIN
  v_window := to_timestamp(
    (floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds)::bigint
  );

  INSERT INTO public.public_rate_limits (key_hash, action, window_start, hits)
  VALUES (p_key_hash, p_action, v_window, 1)
  ON CONFLICT (key_hash, action, window_start)
    DO UPDATE SET hits = public_rate_limits.hits + 1
  RETURNING hits INTO v_hits;

  -- Limpeza best-effort de janelas antigas (>24h).
  DELETE FROM public.public_rate_limits
   WHERE window_start < now() - interval '24 hours';

  RETURN QUERY SELECT (v_hits <= p_limit) AS allowed, v_hits;
END;
$$;


--

-- Name: import_legacy_checklist_photos(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.import_legacy_checklist_photos() RETURNS TABLE(found integer, migrated integer, unmapped integer, skipped integer)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_found integer := 0;
  v_migrated integer := 0;
  v_unmapped integer := 0;
  v_skipped integer := 0;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE='insufficient_privilege';
  END IF;

  WITH src AS (
    SELECT
      r.id                                       AS response_id,
      r.checklist_id                             AS checklist_id,
      COALESCE(r.submitted_at, r.created_at)     AS submitted_at,
      c.blocks                                   AS blocks,
      kv.key                                     AS block_id,
      kv.value->>'url'                           AS url,
      kv.value->>'type'                          AS mime,
      -- Extrai o caminho relativo dentro do bucket checklist-assets.
      regexp_replace(
        split_part(kv.value->>'url', '?', 1),
        '^.*/checklist-assets/', ''
      )                                          AS storage_path
    FROM public.checklist_responses r
    JOIN public.checklists c ON c.id = r.checklist_id,
    LATERAL jsonb_each(r.answers) kv
    WHERE jsonb_typeof(kv.value) = 'object'
      AND (kv.value->>'url')  LIKE '%/checklist-assets/%'
      AND (kv.value->>'type') LIKE 'image/%'
  ),
  tagged AS (
    SELECT s.*,
      EXISTS (
        SELECT 1 FROM jsonb_array_elements(s.blocks) b WHERE b->>'id' = s.block_id
      ) AS has_block
    FROM src s
    WHERE s.storage_path <> '' AND s.storage_path IS NOT NULL
  ),
  ins AS (
    INSERT INTO public.checklist_evidences(
      checklist_id, response_id, block_id, storage_path,
      attempt_number, uploaded, mime_type, submitted_at,
      source, origin_bucket, original_url
    )
    SELECT
      t.checklist_id, t.response_id, t.block_id, t.storage_path,
      1, true, t.mime, t.submitted_at,
      CASE WHEN t.has_block THEN 'legacy_migrated' ELSE 'legacy_unmapped' END,
      'checklist-assets', t.url
    FROM tagged t
    ON CONFLICT (response_id, block_id, storage_path) DO NOTHING
    RETURNING source
  )
  SELECT
    (SELECT count(*) FROM tagged)::int,
    (SELECT count(*) FROM ins)::int,
    (SELECT count(*) FROM tagged WHERE NOT has_block)::int,
    ((SELECT count(*) FROM tagged) - (SELECT count(*) FROM ins))::int
  INTO v_found, v_migrated, v_unmapped, v_skipped;

  RETURN QUERY SELECT v_found, v_migrated, v_unmapped, v_skipped;
END;
$$;


--

-- Name: materialize_task_executions(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.materialize_task_executions() RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_inserted integer := 0;
BEGIN
  WITH days AS (
    SELECT 0 AS d UNION ALL SELECT 1
  ),
  planned AS (
    SELECT
      t.id              AS task_id,
      t.organization_id AS organization_id,
      t.unit_id         AS unit_id,
      t.shift_id        AS shift_id,
      (
        (((now() AT TIME ZONE u.timezone)::date + days.d)::text
         || ' ' || t.scheduled_time::text)::timestamp
      ) AT TIME ZONE u.timezone AS scheduled_at,
      COALESCE(t.active_from, t.created_at) AS active_from
    FROM public.tasks t
    JOIN public.units u ON u.id = t.unit_id
    CROSS JOIN days
    WHERE t.is_active = true
      AND u.is_active = true
      AND t.scheduled_time IS NOT NULL
  ),
  ins AS (
    INSERT INTO public.task_executions
      (task_id, organization_id, unit_id, shift_id, scheduled_at, status)
    SELECT p.task_id, p.organization_id, p.unit_id, p.shift_id, p.scheduled_at, 'pending'::public.execution_status
    FROM planned p
    WHERE p.scheduled_at >= p.active_from
    ON CONFLICT (task_id, unit_id, scheduled_at) DO NOTHING
    RETURNING 1
  )
  SELECT COUNT(*)::int INTO v_inserted FROM ins;

  RETURN v_inserted;
END;
$$;


--
-- Name: publish_checklist(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.publish_checklist(p_checklist_id uuid) RETURNS TABLE(id uuid, published_at timestamp with time zone)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_row          public.checklists%ROWTYPE;
  v_caller       uuid := auth.uid();
  v_title        text;
  v_blocks       jsonb;
  v_published_at timestamptz := now();
  v_can_publish  boolean := false;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT c.* INTO v_row FROM public.checklists c WHERE c.id = p_checklist_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'checklist_not_found' USING ERRCODE = 'no_data_found';
  END IF;

  IF v_row.user_id = v_caller THEN
    v_can_publish := true;
  ELSIF v_row.workspace_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.workspaces w
       WHERE w.id = v_row.workspace_id AND w.owner_id = v_caller
    ) THEN
    v_can_publish := true;
  END IF;
  IF NOT v_can_publish THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = 'insufficient_privilege';
  END IF;

  v_title  := COALESCE(NULLIF(btrim(v_row.title), ''), 'Sem título');
  v_blocks := COALESCE(v_row.blocks, '[]'::jsonb);
  IF jsonb_typeof(v_blocks) <> 'array' THEN
    v_blocks := '[]'::jsonb;
  END IF;

  UPDATE public.checklists c
     SET is_published      = true,
         published_content = jsonb_build_object(
           'title',        v_title,
           'blocks',       v_blocks,
           'settings',     COALESCE(v_row.settings, '{}'::jsonb),
           'published_at', to_jsonb(v_published_at)
         ),
         updated_at        = now()
   WHERE c.id = p_checklist_id;

  RETURN QUERY SELECT p_checklist_id AS id, v_published_at AS published_at;
END;
$$;


--

-- Name: rematerialize_after_task_change(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.rematerialize_after_task_change() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
BEGIN
  IF (OLD.scheduled_time IS DISTINCT FROM NEW.scheduled_time)
     OR (OLD.is_active IS DISTINCT FROM NEW.is_active) THEN
    PERFORM public.materialize_task_executions();
  END IF;
  RETURN NULL;
END;
$$;


--

-- Name: set_unique_custom_slug(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_unique_custom_slug() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
DECLARE
  new_slug text;
  exists_already boolean;
BEGIN
  -- If custom_slug is not provided, generate a random 6-char one
  IF NEW.custom_slug IS NULL THEN
    LOOP
      new_slug := generate_short_slug(6);
      SELECT EXISTS (SELECT 1 FROM public.checklists WHERE custom_slug = new_slug) INTO exists_already;
      EXIT WHEN NOT exists_already;
    END LOOP;
    NEW.custom_slug := new_slug;
  END IF;
  RETURN NEW;
END;
$$;


--

-- Name: set_unique_short_slug(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_unique_short_slug() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
DECLARE
  new_slug text;
  exists_already boolean;
BEGIN
  IF NEW.short_slug IS NULL THEN
    LOOP
      new_slug := generate_short_slug(6);
      SELECT EXISTS (SELECT 1 FROM public.checklists WHERE short_slug = new_slug) INTO exists_already;
      EXIT WHEN NOT exists_already;
    END LOOP;
    NEW.short_slug := new_slug;
  END IF;
  RETURN NEW;
END;
$$;


--

-- Name: update_checklist_retention(uuid, integer, boolean); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_checklist_retention(p_checklist_id uuid, p_retention_days integer, p_is_enabled boolean) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  -- Update checklist settings
  UPDATE public.checklists
  SET settings = jsonb_set(
    jsonb_set(COALESCE(settings, '{}'::jsonb), '{retentionDays}', to_jsonb(p_retention_days)),
    '{dataRetention}', to_jsonb(p_is_enabled)
  )
  WHERE id = p_checklist_id;

  -- Update responses
  IF p_is_enabled THEN
    UPDATE public.checklist_responses
    SET expires_at = submitted_at + (p_retention_days || ' days')::interval
    WHERE checklist_id = p_checklist_id;
  ELSE
    UPDATE public.checklist_responses
    SET expires_at = NULL
    WHERE checklist_id = p_checklist_id;
  END IF;
END;
$$;


--

-- Name: update_updated_at_column(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_updated_at_column() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


--

-- Name: vision_datasets_prevent_public_id_update(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.vision_datasets_prevent_public_id_update() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $_$
BEGIN
  IF NEW.public_id IS DISTINCT FROM OLD.public_id THEN
    IF OLD.public_id ~* '^pad_[a-z0-9]{6,8}$'
       AND NEW.public_id = upper(substring(OLD.public_id FROM 5)) THEN
      RETURN NEW;
    END IF;

    RAISE EXCEPTION 'public_id é imutável';
  END IF;

  RETURN NEW;
END;
$_$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--


-- Name: submit_public_response(text, jsonb); Type: FUNCTION; Schema: public; Owner: -
--
-- Public (anonymous) response submission for a published checklist.
-- Validates the checklist is published, inserts checklist_responses, and returns
-- a short-lived upload token consumed by the upload-public-evidence edge function.
-- Anonymous role never gets direct INSERT on checklist_responses/evidences.

CREATE OR REPLACE FUNCTION public.submit_public_response(
  p_public_id text,
  p_answers   jsonb
)
 RETURNS TABLE(response_id uuid, checklist_id uuid, upload_token text, upload_token_expires_at timestamptz)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp', 'extensions'
AS $function$
DECLARE
  v_checklist public.checklists%ROWTYPE;
  v_resp_id   uuid := gen_random_uuid();
  v_token     text;
  v_hash      text;
  v_exp       timestamptz := now() + interval '30 minutes';
BEGIN
  IF p_public_id IS NULL OR length(btrim(p_public_id)) = 0 THEN
    RAISE EXCEPTION 'public_id_required' USING ERRCODE = 'invalid_parameter_value';
  END IF;
  IF p_answers IS NULL OR jsonb_typeof(p_answers) <> 'object' THEN
    RAISE EXCEPTION 'answers_must_be_object' USING ERRCODE = 'invalid_parameter_value';
  END IF;

  SELECT c.* INTO v_checklist
    FROM public.checklists c
   WHERE c.is_published = true
     AND (c.custom_slug = p_public_id OR c.short_slug = p_public_id OR c.id::text = p_public_id)
   LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'checklist_not_found_or_unpublished' USING ERRCODE = 'no_data_found';
  END IF;

  INSERT INTO public.checklist_responses(id, checklist_id, answers, status, submitted_at, created_at)
  VALUES (v_resp_id, v_checklist.id, p_answers, 'submitted', now(), now());

  v_token := encode(extensions.gen_random_bytes(32), 'hex');
  v_hash  := encode(extensions.digest(v_token, 'sha256'), 'hex');

  UPDATE public.checklist_responses
     SET upload_token_hash = v_hash,
         upload_token_expires_at = v_exp
   WHERE id = v_resp_id;

  RETURN QUERY SELECT v_resp_id, v_checklist.id, v_token, v_exp;
END;
$function$;

REVOKE ALL ON FUNCTION public.submit_public_response(text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_public_response(text, jsonb) TO anon, authenticated;


--

-- Name: get_public_checklist(text); Type: FUNCTION; Schema: public; Owner: -
--
-- Read-only projection of a published checklist for public share links.
-- Returns ONLY the fields required to render the fill-in page. Never exposes
-- owner_id, workspace_id, user_id or internal identifiers.

CREATE OR REPLACE FUNCTION public.get_public_checklist(p_public_id text)
 RETURNS TABLE(
   id           uuid,
   title        text,
   description  text,
   blocks       jsonb,
   settings     jsonb,
   short_slug   text,
   custom_slug  text,
   published_at timestamptz
 )
 LANGUAGE plpgsql
 SECURITY DEFINER
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_row public.checklists%ROWTYPE;
BEGIN
  IF p_public_id IS NULL OR length(btrim(p_public_id)) = 0 THEN
    RAISE EXCEPTION 'public_id_required' USING ERRCODE = 'invalid_parameter_value';
  END IF;

  SELECT c.* INTO v_row
    FROM public.checklists c
   WHERE c.is_published = true
     AND (c.custom_slug = p_public_id OR c.short_slug = p_public_id OR c.id::text = p_public_id)
   LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'checklist_not_found_or_unpublished' USING ERRCODE = 'no_data_found';
  END IF;

  RETURN QUERY SELECT
    v_row.id,
    COALESCE(NULLIF(btrim((v_row.published_content->>'title')), ''),
             NULLIF(btrim(v_row.title), ''),
             'Sem título')::text,
    v_row.description,
    COALESCE(v_row.published_content->'blocks', v_row.blocks, '[]'::jsonb),
    COALESCE(v_row.published_content->'settings', v_row.settings, '{}'::jsonb),
    v_row.short_slug,
    v_row.custom_slug,
    NULLIF(v_row.published_content->>'published_at','')::timestamptz;
END;
$function$;

REVOKE ALL ON FUNCTION public.get_public_checklist(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_checklist(text) TO anon, authenticated;


--
