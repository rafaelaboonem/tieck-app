-- Execution 5E.2D.1 — SQL foundation for automatic local-date occurrence
-- materialization.
--
-- Three pieces, strictly additive (no table/FK/policy/trigger changes, no
-- cron, no seed, no backfill, no top-level invocation):
--
--   1) public.materialize_checklist_execution_occurrence_for_schedule(
--        p_schedule_id uuid, p_occurrence_date date) RETURNS integer
--      Narrow primitive: exactly ONE schedule × ONE civil date. Locks the
--      schedule and its responsible member (FOR SHARE OF s, wm), re-validates
--      ALL eligibility under that lock (fail-closed → 0), and inserts at most
--      one occurrence row with
--      due_at = ((p_occurrence_date + due_local_time) AT TIME ZONE timezone).
--      Idempotent: ON CONFLICT (schedule_id, occurrence_date) DO NOTHING.
--
--   2) public.materialize_current_checklist_execution_occurrences(
--        p_as_of timestamptz) RETURNS integer
--      Operational function (recovery cron): for every schedule, derives the
--      schedule's OWN local date as (p_as_of AT TIME ZONE s.timezone)::date
--      — never a global UTC "today" — and materializes [local_today - 1,
--      local_today] (yesterday then today; never tomorrow; never a larger
--      backfill). Visits schedules in deterministic s.id order to reduce
--      deadlock risk between concurrent operational runs.
--
--   3) Inline materialization inside create/update schedule RPCs
--      (CREATE OR REPLACE with identical signatures, authorization model,
--      error codes, locks and grants preserved). After the write and before
--      the return, the RPC calls the narrow primitive for (schedule,
--      local_today) where local_today is derived from the schedule's OWN
--      timezone — so a routine created or edited during the day produces
--      today's occurrence immediately, while future starts_on inserts zero.
--      Existing occurrences are NEVER updated or removed (ON CONFLICT
--      DO NOTHING); started/completed occurrences stay untouched.
--
-- deactivate_checklist_execution_schedule is deliberately NOT recreated: it
-- must never materialize anything. Deactivation only flips is_active and
-- preserves history.
--
-- Privileges: both new functions are SECURITY DEFINER with
-- search_path = public, pg_temp, no auth.uid(), EXECUTE granted ONLY to
-- service_role. The create/update RPCs keep EXECUTE for
-- authenticated, service_role. The narrow primitive remains callable from
-- inside the RPC bodies because SECURITY DEFINER execution uses the
-- function owner's privileges. No additional table privileges, no write
-- policies. The UNIQUE (schedule_id, occurrence_date) index from 2026091012
-- 0000 remains the final duplication barrier.

-- ---------------------------------------------------------------------------
-- 1) Narrow primitive: one schedule × one civil date
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.materialize_checklist_execution_occurrence_for_schedule(
  p_schedule_id uuid,
  p_occurrence_date date
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $materialize_one$
DECLARE
  v_id uuid;
  v_frequency text;
  v_weekdays smallint[];
  v_due_local_time time without time zone;
  v_timezone text;
  v_starts_on date;
  v_ends_on date;
  v_is_active boolean;
  v_member_status public.member_status;
  v_inserted integer := 0;
BEGIN
  -- A) parameters are mandatory
  IF p_schedule_id IS NULL THEN
    RAISE EXCEPTION 'occurrence_schedule_required: p_schedule_id is mandatory'
      USING ERRCODE = 'P0001';
  END IF;

  IF p_occurrence_date IS NULL THEN
    RAISE EXCEPTION 'occurrence_date_required: p_occurrence_date is mandatory'
      USING ERRCODE = 'P0001';
  END IF;

  -- B) finite civil date only
  IF p_occurrence_date = 'infinity'::date
     OR p_occurrence_date = '-infinity'::date THEN
    RAISE EXCEPTION 'occurrence_date_invalid: p_occurrence_date must be a finite date'
      USING ERRCODE = 'P0001';
  END IF;

  -- C) canonical locked read: schedule + responsible member locked together
  --    (FOR SHARE OF s, wm). All eligibility decisions below come EXCLUSIVELY
  --    from this locked version — never from an earlier unlocked read. FOR
  --    SHARE conflicts with the RPCs' FOR UPDATE (linearization point) yet is
  --    self-compatible, so concurrent operational runs proceed in parallel
  --    and the UNIQUE (schedule_id, occurrence_date) index decides the rest.
  SELECT
    s.id,
    s.frequency,
    s.weekdays,
    s.due_local_time,
    s.timezone,
    s.starts_on,
    s.ends_on,
    s.is_active,
    wm.status
  INTO
    v_id,
    v_frequency,
    v_weekdays,
    v_due_local_time,
    v_timezone,
    v_starts_on,
    v_ends_on,
    v_is_active,
    v_member_status
  FROM public.checklist_execution_schedules s
  JOIN public.workspace_members wm
    ON wm.id = s.workspace_member_id
  WHERE s.id = p_schedule_id
  FOR SHARE OF s, wm;

  -- D) fail-closed: missing schedule or missing responsible member
  IF v_id IS NULL THEN
    RETURN 0;
  END IF;

  -- E) fail-closed: inactive schedule or inactive member
  IF v_is_active <> true OR v_member_status <> 'active'::public.member_status THEN
    RETURN 0;
  END IF;

  -- F) fail-closed: date outside the schedule's inclusive validity window
  IF p_occurrence_date < v_starts_on THEN
    RETURN 0;
  END IF;

  IF v_ends_on IS NOT NULL AND p_occurrence_date > v_ends_on THEN
    RETURN 0;
  END IF;

  -- G) frequency eligibility on this exact civil date
  IF NOT (
       (v_frequency = 'once' AND p_occurrence_date = v_starts_on)
       OR v_frequency = 'daily'
       OR (v_frequency = 'weekly'
           AND ((p_occurrence_date - v_starts_on) % 7) = 0)
       OR (v_frequency = 'specific_weekdays'
           AND v_weekdays IS NOT NULL
           AND (EXTRACT(ISODOW FROM p_occurrence_date))::smallint = ANY (v_weekdays))
     ) THEN
    RETURN 0;
  END IF;

  -- H) insert at most one historical-truth row; due_at is derived from the
  --    stored civil truth (local date + local time) in the schedule's own
  --    IANA timezone. No timezone is ever fixed in code. ON CONFLICT DO
  --    NOTHING: an existing occurrence keeps its due_at and history; the
  --    return is 1 only when a row was actually inserted, 0 otherwise
  --    (conflict path, or any fail-closed branch above).
  WITH ins AS (
    INSERT INTO public.checklist_execution_occurrences
      (schedule_id, occurrence_date, due_at)
    VALUES
      (p_schedule_id,
       p_occurrence_date,
       ((p_occurrence_date + v_due_local_time) AT TIME ZONE v_timezone))
    ON CONFLICT (schedule_id, occurrence_date) DO NOTHING
    RETURNING 1
  )
  SELECT count(*)::int INTO v_inserted FROM ins;

  RETURN v_inserted;
END;
$materialize_one$;

REVOKE ALL ON FUNCTION
  public.materialize_checklist_execution_occurrence_for_schedule(uuid, date)
FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION
  public.materialize_checklist_execution_occurrence_for_schedule(uuid, date)
TO service_role;

-- ---------------------------------------------------------------------------
-- 2) Operational function: recovery window [yesterday, today] in each
--    schedule's own timezone, for an explicit instant.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.materialize_current_checklist_execution_occurrences(
  p_as_of timestamptz
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $materialize_current$
DECLARE
  v_schedule record;
  v_schedule_timezone text;
  v_local_today date;
  v_inserted integer := 0;
BEGIN
  -- A) the instant is mandatory and finite
  IF p_as_of IS NULL THEN
    RAISE EXCEPTION 'occurrence_as_of_required: p_as_of is mandatory'
      USING ERRCODE = 'P0001';
  END IF;

  IF p_as_of = 'infinity'::timestamptz
     OR p_as_of = '-infinity'::timestamptz THEN
    RAISE EXCEPTION 'occurrence_as_of_invalid: p_as_of must be a finite instant'
      USING ERRCODE = 'P0001';
  END IF;

  -- B) deterministic visit order (s.id) reduces deadlock risk between two
  --    concurrent operational runs. Only active schedules enter the loop —
  --    an initial snapshot optimization only: the narrow function still
  --    re-validates is_active and the member under lock. Only the ID is
  --    read here — the timezone is re-read from the LOCKED row inside the
  --    loop (never from this external snapshot).
  FOR v_schedule IN
    SELECT s.id
    FROM public.checklist_execution_schedules s
    WHERE s.is_active = true
    ORDER BY s.id
  LOOP
    -- C) lock the schedule row FIRST (FOR SHARE) and only then read its
    --    timezone — the local date is always derived from the locked row's
    --    stored timezone, never from an external snapshot or a fixed zone.
    --    The narrow function re-locks (self-compatible FOR SHARE) and
    --    re-validates every eligibility condition fail-closed, so a
    --    schedule deactivated between the loop snapshot and the call
    --    inserts zero.
    --    5E.2D.1.1: a schedule (or its checklist/workspace_member, via ON
    --    DELETE CASCADE) removed between the snapshot above and this lock
    --    makes the SELECT find NO row. Skip ONLY this iteration and keep
    --    processing the remaining schedules — the recovery run must never
    --    fail because of a concurrent deletion, and no occurrence is ever
    --    created for the removed row. No retry, no exposed error.
    v_schedule_timezone := NULL;
    SELECT s.timezone INTO v_schedule_timezone
      FROM public.checklist_execution_schedules s
      WHERE s.id = v_schedule.id
      FOR SHARE OF s;

    IF NOT FOUND THEN
      CONTINUE;
    END IF;

    v_local_today := (p_as_of AT TIME ZONE v_schedule_timezone)::date;

    -- D) yesterday first, then today. Never tomorrow, never a wider window.
    v_inserted := v_inserted
      + public.materialize_checklist_execution_occurrence_for_schedule(
          v_schedule.id, v_local_today - 1)
      + public.materialize_checklist_execution_occurrence_for_schedule(
          v_schedule.id, v_local_today);
  END LOOP;

  RETURN v_inserted;
END;
$materialize_current$;

REVOKE ALL ON FUNCTION
  public.materialize_current_checklist_execution_occurrences(timestamptz)
FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION
  public.materialize_current_checklist_execution_occurrences(timestamptz)
TO service_role;

-- ---------------------------------------------------------------------------
-- 3) create_checklist_execution_schedule — recreated with inline immediate
--    materialization. Signature, authorization model, error codes, checklist
--    FOR UPDATE lock, INSERT fields and return are preserved exactly; the
--    only addition is the post-INSERT call to the narrow primitive for
--    (new schedule, local_today) using the NEW schedule's own timezone.
--    A future starts_on inserts ZERO occurrences (fail-closed window check
--    inside the primitive); an eligible-today routine materializes today's
--    occurrence atomically in the SAME transaction — no browser key, no
--    extra endpoint, no wait for the recovery cron.
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
  v_local_today date;
BEGIN
  v_user_id := auth.uid();

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'schedule_actor_required' USING ERRCODE = 'P0001';
  END IF;

  IF p_checklist_id IS NULL THEN
    RAISE EXCEPTION 'schedule_checklist_required' USING ERRCODE = 'P0001';
  END IF;

  -- Resolve the REAL workspace from the checklist row and lock it until the
  -- end of the transaction, so a concurrent checklist change cannot move the
  -- workspace between this lookup, the authorization and the INSERT.
  -- Missing or personal checklists fail closed.
  SELECT c.workspace_id INTO v_workspace_id
  FROM public.checklists c
  WHERE c.id = p_checklist_id
  FOR UPDATE;

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

  -- 5E.2D.1: inline immediate materialization for TODAY in the NEW
  -- schedule's own timezone. NEVER greatest(p_starts_on, local_today) — a
  -- future starts_on must insert zero, which the primitive's fail-closed
  -- window check guarantees. Existing occurrences are never touched.
  v_local_today := (statement_timestamp() AT TIME ZONE p_timezone)::date;
  PERFORM public.materialize_checklist_execution_occurrence_for_schedule(
    v_new_id, v_local_today);

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
-- 4) update_checklist_execution_schedule — recreated with inline immediate
--    materialization. Signature, atomic FOR UPDATE OF s, c lookup,
--    authorization-before-state, schedule_inactive guard, six editable
--    fields, error codes and return are preserved exactly. After the UPDATE
--    and before RETURN true, the primitive is called for (schedule,
--    local_today) in the NEW p_timezone:
--      * no occurrence today + new config eligible today -> inserted now;
--      * not eligible today -> zero inserted, no failure;
--      * occurrence already exists -> ON CONFLICT DO NOTHING: due_at and
--        history preserved; the new configuration applies to future dates
--        not yet materialized;
--      * started/completed occurrences are never modified or removed.
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
  v_local_today date;
BEGIN
  v_user_id := auth.uid();

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'schedule_actor_required' USING ERRCODE = 'P0001';
  END IF;

  IF p_schedule_id IS NULL THEN
    RAISE EXCEPTION 'schedule_required' USING ERRCODE = 'P0001';
  END IF;

  -- Atomic lookup (5E.2C.1.1): lock the schedule AND its checklist rows and
  -- load checklist, active state and the REAL workspace in a single query,
  -- so no concurrent checklist change can move the workspace between
  -- lookup, authorization and the write (locks held to commit).
  SELECT s.checklist_id, s.is_active, c.workspace_id
    INTO v_checklist_id, v_is_active, v_workspace_id
  FROM public.checklist_execution_schedules s
  JOIN public.checklists c ON c.id = s.checklist_id
  WHERE s.id = p_schedule_id
  FOR UPDATE OF s, c;

  IF v_checklist_id IS NULL THEN
    RAISE EXCEPTION 'schedule_not_found' USING ERRCODE = 'P0001';
  END IF;

  IF v_workspace_id IS NULL THEN
    RAISE EXCEPTION 'schedule_checklist_not_found' USING ERRCODE = 'P0001';
  END IF;

  -- Authorization comes BEFORE any state check, so an unauthorized caller
  -- never learns whether a schedule is active or inactive.
  IF NOT public.has_role_in_workspace(
    v_user_id, v_workspace_id, 'editor'::public.app_role
  ) THEN
    RAISE EXCEPTION 'schedule_management_denied' USING ERRCODE = 'P0001';
  END IF;

  -- Editing is only meaningful for active routines; a deactivated routine is
  -- historical and must be replaced by a new schedule instead.
  IF v_is_active = false THEN
    RAISE EXCEPTION 'schedule_inactive' USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.checklist_execution_schedules
  SET frequency = p_frequency,
      weekdays = p_weekdays,
      due_local_time = p_due_local_time,
      timezone = p_timezone,
      starts_on = p_starts_on,
      ends_on = p_ends_on
  WHERE id = p_schedule_id;

  -- 5E.2D.1: inline immediate materialization for TODAY in the NEW
  -- p_timezone. Today's occurrence materializes only if it does not already
  -- exist (ON CONFLICT DO NOTHING preserves the existing due_at and history);
  -- a configuration no longer eligible today inserts zero and never removes
  -- the existing occurrence. The row is already FOR UPDATE-locked by this
  -- transaction, so the primitive's FOR SHARE is self-compatible.
  v_local_today := (statement_timestamp() AT TIME ZONE p_timezone)::date;
  PERFORM public.materialize_checklist_execution_occurrence_for_schedule(
    p_schedule_id, v_local_today);

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
-- 5) deactivate_checklist_execution_schedule is deliberately NOT recreated:
--    it must never materialize anything. Deactivation only flips is_active
--    to false, preserves every existing occurrence (today's, started,
--    completed and any future one) and stops further materialization
--    because is_active = true is a fail-closed condition of the primitive.
-- ---------------------------------------------------------------------------

-- No top-level statements beyond function definitions and privilege
-- assertions: applying this migration executes ZERO inserts, ZERO updates,
-- ZERO deletes and invokes NO materializer.
