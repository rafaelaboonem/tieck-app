-- =============================================================
-- Execution 5E.2A — Recurring execution schedules + occurrences
--
-- Data foundation for reusable/recurring checklists:
--   CHECKLIST  → reusable model (public.checklists, untouched)
--   SCHEDULE   → who executes + frequency + local time
--                (public.checklist_execution_schedules)
--   OCCURRENCE → one concrete obligation on one date
--                (public.checklist_execution_occurrences)
--
-- Completing 10/09 does NOT complete 11/09: each occurrence row
-- carries its own started_at/completed_at.
--
-- STRICTLY ADDITIVE:
--   - no backfill, no data migration, no deletes
--   - does NOT touch the legacy assignment flow
--     (update_checklist_assignments / set_assignment_deadline /
--     complete_assignment RPCs remain the certified writers)
--   - no cron here (occurrence generation arrives in 5E.2B)
--   - migration is NOT applied to the remote project in this phase
--
-- Frequency semantics (official for this version):
--   once              → single occurrence on starts_on
--   daily             → one occurrence per calendar day in
--                       [starts_on, ends_on] (inclusive)
--   weekly            → one occurrence every 7 days anchored on starts_on
--   specific_weekdays → occurrences on ISO weekdays in `weekdays`
--                       (1=Mon … 7=Sun); starts_on/ends_on inclusive
--   ends_on NULL      → open-ended recurrence
--
-- The truth for occurrence state lives in the timestamps:
--   completed → completed_at IS NOT NULL
--   overdue   → completed_at IS NULL AND now() > due_at
--   pending   → completed_at IS NULL AND now() <= due_at
-- No persisted status column by design.
-- =============================================================

-- -------------------------------------------------------------
-- 1) checklist_execution_schedules
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.checklist_execution_schedules (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    checklist_id uuid NOT NULL REFERENCES public.checklists(id) ON DELETE CASCADE,
    workspace_member_id uuid NOT NULL REFERENCES public.workspace_members(id) ON DELETE CASCADE,
    frequency text NOT NULL,
    weekdays smallint[] NULL,
    due_local_time time without time zone NOT NULL,
    timezone text NOT NULL,
    starts_on date NOT NULL,
    ends_on date NULL,
    is_active boolean NOT NULL DEFAULT true,
    created_by uuid NULL DEFAULT auth.uid(),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),

    -- frequency allow-list (text + CHECK, not enum, to ease evolution)
    CONSTRAINT checklist_execution_schedules_frequency_allowed CHECK (
        frequency IN ('once', 'daily', 'weekly', 'specific_weekdays')
    ),
    -- ends_on is NULL (open recurrence) or >= starts_on (inclusive)
    CONSTRAINT checklist_execution_schedules_ends_on_valid CHECK (
        ends_on IS NULL OR ends_on >= starts_on
    ),
    -- shape of weekdays per frequency:
    --   specific_weekdays → required, 1..7 entries, ISO values 1..7 only
    --   other frequencies → must be NULL
    CONSTRAINT checklist_execution_schedules_weekdays_shape CHECK (
        (
            frequency = 'specific_weekdays'
            AND weekdays IS NOT NULL
            AND cardinality(weekdays) BETWEEN 1 AND 7
            AND weekdays <@ ARRAY[1, 2, 3, 4, 5, 6, 7]::smallint[]
        )
        OR (
            frequency IN ('once', 'daily', 'weekly')
            AND weekdays IS NULL
        )
    ),
    -- 'once' means exactly one occurrence on starts_on
    CONSTRAINT checklist_execution_schedules_once_has_no_end CHECK (
        frequency <> 'once' OR ends_on IS NULL
    )
);

COMMENT ON TABLE public.checklist_execution_schedules IS
'5E.2A: recurring execution agenda per checklist member. One schedule yields at most ONE occurrence per day; two runs on the same day require two schedules. Stop a routine with is_active = false (never delete).';

-- -------------------------------------------------------------
-- 2) checklist_execution_occurrences
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.checklist_execution_occurrences (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    schedule_id uuid NOT NULL REFERENCES public.checklist_execution_schedules(id) ON DELETE CASCADE,
    occurrence_date date NOT NULL,
    due_at timestamptz NOT NULL,
    started_at timestamptz NULL,
    completed_at timestamptz NULL,
    response_id uuid NULL REFERENCES public.checklist_responses(id) ON DELETE SET NULL,
    overdue_notified_at timestamptz NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.checklist_execution_occurrences IS
'5E.2A: one concrete execution obligation per (schedule, date). Identity = UNIQUE(schedule_id, occurrence_date). A non-null response_id binds a submitted response to exactly one occurrence.';

-- -------------------------------------------------------------
-- 3) Idempotency / identity indexes
--    UNIQUE(schedule_id, occurrence_date) is the daily duplication
--    barrier. UNIQUE(response_id) guarantees a response maps to at
--    most one occurrence (multiple NULLs allowed by PostgreSQL).
--    The composite unique index also serves as the schedule_id index.
-- -------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS uq_execution_occurrences_schedule_date
    ON public.checklist_execution_occurrences (schedule_id, occurrence_date);

CREATE UNIQUE INDEX IF NOT EXISTS uq_execution_occurrences_response
    ON public.checklist_execution_occurrences (response_id);

-- -------------------------------------------------------------
-- 4) Lookup indexes
-- -------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_execution_schedules_checklist_member
    ON public.checklist_execution_schedules (checklist_id, workspace_member_id);

CREATE INDEX IF NOT EXISTS idx_execution_schedules_member_active
    ON public.checklist_execution_schedules (workspace_member_id, is_active);

-- Open (not yet completed) occurrences by due date — the index the
-- future generator/overdue scans will use.
CREATE INDEX IF NOT EXISTS idx_execution_occurrences_due_at_open
    ON public.checklist_execution_occurrences (due_at)
    WHERE completed_at IS NULL;

-- -------------------------------------------------------------
-- 5) Workspace integrity trigger (server-side, fail-closed)
--    A) checklist must exist
--    B) checklist must belong to a workspace (personal checklists
--       can never carry a recurrence schedule)
--    C) workspace_member_id must exist
--    D) member workspace must equal checklist workspace
--       (never trust the visually selected workspace)
--    E) timezone must be a PostgreSQL/IANA-recognized zone
-- -------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.checklist_execution_schedule_integrity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_workspace_id uuid;
BEGIN
    IF TG_OP <> 'INSERT' AND TG_OP <> 'UPDATE' THEN
        RETURN NEW;
    END IF;

    -- A + B) checklist exists and is workspace-bound
    SELECT c.workspace_id INTO v_workspace_id
    FROM public.checklists c
    WHERE c.id = NEW.checklist_id;

    IF v_workspace_id IS NULL THEN
        RAISE EXCEPTION 'schedule_checklist_not_found' USING ERRCODE = 'P0001';
    END IF;

    IF NEW.workspace_member_id IS NULL THEN
        RAISE EXCEPTION 'schedule_member_required' USING ERRCODE = 'P0001';
    END IF;

    -- C + D) member exists and belongs to the SAME workspace
    IF NOT EXISTS (
        SELECT 1
        FROM public.workspace_members wm
        WHERE wm.id = NEW.workspace_member_id
          AND wm.workspace_id = v_workspace_id
    ) THEN
        RAISE EXCEPTION 'schedule_workspace_mismatch' USING ERRCODE = 'P0001';
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
$$;

CREATE OR REPLACE TRIGGER checklist_execution_schedules_integrity
BEFORE INSERT OR UPDATE ON public.checklist_execution_schedules
FOR EACH ROW EXECUTE FUNCTION public.checklist_execution_schedule_integrity();

-- -------------------------------------------------------------
-- 6) updated_at — reuse the canonical project trigger
-- -------------------------------------------------------------
CREATE OR REPLACE TRIGGER checklist_execution_schedules_set_updated_at
BEFORE UPDATE ON public.checklist_execution_schedules
FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE OR REPLACE TRIGGER checklist_execution_occurrences_set_updated_at
BEFORE UPDATE ON public.checklist_execution_occurrences
FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- -------------------------------------------------------------
-- 7) RLS — read-only for authenticated in this phase
--    Writes arrive later through SECURITY DEFINER RPCs (5E.2B/2C),
--    so no INSERT/UPDATE/DELETE policies are created here.
--
--    SELECT policy grants:
--      A) the assigned member (workspace_members.user_id = auth.uid())
--      B) managers of the checklist (owner or admin/editor role in
--         the checklist's real workspace, mirroring the can_manage
--         semantics of get_checklist_access without calling it —
--         that RPC is service_role-only by hardening)
--    Anon: no policy → zero access.
-- -------------------------------------------------------------
ALTER TABLE public.checklist_execution_schedules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Executors and managers can view schedules" ON public.checklist_execution_schedules;
CREATE POLICY "Executors and managers can view schedules"
ON public.checklist_execution_schedules
FOR SELECT TO authenticated
USING (
    EXISTS (
        SELECT 1
        FROM public.workspace_members wm
        WHERE wm.id = checklist_execution_schedules.workspace_member_id
          AND wm.user_id = auth.uid()
    )
    OR EXISTS (
        SELECT 1
        FROM public.checklists c
        WHERE c.id = checklist_execution_schedules.checklist_id
          AND (
              c.user_id = auth.uid()
              OR public.has_role_in_workspace(auth.uid(), c.workspace_id, 'editor')
          )
    )
);

ALTER TABLE public.checklist_execution_occurrences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Executors and managers can view occurrences" ON public.checklist_execution_occurrences;
CREATE POLICY "Executors and managers can view occurrences"
ON public.checklist_execution_occurrences
FOR SELECT TO authenticated
USING (
    EXISTS (
        SELECT 1
        FROM public.checklist_execution_schedules s
        JOIN public.workspace_members wm ON wm.id = s.workspace_member_id
        WHERE s.id = checklist_execution_occurrences.schedule_id
          AND wm.user_id = auth.uid()
    )
    OR EXISTS (
        SELECT 1
        FROM public.checklist_execution_schedules s
        JOIN public.checklists c ON c.id = s.checklist_id
        WHERE s.id = checklist_execution_occurrences.schedule_id
          AND (
              c.user_id = auth.uid()
              OR public.has_role_in_workspace(auth.uid(), c.workspace_id, 'editor')
          )
    )
);

-- -------------------------------------------------------------
-- 8) Grants — fail-closed for the browser
--    Reads only for authenticated; NO direct writes from anon or
--    authenticated; backend/service_role stays fully functional.
-- -------------------------------------------------------------
REVOKE ALL ON public.checklist_execution_schedules FROM anon, authenticated;
REVOKE ALL ON public.checklist_execution_occurrences FROM anon, authenticated;

GRANT SELECT ON public.checklist_execution_schedules TO authenticated;
GRANT SELECT ON public.checklist_execution_occurrences TO authenticated;

GRANT ALL ON public.checklist_execution_schedules TO service_role;
GRANT ALL ON public.checklist_execution_occurrences TO service_role;
