
-- 1. Evolve checklist_assignments table
ALTER TABLE public.checklist_assignments 
ADD COLUMN IF NOT EXISTS due_at timestamptz NULL,
ADD COLUMN IF NOT EXISTS completed_at timestamptz NULL,
ADD COLUMN IF NOT EXISTS overdue_notified_at timestamptz NULL;

COMMENT ON COLUMN public.checklist_assignments.due_at IS 'Deadline for the assignment';
COMMENT ON COLUMN public.checklist_assignments.completed_at IS 'When the assignment was actually completed via a successful submission';
COMMENT ON COLUMN public.checklist_assignments.overdue_notified_at IS 'Timestamp of when the owner was notified about the delay';

-- 2. Grant access to new columns
GRANT SELECT, INSERT, UPDATE ON public.checklist_assignments TO authenticated;
GRANT ALL ON public.checklist_assignments TO service_role;

-- 3. Update existing RPC for differential sync (upsert)
CREATE OR REPLACE FUNCTION public.update_checklist_assignments(
    p_checklist_id uuid,
    p_workspace_id uuid,
    p_member_ids uuid[]
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id uuid;
BEGIN
    v_user_id := auth.uid();
    
    -- RBAC check: Only owner, admin or editor can manage assignments
    IF NOT EXISTS (
        SELECT 1 FROM public.workspace_members 
        WHERE workspace_id = p_workspace_id 
        AND user_id = v_user_id 
        AND role IN ('owner', 'admin', 'editor')
        AND status = 'active'
    ) AND NOT EXISTS (
        SELECT 1 FROM public.workspaces
        WHERE id = p_workspace_id
        AND owner_id = v_user_id
    ) THEN
        RAISE EXCEPTION 'Unauthorized: User cannot manage assignments in this workspace';
    END IF;

    -- 1. Remove members no longer assigned
    DELETE FROM public.checklist_assignments
    WHERE checklist_id = p_checklist_id
    AND workspace_id = p_workspace_id
    AND workspace_member_id != ALL(p_member_ids);

    -- 2. Insert new members (DO NOTHING if already exists to preserve due_at, completed_at, etc)
    INSERT INTO public.checklist_assignments (
        checklist_id,
        workspace_id,
        workspace_member_id,
        created_by
    )
    SELECT 
        p_checklist_id,
        p_workspace_id,
        m_id,
        v_user_id
    FROM unnest(p_member_ids) AS m_id
    ON CONFLICT (checklist_id, workspace_member_id) DO NOTHING;
END;
$$;

-- 4. New RPC to set deadline
CREATE OR REPLACE FUNCTION public.set_assignment_deadline(
    p_assignment_id uuid,
    p_due_at timestamptz
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id uuid;
    v_workspace_id uuid;
BEGIN
    v_user_id := auth.uid();
    
    SELECT workspace_id INTO v_workspace_id 
    FROM public.checklist_assignments 
    WHERE id = p_assignment_id;

    -- RBAC check
    IF NOT EXISTS (
        SELECT 1 FROM public.workspace_members 
        WHERE workspace_id = v_workspace_id 
        AND user_id = v_user_id 
        AND role IN ('owner', 'admin', 'editor')
        AND status = 'active'
    ) AND NOT EXISTS (
        SELECT 1 FROM public.workspaces
        WHERE id = v_workspace_id
        AND owner_id = v_user_id
    ) THEN
        RAISE EXCEPTION 'Unauthorized: User cannot set deadlines';
    END IF;

    -- Reset overdue_notified_at if due_at changes to re-trigger if needed
    UPDATE public.checklist_assignments
    SET due_at = p_due_at,
        overdue_notified_at = CASE 
            WHEN due_at IS DISTINCT FROM p_due_at THEN NULL 
            ELSE overdue_notified_at 
        END,
        updated_at = now()
    WHERE id = p_assignment_id;
END;
$$;

-- 5. New RPC for secure completion
CREATE OR REPLACE FUNCTION public.complete_assignment(
    p_checklist_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id uuid;
    v_member_id uuid;
BEGIN
    v_user_id := auth.uid();
    
    -- Find the active member record for this user in the checklist's workspace
    SELECT m.id INTO v_member_id
    FROM public.workspace_members m
    JOIN public.checklists c ON c.workspace_id = m.workspace_id
    WHERE c.id = p_checklist_id
    AND m.user_id = v_user_id
    AND m.status = 'active';

    IF v_member_id IS NULL THEN
        RETURN false; -- No member found, no-op
    END IF;

    -- Mark as completed if not already marked
    UPDATE public.checklist_assignments
    SET completed_at = COALESCE(completed_at, now()),
        updated_at = now()
    WHERE checklist_id = p_checklist_id
    AND workspace_member_id = v_member_id;

    RETURN FOUND;
END;
$$;
