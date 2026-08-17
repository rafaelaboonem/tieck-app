# Plan: Phase 4C.1 - Integrity Hardening

Address critical flaws identified in the Phase 4C implementation to ensure data integrity, security, and reliable alerts before activating the cron.

## 1. Database & RPC Hardening
- **`update_checklist_assignments`**:
  - Drop all existing signatures (overloads) to avoid confusion.
  - Recreate the canonical 4-argument signature (`p_workspace_id`, `p_checklist_id`, `p_member_ids`, `p_primary_member_id`).
  - Implement strict differential sync: `DELETE` only removed members, `INSERT ... ON CONFLICT DO UPDATE` for retained/new members.
  - Ensure lifecycle columns (`due_at`, `completed_at`, `overdue_notified_at`, `created_at`) are NEVER lost.
  - Add strict server-side validation for workspace ownership of the checklist and membership status of all IDs.

## 2. Execution Engine Reliability
- **Post-Submission Lifecycle**:
  - Fix the race condition in `ExecutionEngine.tsx`.
  - Ensure `complete_assignment` RPC is called **after** `finalize_public_response` but **before** any redirection.
  - Explicitly handle Supabase RPC errors without breaking the user experience.

## 3. Cron & Alerting Integrity
- **Owner Resolution**: 
  - Switch from `profiles.email` to `supabaseAdmin.auth.admin.getUserById(ownerId)` in the cron handler.
  - Ensure the email is resolved from the source of truth (Auth).
- **Overdue Query**:
  - Replace the unreliable PostgREST filter with a robust server-side check.
  - Criteria: `due_at < now()` AND `overdue_notified_at IS NULL`, then filter candidates by `completed_at` logic.
- **Resend Idempotency**:
  - Correct the header to `Idempotency-Key`.
  - Ensure `overdue_notified_at` is only updated after a successful 2xx response from Resend.

## 4. Timezone & Localization
- **Deadline Selection**:
  - Implement robust ISO UTC <-> Local Time helpers in `AssignmentDeadlinePopover`.
  - Ensure that opening and saving a deadline without changes preserves the exact instant.
  - Fix the initialization logic that was using simple string splits.

## 5. Security & Sanitization
- **Email HTML**:
  - Escape all dynamic values (`checklistTitle`, `workspaceName`, `assigneeName`) in `overdue-email.server.ts`.
  - Sanitize the email subject against control characters.

## Technical Details
- **Migration**: `20260817172500_fase_4c_integrity_patch.sql`
- **RPC Change**: `update_checklist_assignments` will return to the signature `(uuid, uuid, uuid[], uuid)`.
- **Environment**: Ensure `CRON_SECRET` and `RESEND_API_KEY` are used correctly in the Vercel runtime.
- **Testing**: Expand `assignments.test.tsx` to 20+ regression cases covering all the above.

## Constraints
- Do not modify Phase 4B Auth, OTP, or existing invitation flows.
- Do not add new features or activate the cron yet.
