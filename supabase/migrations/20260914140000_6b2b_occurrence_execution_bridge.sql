-- Execution 6B.2B — bridge between a materialized 5E occurrence and the
-- authenticated checklist execution.
--
-- Before this migration the two flows were independent:
--
--   checklist_execution_schedules -> checklist_execution_occurrences   (5E.2A/B)
--   /executar/$id -> ExecutionEngine -> finalize_public_response
--                                     -> complete_assignment           (6A / 5E legacy)
--
-- The executor never received an occurrence id, so a submitted response could
-- not be attributed to the concrete obligation it fulfilled.
--
-- This migration adds ONLY the authoritative lifecycle surface for an
-- already-materialized occurrence. It does not change any table, column, FK,
-- index, trigger, RLS policy, grant or cron: the 5E.2A schema already carries
-- the whole contract.
--
--   lifecycle truth (5E.2A, unchanged):
--     started  -> started_at   IS NOT NULL
--     completed-> completed_at IS NOT NULL
--     response -> response_id  (UNIQUE index uq_execution_occurrences_response)
--
--   occurrence -> schedule -> checklist -> workspace
--   schedule.workspace_member_id -> workspace_members.user_id -> auth.uid()
--
-- Authorization is resolved INSIDE the database from auth.uid() and the real
-- rows, never from client-supplied workspace/member/checklist identifiers:
-- passing a checklist id is only a consistency claim that must match the
-- occurrence's own schedule, and it is verified on every call (fail-closed).
--
-- Idempotency is enforced in SQL, not in the caller:
--   * start    -> UPDATE ... WHERE started_at   IS NULL  (refresh is a no-op)
--   * complete -> early return when completed_at IS NOT NULL, UPDATE ... WHERE
--                 completed_at IS NULL (a retry never rewrites the first
--                 completion timestamp nor the bound response)
--   * complete additionally requires the response to be status = 'submitted',
--     which only finalize_public_response can produce. Calling the completion
--     before the submission succeeded therefore fails closed at the database.
--
-- Deliberate decisions:
--   * A schedule deactivated AFTER the occurrence was materialized does not
--     invalidate that occurrence. Deactivation stops future materialization
--     (5E.2C.1); already-materialized occurrences are historical obligations
--     and stay executable. The state is not even read here.
--   * complete does NOT backfill started_at: a completion without an explicit
--     start stays honest (started_at NULL) instead of inventing a timestamp.
--   * No new response-<->occurrence mechanism was needed: response_id already
--     exists with UNIQUE(response_id), so a response binds to at most one
--     occurrence and reconciliation after a network failure is a safe retry.
--
-- This migration defines functions and privileges only. Zero DML at the top
-- level: no backfill, no seed, no data is created or modified by applying it.
-- It does NOT invoke any RPC and does NOT touch the already-applied migrations
-- 20260910120000, 20260911120000, 20260912120000, 20260913120000,
-- 20260914120000 or 20260914130000.

-- ---------------------------------------------------------------------------
-- 1) Internal authorization + context resolver (not part of the public surface)
--    Locks occurrence, schedule and checklist atomically for the rest of the
--    transaction (same TOCTOU discipline as 5E.2C.1) and returns the current
--    lifecycle context. Any mismatch raises P0001 — never a partial answer.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.checklist_occurrence_execution_context(
  p_occurrence_id uuid,
  p_checklist_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $occurrence_context$
DECLARE
  v_user_id uuid;
  v_schedule_id uuid;
  v_occurrence_date date;
  v_due_at timestamptz;
  v_started_at timestamptz;
  v_completed_at timestamptz;
  v_response_id uuid;
  v_schedule_checklist_id uuid;
  v_schedule_member_id uuid;
  v_checklist_workspace_id uuid;
  v_member_id uuid;
  v_member_user_id uuid;
  v_member_status public.member_status;
  v_member_workspace_id uuid;
BEGIN
  v_user_id := auth.uid();

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'occurrence_actor_required' USING ERRCODE = 'P0001';
  END IF;

  IF p_occurrence_id IS NULL OR p_checklist_id IS NULL THEN
    RAISE EXCEPTION 'occurrence_required' USING ERRCODE = 'P0001';
  END IF;

  -- Atomic lookup: the occurrence identity, its schedule binding, the real
  -- checklist workspace and the live lifecycle state, with the three rows
  -- locked until commit.
  SELECT o.schedule_id,
         o.occurrence_date,
         o.due_at,
         o.started_at,
         o.completed_at,
         o.response_id,
         s.checklist_id,
         s.workspace_member_id,
         c.workspace_id
    INTO v_schedule_id,
         v_occurrence_date,
         v_due_at,
         v_started_at,
         v_completed_at,
         v_response_id,
         v_schedule_checklist_id,
         v_schedule_member_id,
         v_checklist_workspace_id
  FROM public.checklist_execution_occurrences o
  JOIN public.checklist_execution_schedules s ON s.id = o.schedule_id
  JOIN public.checklists c ON c.id = s.checklist_id
  WHERE o.id = p_occurrence_id
  FOR UPDATE OF o, s, c;

  IF v_schedule_id IS NULL THEN
    RAISE EXCEPTION 'occurrence_not_found' USING ERRCODE = 'P0001';
  END IF;

  -- The occurrence must belong to the very checklist being executed. A
  -- caller cannot borrow an occurrence from another checklist.
  IF v_schedule_checklist_id IS DISTINCT FROM p_checklist_id THEN
    RAISE EXCEPTION 'occurrence_checklist_mismatch' USING ERRCODE = 'P0001';
  END IF;

  -- Personal checklists carry no workspace and can never own a schedule.
  IF v_checklist_workspace_id IS NULL THEN
    RAISE EXCEPTION 'occurrence_checklist_not_found' USING ERRCODE = 'P0001';
  END IF;

  SELECT wm.id, wm.user_id, wm.status, wm.workspace_id
    INTO v_member_id, v_member_user_id, v_member_status, v_member_workspace_id
  FROM public.workspace_members wm
  WHERE wm.id = v_schedule_member_id;

  -- Fail-closed: only the responsible ACTIVE member of the checklist's real
  -- workspace may touch this occurrence. An inactive (soft-deleted) member or
  -- any other user — including a manager — is rejected, so a cross-tenant or
  -- cross-member occurrence can never be started or completed.
  IF v_member_id IS NULL
     OR v_member_workspace_id IS DISTINCT FROM v_checklist_workspace_id
     OR v_member_user_id IS DISTINCT FROM v_user_id
     OR v_member_status IS DISTINCT FROM 'active'::public.member_status
  THEN
    RAISE EXCEPTION 'occurrence_not_assignee' USING ERRCODE = 'P0001';
  END IF;

  RETURN jsonb_build_object(
    'occurrence_id', p_occurrence_id,
    'checklist_id', v_schedule_checklist_id,
    'schedule_id', v_schedule_id,
    'workspace_id', v_checklist_workspace_id,
    'workspace_member_id', v_member_id,
    'occurrence_date', v_occurrence_date,
    'due_at', v_due_at,
    'started_at', v_started_at,
    'completed_at', v_completed_at,
    'response_id', v_response_id
  );
END;
$occurrence_context$;

-- Internal helper: never callable from the browser.
REVOKE ALL ON FUNCTION
  public.checklist_occurrence_execution_context(uuid, uuid)
FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION
  public.checklist_occurrence_execution_context(uuid, uuid)
TO service_role;

-- ---------------------------------------------------------------------------
-- 2) Open (idempotent start) — marks the occurrence as started
--    A page refresh re-invokes this; the UPDATE only matches a row whose
--    started_at is still NULL, so the original timestamp and updated_at are
--    never rewritten and no duplicate state appears.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.open_checklist_execution_occurrence(
  p_occurrence_id uuid,
  p_checklist_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $open_occurrence$
BEGIN
  -- Authorizes (and locks) before any write. Raises on every mismatch.
  PERFORM public.checklist_occurrence_execution_context(
    p_occurrence_id, p_checklist_id
  );

  UPDATE public.checklist_execution_occurrences
     SET started_at = now()
   WHERE id = p_occurrence_id
     AND started_at IS NULL;

  -- Authoritative answer read back after the (maybe no-op) start.
  RETURN public.checklist_occurrence_execution_context(
    p_occurrence_id, p_checklist_id
  );
END;
$open_occurrence$;

REVOKE ALL ON FUNCTION
  public.open_checklist_execution_occurrence(uuid, uuid)
FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION
  public.open_checklist_execution_occurrence(uuid, uuid)
TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3) Complete — binds the submitted response and completes the occurrence
--    Only reachable after a successful finalize_public_response: the response
--    must exist, belong to the same checklist and already be 'submitted'.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.complete_checklist_execution_occurrence(
  p_occurrence_id uuid,
  p_checklist_id uuid,
  p_response_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $complete_occurrence$
DECLARE
  v_context jsonb;
  v_completed_at timestamptz;
  v_response_checklist_id uuid;
  v_response_status text;
BEGIN
  -- Authorizes (and locks) before anything else. Raises on every mismatch.
  v_context := public.checklist_occurrence_execution_context(
    p_occurrence_id, p_checklist_id
  );

  v_completed_at := (v_context->>'completed_at')::timestamptz;

  -- Idempotent retry: an already-completed occurrence is historical truth.
  -- Return the stored context without touching timestamps or response binding.
  IF v_completed_at IS NOT NULL THEN
    RETURN v_context;
  END IF;

  IF p_response_id IS NULL THEN
    RAISE EXCEPTION 'occurrence_response_required' USING ERRCODE = 'P0001';
  END IF;

  SELECT cr.checklist_id, cr.status
    INTO v_response_checklist_id, v_response_status
  FROM public.checklist_responses cr
  WHERE cr.id = p_response_id;

  IF v_response_checklist_id IS NULL THEN
    RAISE EXCEPTION 'occurrence_response_not_found' USING ERRCODE = 'P0001';
  END IF;

  IF v_response_checklist_id IS DISTINCT FROM p_checklist_id THEN
    RAISE EXCEPTION 'occurrence_response_mismatch' USING ERRCODE = 'P0001';
  END IF;

  -- The submission must have succeeded first (finalize_public_response is the
  -- only writer of status = 'submitted'), so a failed send can never complete
  -- the occurrence.
  IF v_response_status IS DISTINCT FROM 'submitted' THEN
    RAISE EXCEPTION 'occurrence_response_not_submitted' USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.checklist_execution_occurrences
     SET completed_at = now(),
         response_id = p_response_id
   WHERE id = p_occurrence_id
     AND completed_at IS NULL;

  RETURN public.checklist_occurrence_execution_context(
    p_occurrence_id, p_checklist_id
  );
END;
$complete_occurrence$;

REVOKE ALL ON FUNCTION
  public.complete_checklist_execution_occurrence(uuid, uuid, uuid)
FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION
  public.complete_checklist_execution_occurrence(uuid, uuid, uuid)
TO authenticated, service_role;
