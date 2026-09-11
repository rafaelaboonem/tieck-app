-- Execution 5E.2C.1 — secure schedule management RPCs
--
-- Official write surface for public.checklist_execution_schedules:
--   * create_checklist_execution_schedule(...)   -> uuid
--   * update_checklist_execution_schedule(...)   -> boolean
--   * deactivate_checklist_execution_schedule(..) -> boolean
--
-- Authorization model (all three RPCs):
--   * actor comes EXCLUSIVELY from auth.uid() — no actor/workspace parameters;
--   * workspace is resolved from the real checklist row in the database;
--   * management requires public.has_role_in_workspace(auth.uid(),
--     checklist.workspace_id, 'editor') — real workspace owner bypass,
--     admin and active editors; Viewer and inactive members fail closed;
--   * personal checklists (workspace_id NULL) can never own a schedule.
--
-- Historical truth: occurrences are never written, updated or deleted here.
-- Configuration edits only affect occurrences not yet materialized. Changing
-- the responsible member is NOT part of this surface — to swap an executor,
-- deactivate the old schedule and create a new one (future flow).
--
-- Integrity trigger (CREATE OR REPLACE — all previous validations preserved):
-- the single new exception is a pure deactivation (UPDATE whose ONLY effect
-- is is_active true->false, every business field unchanged, checklist and
-- member still existing in the same workspace). It works even when the
-- responsible member was later soft-deleted to 'inactive'. INSERT, member
-- reassignment, reactivation and any business-field change still require an
-- ACTIVE member, the same workspace and a valid timezone.
--
-- No tables, FKs, triggers, policies, cron or backfill are touched here, and
-- this migration does NOT invoke any RPC (zero remote effect on its own).

-- ---------------------------------------------------------------------------
-- 1) Integrity function: preserved validations + pure-deactivation exception
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.checklist_execution_schedule_integrity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $integrity$
DECLARE
    v_workspace_id uuid;
    v_member_status public.member_status;
    v_pure_deactivation boolean := false;
BEGIN
    IF TG_OP <> 'INSERT' AND TG_OP <> 'UPDATE' THEN
        RETURN NEW;
    END IF;

    -- A + B) checklist exists and is workspace-bound (personal checklists
    -- have workspace_id NULL and can never own a schedule)
    SELECT c.workspace_id INTO v_workspace_id
    FROM public.checklists c
    WHERE c.id = NEW.checklist_id;

    IF v_workspace_id IS NULL THEN
        RAISE EXCEPTION 'schedule_checklist_not_found' USING ERRCODE = 'P0001';
    END IF;

    IF NEW.workspace_member_id IS NULL THEN
        RAISE EXCEPTION 'schedule_member_required' USING ERRCODE = 'P0001';
    END IF;

    -- 5E.2C.1) pure-deactivation exception: an UPDATE whose ONLY effect is
    -- is_active -> false (a repeated no-op deactivation also matches), with
    -- EVERY business field unchanged, may proceed even when the responsible
    -- member has since been soft-deleted to 'inactive'. The checklist and the
    -- member must still exist and belong to the same workspace. Reactivation
    -- (is_active false -> true) and ANY business-field change never match.
    IF TG_OP = 'UPDATE'
       AND NEW.is_active = false
       AND OLD.checklist_id IS NOT DISTINCT FROM NEW.checklist_id
       AND OLD.workspace_member_id IS NOT DISTINCT FROM NEW.workspace_member_id
       AND OLD.frequency IS NOT DISTINCT FROM NEW.frequency
       AND OLD.weekdays IS NOT DISTINCT FROM NEW.weekdays
       AND OLD.due_local_time IS NOT DISTINCT FROM NEW.due_local_time
       AND OLD.timezone IS NOT DISTINCT FROM NEW.timezone
       AND OLD.starts_on IS NOT DISTINCT FROM NEW.starts_on
       AND OLD.ends_on IS NOT DISTINCT FROM NEW.ends_on THEN
        v_pure_deactivation := true;
    END IF;

    -- C + D + 5E.2A.1) member must exist and belong to the SAME workspace.
    -- Active membership is required for EVERY path except the pure
    -- deactivation exception above (so a manager can still wind down a
    -- routine whose executor left the team).
    SELECT wm.status INTO v_member_status
    FROM public.workspace_members wm
    WHERE wm.id = NEW.workspace_member_id
      AND wm.workspace_id = v_workspace_id;

    IF v_member_status IS NULL THEN
        RAISE EXCEPTION 'schedule_workspace_mismatch' USING ERRCODE = 'P0001';
    END IF;

    IF v_member_status <> 'active'::public.member_status
       AND NOT v_pure_deactivation THEN
        RAISE EXCEPTION 'schedule_member_inactive' USING ERRCODE = 'P0001';
    END IF;

    -- E) timezone must be recognized (IANA database via PostgreSQL)
    IF NEW.timezone IS NULL OR btrim(NEW.timezone) = '' THEN
        RAISE EXCEPTION 'schedule_timezone_required' USING ERRCODE = 'P0001';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_timezone_names WHERE name = NEW.timezone
    ) THEN
        RAISE EXCEPTION 'schedule_timezone_invalid' USING ERRCODE = 'P0001';
    END IF;

    RETURN NEW;
END;
$integrity$;

-- Re-assert the hardened privilege surface of the integrity trigger function.
REVOKE ALL ON FUNCTION
  public.checklist_execution_schedule_integrity()
FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION
  public.checklist_execution_schedule_integrity()
TO service_role;

-- ---------------------------------------------------------------------------
-- 2) RPC — create a schedule
--    Returns the new schedule id. The INSERT reuses the table CHECK
--    constraints and the integrity trigger as final authorities for member,
--    workspace, frequency, weekdays, dates and timezone.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_checklist_execution_schedule(
  p_checklist_id uuid,
  p_workspace_member_id uuid,
  p_frequency text,
  p_weekdays smallint[],
  p_due_local_time time without time zone,
  p_timezone text,
  p_starts_on date,
  p_ends_on date
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $create_schedule$
DECLARE
  v_user_id uuid;
  v_workspace_id uuid;
  v_new_id uuid;
BEGIN
  v_user_id := auth.uid();

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'schedule_actor_required' USING ERRCODE = 'P0001';
  END IF;

  IF p_checklist_id IS NULL THEN
    RAISE EXCEPTION 'schedule_checklist_required' USING ERRCODE = 'P0001';
  END IF;

  -- Resolve the REAL workspace from the checklist row; never trust a
  -- client-supplied workspace. Missing or personal checklists fail closed.
  SELECT c.workspace_id INTO v_workspace_id
  FROM public.checklists c
  WHERE c.id = p_checklist_id;

  IF v_workspace_id IS NULL THEN
    RAISE EXCEPTION 'schedule_checklist_not_found' USING ERRCODE = 'P0001';
  END IF;

  -- Real workspace owner (bypass), admin and active editors only.
  IF NOT public.has_role_in_workspace(
    v_user_id, v_workspace_id, 'editor'::public.app_role
  ) THEN
    RAISE EXCEPTION 'schedule_management_denied' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.checklist_execution_schedules
    (checklist_id, workspace_member_id, frequency, weekdays,
     due_local_time, timezone, starts_on, ends_on, is_active, created_by)
  VALUES
    (p_checklist_id, p_workspace_member_id, p_frequency, p_weekdays,
     p_due_local_time, p_timezone, p_starts_on, p_ends_on, true, v_user_id)
  RETURNING id INTO v_new_id;

  RETURN v_new_id;
END;
$create_schedule$;

REVOKE ALL ON FUNCTION
  public.create_checklist_execution_schedule(uuid, uuid, text, smallint[], time without time zone, text, date, date)
FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION
  public.create_checklist_execution_schedule(uuid, uuid, text, smallint[], time without time zone, text, date, date)
TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3) RPC — edit the configuration of an ACTIVE schedule
--    Only frequency/weekdays/time/timezone/starts_on/ends_on are editable.
--    checklist_id, workspace_member_id, created_by and is_active are NOT
--    part of this surface: changing the executor would retroactively change
--    who sees historical occurrences.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.update_checklist_execution_schedule(
  p_schedule_id uuid,
  p_frequency text,
  p_weekdays smallint[],
  p_due_local_time time without time zone,
  p_timezone text,
  p_starts_on date,
  p_ends_on date
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $update_schedule$
DECLARE
  v_user_id uuid;
  v_workspace_id uuid;
  v_checklist_id uuid;
  v_is_active boolean;
BEGIN
  v_user_id := auth.uid();

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'schedule_actor_required' USING ERRCODE = 'P0001';
  END IF;

  IF p_schedule_id IS NULL THEN
    RAISE EXCEPTION 'schedule_required' USING ERRCODE = 'P0001';
  END IF;

  -- Lock the real schedule row; derive everything from the database.
  SELECT s.checklist_id, s.is_active
    INTO v_checklist_id, v_is_active
  FROM public.checklist_execution_schedules s
  WHERE s.id = p_schedule_id
  FOR UPDATE;

  IF v_checklist_id IS NULL THEN
    RAISE EXCEPTION 'schedule_not_found' USING ERRCODE = 'P0001';
  END IF;

  -- Editing is only meaningful for active routines; a deactivated routine is
  -- historical and must be replaced by a new schedule instead.
  IF v_is_active = false THEN
    RAISE EXCEPTION 'schedule_inactive' USING ERRCODE = 'P0001';
  END IF;

  -- Workspace derived through schedule -> checklist (never client-supplied).
  SELECT c.workspace_id INTO v_workspace_id
  FROM public.checklists c
  WHERE c.id = v_checklist_id;

  IF v_workspace_id IS NULL THEN
    RAISE EXCEPTION 'schedule_checklist_not_found' USING ERRCODE = 'P0001';
  END IF;

  IF NOT public.has_role_in_workspace(
    v_user_id, v_workspace_id, 'editor'::public.app_role
  ) THEN
    RAISE EXCEPTION 'schedule_management_denied' USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.checklist_execution_schedules
  SET frequency = p_frequency,
      weekdays = p_weekdays,
      due_local_time = p_due_local_time,
      timezone = p_timezone,
      starts_on = p_starts_on,
      ends_on = p_ends_on
  WHERE id = p_schedule_id;

  RETURN true;
END;
$update_schedule$;

REVOKE ALL ON FUNCTION
  public.update_checklist_execution_schedule(uuid, text, smallint[], time without time zone, text, date, date)
FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION
  public.update_checklist_execution_schedule(uuid, text, smallint[], time without time zone, text, date, date)
TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 4) RPC — deactivate a schedule (idempotent, never deletes)
--    Works even when the responsible member later became 'inactive'.
--    An already-inactive schedule is historical truth: return true WITHOUT
--    executing another UPDATE. No reactivation is offered in this phase.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.deactivate_checklist_execution_schedule(
  p_schedule_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $deactivate_schedule$
DECLARE
  v_user_id uuid;
  v_workspace_id uuid;
  v_checklist_id uuid;
  v_is_active boolean;
BEGIN
  v_user_id := auth.uid();

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'schedule_actor_required' USING ERRCODE = 'P0001';
  END IF;

  IF p_schedule_id IS NULL THEN
    RAISE EXCEPTION 'schedule_required' USING ERRCODE = 'P0001';
  END IF;

  SELECT s.checklist_id, s.is_active
    INTO v_checklist_id, v_is_active
  FROM public.checklist_execution_schedules s
  WHERE s.id = p_schedule_id
  FOR UPDATE;

  IF v_checklist_id IS NULL THEN
    RAISE EXCEPTION 'schedule_not_found' USING ERRCODE = 'P0001';
  END IF;

  SELECT c.workspace_id INTO v_workspace_id
  FROM public.checklists c
  WHERE c.id = v_checklist_id;

  IF v_workspace_id IS NULL THEN
    RAISE EXCEPTION 'schedule_checklist_not_found' USING ERRCODE = 'P0001';
  END IF;

  IF NOT public.has_role_in_workspace(
    v_user_id, v_workspace_id, 'editor'::public.app_role
  ) THEN
    RAISE EXCEPTION 'schedule_management_denied' USING ERRCODE = 'P0001';
  END IF;

  -- Idempotent: nothing to change for an already-inactive routine.
  IF v_is_active = false THEN
    RETURN true;
  END IF;

  -- Only is_active flips; the pure-deactivation trigger exception allows
  -- this even when the responsible member is no longer active.
  UPDATE public.checklist_execution_schedules
  SET is_active = false
  WHERE id = p_schedule_id;

  RETURN true;
END;
$deactivate_schedule$;

REVOKE ALL ON FUNCTION
  public.deactivate_checklist_execution_schedule(uuid)
FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION
  public.deactivate_checklist_execution_schedule(uuid)
TO authenticated, service_role;
