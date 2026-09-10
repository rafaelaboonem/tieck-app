/**
 * Execution 5E.1 — assignment identity resolution.
 *
 * `checklist_assignments.workspace_member_id` is a FK to
 * `workspace_members.id`, NOT to `auth.users.id`. Comparing it with the
 * authenticated `user.id` silently matches nothing in the normal case, so the
 * executor's own assignments (deadline, badge) never appear.
 *
 * The correct identity — the current user's membership id — is provided by
 * `useWorkspaceRBAC()` as `workspaceMemberId` (from `get_my_workspace_access`).
 * This helper resolves assignments using ONLY that identity, fail-closed.
 */

export interface WorkspaceAssignment {
  id: string;
  workspace_member_id: string | null;
  [key: string]: unknown;
}

/**
 * Returns the assignments belonging to the given workspace member.
 *
 * - `workspaceMemberId` null/undefined → no assignments (fail-closed);
 * - matches ONLY `assignment.workspace_member_id === workspaceMemberId`;
 * - never falls back to `user.id`;
 * - never selects another member's assignment;
 * - if several legitimate assignments exist for the same member, all are kept.
 */
export function getAssignmentsForWorkspaceMember(
  assignments: WorkspaceAssignment[] | null | undefined,
  workspaceMemberId: string | null | undefined
): WorkspaceAssignment[] {
  if (!workspaceMemberId || !Array.isArray(assignments)) return [];
  return assignments.filter(
    (assignment) => assignment.workspace_member_id === workspaceMemberId
  );
}
