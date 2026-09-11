-- Execution 5E.2A.6 — restrict integrity trigger function privileges
--
-- Post-apply SQL audit (5E.2A.5 follow-up) found that the SECURITY DEFINER
-- function public.checklist_execution_schedule_integrity() kept the default
-- PUBLIC EXECUTE grant, making it invocable by anon and authenticated roles.
--
-- The function is an internal BEFORE INSERT/UPDATE trigger body and must only
-- be reachable through the trigger itself, never by direct client calls.
--
-- This migration is purely additive privilege hardening:
--   * it does NOT recreate or alter the function body;
--   * it does NOT touch tables, columns, constraints, indexes, triggers,
--     RLS or policies;
--   * it does NOT backfill, seed or schedule anything.
--
-- The previously applied migration 20260910120000 is immutable and is not
-- modified here.

-- Remove every direct invocation path for non-service roles.
REVOKE ALL ON FUNCTION
  public.checklist_execution_schedule_integrity()
FROM PUBLIC, anon, authenticated;

-- Explicitly re-grant to the backend/service surface only.
GRANT EXECUTE ON FUNCTION
  public.checklist_execution_schedule_integrity()
TO service_role;
