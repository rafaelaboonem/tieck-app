-- Execution 6B.2C — read surface: the authenticated member's own open
-- scheduled occurrences.
--
-- Until now a materialized 5E occurrence had no path from `/inicio` to the
-- occurrence-aware executor: the Home derived its operational view only from
-- `checklist_assignments`, and its priorities navigated to /executar/$id
-- WITHOUT an occurrenceId (6B.2B made the occurrence reachable only by whoever
-- already had the id).
--
-- This migration adds ONE read-only RPC that resolves, inside the database, the
-- occurrences owned by the caller:
--
--   auth.uid()
--     -> workspace_members (same workspace, status = 'active')
--     -> checklist_execution_schedules.workspace_member_id
--     -> checklist_execution_occurrences
--     -> checklists (same workspace)
--
-- The requested p_workspace_id is NEVER trusted as an authorization claim: an
-- ACTIVE membership of the caller in that workspace is required, and the query
-- additionally pins the schedule to that very membership and the checklist to
-- that very workspace. An occurrence of another member, another workspace or a
-- soft-deleted (inactive) member can never be returned.
--
-- Why an RPC instead of direct SELECT: `checklist_execution_occurrences` and
-- `checklist_execution_schedules` are read-only for authenticated through RLS
-- policies that allow executors and managers to see whole rows, and the browser
-- must not gain a broader surface. The RPC returns a minimal, action-shaped
-- projection and leaks nothing else (no other member, no other workspace, no
-- schedule configuration, no response payload).
--
-- Scope of the result (deliberate):
--   * completed_at IS NULL — a fulfilled obligation is not actionable. The
--     Home must stop showing it as pending/overdue, so completion is filtered
--     at the source instead of being re-derived by every consumer.
--   * occurrence_date <= (now() in the schedule's own timezone)::date + 1 —
--     bounded look-ahead of one day, so already-materialized future work is not
--     hidden while an unbounded future scan is avoided. The civil date is
--     computed in the SCHEDULE's timezone, never in the session timezone.
--   * NO lower bound: an overdue open occurrence stays visible however old its
--     occurrence_date is. Hiding it for being "before today" is exactly the
--     failure this surface must not have, and 5E only materializes within
--     explicit ranges (the daily cron materializes yesterday + today).
--   * is_active is NOT filtered: deactivating a routine stops future
--     materialization (5E.2C.1) and does not invalidate an obligation that
--     already exists. This matches the 6B.2B executor, which accepts an
--     already-materialized occurrence regardless of is_active — Home and
--     executor must agree, otherwise the Home would hide something the
--     executor would happily accept.
--
-- Ordering is the canonical operational order: `due_at` ascending puts the
-- oldest overdue first and the soonest upcoming first, because for an open
-- occurrence `due_at < now()` means overdue.
--
-- No table, column, FK, index, trigger, policy or cron is touched: this
-- migration defines one function and its privileges, with zero DML at the top
-- level (nothing is read or written by applying it). It does NOT modify any
-- already-applied migration.

CREATE OR REPLACE FUNCTION public.list_my_checklist_execution_occurrences(
  p_workspace_id uuid
)
RETURNS TABLE (
  occurrence_id uuid,
  schedule_id uuid,
  checklist_id uuid,
  checklist_title text,
  workspace_member_id uuid,
  occurrence_date date,
  due_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  response_id uuid,
  unit_id uuid,
  shift_id uuid
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $my_occurrences$
DECLARE
  v_user_id uuid;
  v_member_id uuid;
BEGIN
  v_user_id := auth.uid();

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'occurrence_actor_required' USING ERRCODE = 'P0001';
  END IF;

  IF p_workspace_id IS NULL THEN
    RAISE EXCEPTION 'occurrence_workspace_required' USING ERRCODE = 'P0001';
  END IF;

  -- The caller's OWN active membership in the requested workspace. An inactive
  -- (soft-deleted) member, a member of another workspace or a non-member fails
  -- closed and receives nothing.
  SELECT wm.id
    INTO v_member_id
  FROM public.workspace_members wm
  WHERE wm.workspace_id = p_workspace_id
    AND wm.user_id = v_user_id
    AND wm.status = 'active'::public.member_status;

  IF v_member_id IS NULL THEN
    RAISE EXCEPTION 'occurrence_not_member' USING ERRCODE = 'P0001';
  END IF;

  RETURN QUERY
  SELECT
    o.id,
    o.schedule_id,
    c.id,
    c.title,
    s.workspace_member_id,
    o.occurrence_date,
    o.due_at,
    o.started_at,
    o.completed_at,
    o.response_id,
    c.unit_id,
    c.shift_id
  FROM public.checklist_execution_occurrences o
  JOIN public.checklist_execution_schedules s ON s.id = o.schedule_id
  JOIN public.checklists c ON c.id = s.checklist_id
  WHERE s.workspace_member_id = v_member_id
    AND c.workspace_id = p_workspace_id
    AND o.completed_at IS NULL
    AND o.occurrence_date <= (((now() AT TIME ZONE s.timezone)::date) + 1)
  ORDER BY o.due_at ASC, o.id ASC;
END;
$my_occurrences$;

-- Privilege surface: the browser may only call it as an authenticated user.
-- `anon` gets nothing, and no table privilege is granted here.
REVOKE ALL ON FUNCTION
  public.list_my_checklist_execution_occurrences(uuid)
FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION
  public.list_my_checklist_execution_occurrences(uuid)
TO authenticated, service_role;
