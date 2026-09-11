-- Execution 5E.2B — deterministic, idempotent occurrence materializer
--
-- Materializes concrete occurrences from active execution schedules within an
-- explicit inclusive date range:
--
--   schedule + [p_from_date, p_through_date]
--     -> eligible dates per frequency
--     -> local time + stored timezone -> due_at (timestamptz)
--     -> idempotent INSERT into checklist_execution_occurrences
--
-- Operational function: it uses no auth.uid() and performs no access checks
-- beyond schedule/member state; execution is restricted to service_role via
-- the REVOKE/GRANT block below. No automatic invocation happens in this
-- migration — the function is only defined here (zero backfill, zero cron).
--
-- Idempotency: ON CONFLICT (schedule_id, occurrence_date) DO NOTHING, backed
-- by the UNIQUE index created in migration 20260910120000. Existing
-- occurrences are historical truth: never updated, never deleted.
--
-- This migration does NOT modify the already-applied migrations
-- 20260910120000 or 20260911120000.

CREATE OR REPLACE FUNCTION public.materialize_checklist_execution_occurrences(
  p_from_date date,
  p_through_date date
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $materializer$
DECLARE
  v_inserted integer := 0;
BEGIN
  -- A) range is mandatory
  IF p_from_date IS NULL OR p_through_date IS NULL THEN
    RAISE EXCEPTION 'occurrence_range_required: p_from_date and p_through_date are mandatory'
      USING ERRCODE = 'P0001';
  END IF;

  -- B) finite dates and ordered range
  IF p_from_date = 'infinity'::date
     OR p_from_date = '-infinity'::date
     OR p_through_date = 'infinity'::date
     OR p_through_date = '-infinity'::date
     OR p_through_date < p_from_date THEN
    RAISE EXCEPTION 'occurrence_range_invalid: dates must be finite and p_through_date >= p_from_date'
      USING ERRCODE = 'P0001';
  END IF;

  -- C) inclusive window of at most 366 days (p_through_date - p_from_date <= 365)
  IF (p_through_date - p_from_date) > 365 THEN
    RAISE EXCEPTION 'occurrence_range_too_large: inclusive range must not exceed 366 days'
      USING ERRCODE = 'P0001';
  END IF;

  -- Candidate generation: per-schedule windows are computed as native dates
  -- (date - date -> integer day count; date + integer -> date), so no
  -- date<->integer casts and no session-timezone-dependent timestamptz
  -- series are ever used. When the schedule window does not intersect the
  -- requested range, window_end - window_start is negative and
  -- generate_series(0, negative) yields zero candidates without error.
  WITH bounded_schedules AS (
    SELECT
      s.*,
      greatest(p_from_date, s.starts_on) AS window_start,
      least(p_through_date, COALESCE(s.ends_on, p_through_date)) AS window_end
    FROM public.checklist_execution_schedules s
    JOIN public.workspace_members wm
      ON wm.id = s.workspace_member_id
     AND wm.status = 'active'
    WHERE s.is_active = true
  ),
  candidates AS (
    SELECT
      b.id AS schedule_id,
      (b.window_start + gs.day_offset) AS occurrence_date,
      (((b.window_start + gs.day_offset) + b.due_local_time) AT TIME ZONE b.timezone) AS due_at
    FROM bounded_schedules b
    CROSS JOIN LATERAL generate_series(
      0,
      b.window_end - b.window_start
    ) AS gs(day_offset)
    WHERE (
        (b.frequency = 'once' AND (b.window_start + gs.day_offset) = b.starts_on)
        OR b.frequency = 'daily'
        OR (b.frequency = 'weekly' AND ((b.window_start + gs.day_offset) - b.starts_on) % 7 = 0)
        OR (b.frequency = 'specific_weekdays'
            AND (EXTRACT(ISODOW FROM (b.window_start + gs.day_offset)))::smallint = ANY (b.weekdays))
      )
  ),
  ins AS (
    INSERT INTO public.checklist_execution_occurrences
      (schedule_id, occurrence_date, due_at)
    SELECT
      c.schedule_id,
      c.occurrence_date,
      c.due_at
    FROM candidates c
    ON CONFLICT (schedule_id, occurrence_date) DO NOTHING
    RETURNING 1
  )
  SELECT COUNT(*)::int INTO v_inserted FROM ins;

  RETURN v_inserted;
END;
$materializer$;

-- Operational privilege surface: service_role only. No EXECUTE for PUBLIC,
-- anon or authenticated; no additional table privileges; no write policies.
REVOKE ALL ON FUNCTION
  public.materialize_checklist_execution_occurrences(date, date)
FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION
  public.materialize_checklist_execution_occurrences(date, date)
TO service_role;
