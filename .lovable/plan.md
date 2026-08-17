# Phase 4C.2 - Cron Hardening & Popover Integrity

Implement critical fixes for the cron alerting system and the deadline management UI to ensure runtime stability and data consistency.

## Changes

### 1. Cron Endpoint Hardening
- **File**: `src/routes/api/public/cron/overdue-assignments.ts`
- **Query Fix**: Remove `profiles.email` from the Supabase select query.
- **Assignee Fallback**:
    - Use `profiles.display_name` if available.
    - If missing, resolve `user_id` email via `supabaseAdmin.auth.admin.getUserById` server-side.
    - Use "Membro" as ultimate fallback.
- **Persistence Integrity**:
    - Explicitly check for errors when updating `overdue_notified_at`.
    - Only return `status: 'sent'` if both Resend succeeds (2xx) and the database update succeeds.
    - Log failures and ensure retry capability by not marking as notified on database error.

### 2. Popover State Reset
- **File**: `src/components/AssignmentDeadlinePopover.tsx`
- **Logic**: Ensure that if a user modifies the date/time but closes without saving, the local state resets to the actual `dueAt` value from props upon reopening.
- **Implementation**: Sync internal state when the Popover opens, in addition to prop changes.

### 3. Verification & Testing
- **Tests**: Add focused tests in `src/routes/assignments.test.tsx` covering:
    - Cron query correctness (no `profiles.email`).
    - Owner and Member email resolution logic.
    - Persistence failure handling (Resend 200 + DB Error != sent).
    - Popover state restoration on close/reopen.
- **Verification**: Run `vitest`, `tsgo`, and `npm run build`.

## Technical Details
- The `profiles` table does not have an `email` column; all email resolution must go through Auth Admin or be passed from workspace member links if available (but Auth Admin is safer for server-side).
- `overdue_notified_at` update needs `const { error } = await ...` check.
- Popover fix uses the `open` state of the `Popover` component to trigger a reset.
