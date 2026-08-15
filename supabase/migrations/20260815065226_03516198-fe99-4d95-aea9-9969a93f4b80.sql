-- Phase 4A: Teams, Permissions and Assignments
-- 1. Create app_role and invitation_status enums
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'app_role') THEN
        CREATE TYPE public.app_role AS ENUM ('admin', 'editor', 'viewer');
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'invitation_status') THEN
        CREATE TYPE public.invitation_status AS ENUM ('pending', 'accepted', 'revoked', 'expired');
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'member_status') THEN
        CREATE TYPE public.member_status AS ENUM ('pending', 'active', 'inactive');
    END IF;
END $$;

-- 2. Audit and Normalization: workspace_members
CREATE TABLE IF NOT EXISTS public.workspace_members (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id uuid REFERENCES public.workspaces(id) ON DELETE CASCADE NOT NULL,
    user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
    email_normalized text NOT NULL,
    role public.app_role NOT NULL DEFAULT 'viewer',
    status public.member_status NOT NULL DEFAULT 'active',
    created_at timestamptz DEFAULT now() NOT NULL,
    updated_at timestamptz DEFAULT now() NOT NULL,
    ws_id uuid, -- legacy column
    UNIQUE (workspace_id, user_id),
    UNIQUE (workspace_id, email_normalized)
);

-- Backfill from workspaces.owner_id to ensure owners are members
INSERT INTO public.workspace_members (workspace_id, user_id, email_normalized, role, status)
SELECT 
    w.id, 
    w.owner_id, 
    LOWER(TRIM(u.email)), 
    'admin'::public.app_role, 
    'active'::public.member_status
FROM public.workspaces w
JOIN auth.users u ON w.owner_id = u.id
ON CONFLICT (workspace_id, user_id) DO NOTHING;

-- 3. workspace_invitations
CREATE TABLE IF NOT EXISTS public.workspace_invitations (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id uuid REFERENCES public.workspaces(id) ON DELETE CASCADE NOT NULL,
    email_normalized text NOT NULL,
    role public.app_role NOT NULL DEFAULT 'viewer',
    token_hash text NOT NULL,
    status public.invitation_status NOT NULL DEFAULT 'pending',
    invited_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    accepted_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    expires_at timestamptz NOT NULL,
    accepted_at timestamptz,
    created_at timestamptz DEFAULT now() NOT NULL,
    updated_at timestamptz DEFAULT now() NOT NULL
);

-- Index for unique pending invitation
CREATE UNIQUE INDEX IF NOT EXISTS idx_workspace_invitations_pending 
ON public.workspace_invitations (workspace_id, email_normalized) 
WHERE (status = 'pending');

-- 4. checklist_assignments
CREATE TABLE IF NOT EXISTS public.checklist_assignments (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id uuid REFERENCES public.workspaces(id) ON DELETE CASCADE NOT NULL,
    checklist_id uuid REFERENCES public.checklists(id) ON DELETE CASCADE NOT NULL,
    workspace_member_id uuid REFERENCES public.workspace_members(id) ON DELETE CASCADE NOT NULL,
    is_primary boolean DEFAULT false NOT NULL,
    created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at timestamptz DEFAULT now() NOT NULL,
    updated_at timestamptz DEFAULT now() NOT NULL,
    UNIQUE (checklist_id, workspace_member_id)
);

CREATE INDEX IF NOT EXISTS idx_checklist_assignments_primary ON public.checklist_assignments(checklist_id) WHERE (is_primary = true);

-- 5. Security Functions
CREATE OR REPLACE FUNCTION public.has_role_in_workspace(_user_id uuid, _workspace_id uuid, _min_role public.app_role)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_owner_id uuid;
    v_member_role public.app_role;
    v_member_status public.member_status;
BEGIN
    -- Check if owner
    SELECT owner_id INTO v_owner_id FROM public.workspaces WHERE id = _workspace_id;
    IF v_owner_id = _user_id THEN
        RETURN true;
    END IF;

    -- Check member
    SELECT role, status INTO v_member_role, v_member_status
    FROM public.workspace_members
    WHERE workspace_id = _workspace_id AND user_id = _user_id;

    IF v_member_status IS NULL OR v_member_status != 'active' THEN
        RETURN false;
    END IF;

    IF _min_role = 'admin' THEN
        RETURN v_member_role = 'admin';
    ELSIF _min_role = 'editor' THEN
        RETURN v_member_role IN ('admin', 'editor');
    ELSIF _min_role = 'viewer' THEN
        RETURN v_member_role IN ('admin', 'editor', 'viewer');
    END IF;

    RETURN false;
END;
$$;

-- Revoke public execution
REVOKE ALL ON FUNCTION public.has_role_in_workspace(uuid, uuid, public.app_role) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.has_role_in_workspace(uuid, uuid, public.app_role) TO authenticated, service_role;

-- Redefine user_has_workspace_access for backward compatibility
CREATE OR REPLACE FUNCTION public.user_has_workspace_access(_workspace_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT public.has_role_in_workspace(_user_id, _workspace_id, 'viewer');
$$;

-- 6. Grants
GRANT ALL ON TABLE public.workspace_members TO authenticated;
GRANT ALL ON TABLE public.workspace_members TO service_role;
GRANT ALL ON TABLE public.workspace_invitations TO authenticated;
GRANT ALL ON TABLE public.workspace_invitations TO service_role;
GRANT ALL ON TABLE public.checklist_assignments TO authenticated;
GRANT ALL ON TABLE public.checklist_assignments TO service_role;

-- 7. RLS Policies
ALTER TABLE public.workspace_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspace_invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.checklist_assignments ENABLE ROW LEVEL SECURITY;

-- Workspace members: all members can see each other
DROP POLICY IF EXISTS "Members can view their teammates" ON public.workspace_members;
CREATE POLICY "Members can view their teammates" ON public.workspace_members
    FOR SELECT TO authenticated
    USING (public.has_role_in_workspace(auth.uid(), workspace_id, 'viewer'));

-- Invitations: viewers can see, admins/owners can manage
DROP POLICY IF EXISTS "Members can view invitations" ON public.workspace_invitations;
CREATE POLICY "Members can view invitations" ON public.workspace_invitations
    FOR SELECT TO authenticated
    USING (public.has_role_in_workspace(auth.uid(), workspace_id, 'viewer'));

-- Assignments: viewers can see, editors can manage
DROP POLICY IF EXISTS "Members can view assignments" ON public.checklist_assignments;
CREATE POLICY "Members can view assignments" ON public.checklist_assignments
    FOR SELECT TO authenticated
    USING (public.has_role_in_workspace(auth.uid(), workspace_id, 'viewer'));
