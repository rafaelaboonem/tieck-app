-- Migration Patch 5B.10: Canonical RBAC Access and Assignment Visibility
-- Phase 5B.10

-- 1. Create a secure RPC to fetch workspace access details (role, member_id, is_owner)
-- This avoids direct SELECTs from the client and enforces server-side identity via auth.uid()

CREATE OR REPLACE FUNCTION public.get_my_workspace_access(p_workspace_id uuid)
RETURNS TABLE (
    role public.app_role,
    workspace_member_id uuid,
    is_owner boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_owner_id uuid;
BEGIN
    -- 1. Check if the user is the owner of the workspace
    SELECT owner_id INTO v_owner_id
    FROM public.workspaces
    WHERE id = p_workspace_id;

    IF v_owner_id = auth.uid() THEN
        RETURN QUERY SELECT 'owner'::public.app_role, NULL::uuid, true;
        RETURN;
    END IF;

    -- 2. Check if the user is an active member
    RETURN QUERY
    SELECT wm.role, wm.id, false
    FROM public.workspace_members wm
    WHERE wm.workspace_id = p_workspace_id
      AND wm.user_id = auth.uid()
      AND wm.status = 'active';
END;
$$;

-- Revoke all to ensure tight security
REVOKE ALL ON FUNCTION public.get_my_workspace_access(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_my_workspace_access(uuid) FROM anon;

-- Grant to authenticated and service_role
GRANT EXECUTE ON FUNCTION public.get_my_workspace_access(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_workspace_access(uuid) TO service_role;

-- 2. Create a secure RPC to list assignments for the authenticated user in a workspace
-- This ensures Viewers only see their own assignments without requiring broad RLS policies.

CREATE OR REPLACE FUNCTION public.list_my_checklist_assignments(p_workspace_id uuid)
RETURNS TABLE (
    checklist_id uuid,
    assignment_id uuid,
    due_at timestamptz,
    completed_at timestamptz,
    overdue_notified_at timestamptz,
    is_primary boolean,
    workspace_member_id uuid
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        ca.checklist_id,
        ca.id,
        ca.due_at,
        ca.completed_at,
        ca.overdue_notified_at,
        ca.is_primary,
        ca.workspace_member_id
    FROM public.checklist_assignments ca
    JOIN public.workspace_members wm ON wm.id = ca.workspace_member_id
    WHERE wm.workspace_id = p_workspace_id
      AND wm.user_id = auth.uid()
      AND wm.status = 'active';
END;
$$;

REVOKE ALL ON FUNCTION public.list_my_checklist_assignments(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.list_my_checklist_assignments(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.list_my_checklist_assignments(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_my_checklist_assignments(uuid) TO service_role;
