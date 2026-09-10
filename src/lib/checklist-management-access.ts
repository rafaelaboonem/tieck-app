/**
 * Execution 5E.0C.1 — separate checklist management from workspace RBAC.
 *
 * Separates two distinct permissions that were conflated through a single
 * `canManage` from `useWorkspaceRBAC(currentWorkspace?.id)`:
 *
 *  - `canManageChecklist`:  permission to manage THE CHECKLIST (Configuração,
 *    Personalizar, Publicar). TRUE for the authenticated owner of a personal
 *    checklist, or for a workspace checklist where the user can manage the
 *    checklist's REAL workspace.
 *  - `canManageWorkspace`:   permission to manage WORKSPACE resources
 *    (responsável/prazo de assignment, saveDeadlineConfig). Derived from the
 *    workspace RBAC only — never from personal ownership.
 *
 * The AuthGuard remains the authoritative access barrier; this helper only
 * decides the internal UI capability after the guard already authorized the
 * user. Fail-closed: whenever we cannot prove management rights, we return
 * false.
 */

export interface ChecklistManagementAccessInput {
  /** Auth identity (auth.users.id). */
  authUserId: string | null | undefined;
  /** `checklists.user_id` of the existing checklist being edited (null/undefined when new). */
  checklistOwnerId: string | null | undefined;
  /** `checklists.workspace_id` of the existing checklist (null/undefined when personal). */
  checklistWorkspaceId: string | null | undefined;
  /** Effective workspace for a NEW checklist: workspaceParam → currentWorkspace?.id → null. */
  newChecklistWorkspaceId: string | null | undefined;
  /** `canManage` from useWorkspaceRBAC resolved against the checklist's real workspace. */
  workspaceCanManage: boolean;
  /** True while an existing checklist's metadata is still loading. */
  metadataLoading: boolean;
  /** True when the route is editing an existing checklist (id or custom slug present). */
  isExistingChecklist: boolean;
}

export interface ChecklistManagementAccessResult {
  canManageChecklist: boolean;
}

/**
 * 5E.0C.1 — workspace scope for workspace-scoped resources (RBAC, members,
 * deadline assignments).
 *
 * For an EXISTING checklist the scope is ONLY the checklist's real workspace:
 * a personal checklist (workspace_id null) yields `undefined` — never the
 * visually selected workspace. Only a NEW checklist may use the effective
 * context (workspaceParam → currentWorkspace?.id → null).
 */
export function resolveWorkspaceRbacScope(input: {
  /** Route's existing-checklist id (or custom slug); null/undefined when new. */
  checklistId: string | null | undefined;
  /** Real `checklists.workspace_id` once loaded (null/undefined for personal). */
  checklistWorkspaceId: string | null | undefined;
  /** Effective workspace for a NEW checklist: workspaceParam → currentWorkspace?.id → null. */
  newChecklistWorkspaceId: string | null | undefined;
}): string | undefined {
  const { checklistId, checklistWorkspaceId, newChecklistWorkspaceId } = input;
  if (checklistId) {
    return checklistWorkspaceId || undefined;
  }
  return newChecklistWorkspaceId || undefined;
}

export function resolveChecklistManagementAccess(
  input: ChecklistManagementAccessInput
): ChecklistManagementAccessResult {
  const {
    authUserId,
    checklistOwnerId,
    checklistWorkspaceId,
    newChecklistWorkspaceId,
    workspaceCanManage,
    metadataLoading,
    isExistingChecklist,
  } = input;

  // Fail-closed while an existing checklist's metadata is still loading.
  if (isExistingChecklist && metadataLoading) {
    return { canManageChecklist: false };
  }

  // Existing checklist with loaded metadata.
  if (checklistOwnerId != null) {
    const isPersonal = !checklistWorkspaceId;
    if (isPersonal) {
      // Personal checklist: management follows ownership, NOT workspace RBAC.
      // This is the bug case: a workspace Viewer owns a personal checklist and
      // must still manage it fully.
      return { canManageChecklist: !!authUserId && checklistOwnerId === authUserId };
    }
    // Workspace checklist: management follows the RBAC of the checklist's REAL
    // workspace (never the visually selected context).
    return { canManageChecklist: workspaceCanManage };
  }

  // Existing checklist whose metadata is unavailable (fetch failed / no row).
  // Fail-closed: never treat it as a brand-new editable checklist.
  if (isExistingChecklist) {
    return { canManageChecklist: false };
  }

  // New checklist.
  if (newChecklistWorkspaceId) {
    // New checklist inside a workspace → follows that workspace's RBAC.
    return { canManageChecklist: workspaceCanManage };
  }
  // New personal checklist → the authenticated user manages it.
  return { canManageChecklist: !!authUserId };
}