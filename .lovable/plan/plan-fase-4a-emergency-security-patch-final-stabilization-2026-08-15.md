# Plan: Fase 4A Emergency Security Patch & Final Stabilization

Execute an emergency security patch for Phase 4A to close RPC vulnerabilities, restore RLS policies, and finalize team management features.

## 1. Emergency Security & RBAC (Database)
- Create migration `20260815100000_phase4a_emergency_security.sql`:
  - `REVOKE ALL` on `create_workspace_invitation_safe` and `update_workspace_member_status` from `PUBLIC`, `anon`, `authenticated`.
  - Grant only to `service_role`.
  - Consolidate `user_has_workspace_access(p_workspace_id, p_user_id, p_min_role text DEFAULT 'viewer')` as the single source of truth.
  - Implement internal authorization in `create_workspace_invitation_safe` and `update_workspace_member_status` (check caller role, workspace isolation, owner protection).
  - Restore all RLS policies for `workspaces`, `workspace_members`, `workspace_invitations`, `checklists`, `checklist_assignments`, etc., that were dropped by `CASCADE`.
  - Add trigger to `checklist_assignments` to prevent cross-workspace assignments.

## 2. Authenticated API Endpoints
- Implement/Harden HTTP endpoints with Bearer token validation (`supabaseAdmin.auth.getUser`):
  - `POST /api/team/members/update`: Role and status updates.
  - `POST /api/team/invitations/revoke`: Revocation of pending invites.
  - `POST /api/team/invitations/create`: (Refactor) Safe creation with email triggers.
  - `POST /api/team/invitations/resend`: Invalidate old token, create new one.
- Add rate limiting to `/api/public/invitations/inspect`.

## 3. Team Management & Assignments (Frontend)
- **Equipe Page (`/equipe`)**:
  - Replace `createServerFn` calls with authenticated `fetch` calls using Bearer token.
  - Fetch members and profiles separately (fixing the lack of FK).
  - Implement full action handlers (Invite, Resend, Revoke, Change Role, Remove/Deactivate).
  - UI visibility based on user role (Owner/Admin/Editor/Viewer).
- **Organizar Page (`/organizar`)**:
  - Complete "Atribuições" tab with full CRUD (Principal, Participants, Filters).
  - Use atomic RPC `update_checklist_assignments` for all changes.
  - Ensure viewer has read-only access.

## 4. Verification & Hardening
- Remove all `any` types and use explicit interfaces (`WorkspaceMemberView`, `Session`, etc.).
- Run `npx tsc --noEmit` and `npm run build`.
- Add focused security tests for RBAC bypass and cross-workspace isolation.

## Technical Details
- **Authorization Priorities**: Owner (4), Admin (3), Editor (2), Viewer (1).
- **Invitation Token**: 64-character hex hash (SHA-256).
- **Emails**: Use existing infrastructure to send workspace invites; return `emailSent: false` on failure but allow link copy.
- **Git SHA**: Record real `git rev-parse HEAD` upon completion.
