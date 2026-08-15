# Plan: Final Security Stabilization of Phase 4A

Strictly hardening the Team, Invitations, and Permissions module based on real database diagnosis and mandatory security constraints. Working from canonical commit `95f5158fb89add66b43bdf1b4df9b6e374b5f9a4`.

## Database Hardening (Repair Migration)

Create a single idempotent corrective migration:

1.  **RPC Stabilization**:
    *   `create_workspace_invitation_safe`: Update to canonical signature. Normalizes email, prevents active member re-invite, rejects 'owner' role, enforces Admin can't invite Admins. Revokes pending invites for same email atomically.
    *   `update_workspace_member_status`: Update to canonical signature. Validates actor/member workspace match, protects Owner (no demote/remove), Admin can't modify Admin or promote to Admin.
    *   `resend_workspace_invitation`: Update to canonical signature. Pendings only, workspace validation, Owner-only for Admin invitations.
    *   `accept_workspace_invitation_service`: Hardened logic. `service_role` only, pending + non-expired only, **mandatory email match** (authenticated email vs invitation email), no owner grant, audit trail preserved (status='accepted').
    *   `user_has_workspace_access`: Consolidate to single `(uuid, uuid, text)` signature. Remove `app_role` overload.

2.  **Privilege Revocation**:
    *   `REVOKE ALL ON FUNCTION ... FROM PUBLIC, anon, authenticated` for all 4 sensitive RPCs.
    *   `GRANT EXECUTE ... TO service_role` only.

3.  **RLS Correction**:
    *   Separate `SELECT` from `INSERT/UPDATE/DELETE` for: `workspace_categories`, `units`, `shifts`.
    *   Viewer = `SELECT` only.
    *   Owner/Admin/Editor = Write access.
    *   Enforce `workspace_id` isolation (no cross-workspace moves).

## Backend Hardening

1.  **Endpoints Refactoring**:
    *   `accept.ts`: Derive `user.id` and `email` from Bearer token only. Map RPC errors to safe codes (`unauthorized`, `email_mismatch`, `invalid_token`).
    *   `create.ts`, `resend.ts`: Apply fail-closed rate limits. Ensure arguments match new RPC signatures.
    *   `revoke.ts`, `update.ts`: Align with new authorization matrix (Owner vs Admin privileges).

2.  **Type Safety**:
    *   Regenerate `src/integrations/supabase/types.ts`.
    *   Remove all `any` casts in API handlers and `src/lib/team.functions.ts`.

## Frontend Stabilization

1.  **Team Management (/equipe)**:
    *   Derive current user role.
    *   Hide/disable "Invite as Admin" for Admin users.
    *   Conditional UI for Member actions (Edit/Remove/Revoke) based on role matrix.
    *   Strict type guards for member/invitation views.

2.  **Checklist Assignments (/organizar)**:
    *   Fix removal logic to send `p_primary_member_id: null`.
    *   Ensure Editor+ can only assign active members from the same workspace.
    *   Remove all `any` types in assignment handlers.

## Verification & Testing

1.  **Security Scenarios**:
    *   Verify RPCs fail for `authenticated` role.
    *   Verify Owner protection (no removal).
    *   Verify Email Match on acceptance.
    *   Verify Admin can't promote to Admin.
2.  **Build & Typecheck**:
    *   `npx tsc --noEmit`
    *   `npm run build`

## Technical Details

*   **RPC Argument Alignment**:
    *   `create_workspace_invitation_safe(p_workspace_id, p_invited_by, p_email_normalized, p_role, p_token_hash, p_expires_at)`
    *   `update_workspace_member_status(p_workspace_id, p_actor_id, p_member_id, p_status, p_role)`
    *   `resend_workspace_invitation(p_workspace_id, p_actor_id, p_invitation_id, p_new_token_hash, p_expires_at)`
    *   `accept_workspace_invitation_service(p_token_hash, p_user_id)`
*   **Rate Limits**: 5 invites/10min, 3 resends/10min (fail-closed).
*   **Invitation Expiry**: 7 days.
