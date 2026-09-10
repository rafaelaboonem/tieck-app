/**
 * Execution 5E.1 — assignment member identity (spec §8 A–G + §9).
 *
 * checklist_assignments.workspace_member_id references workspace_members.id,
 * not auth.users.id. The route must resolve assignments via
 * useWorkspaceRBAC().workspaceMemberId only.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";
import { getAssignmentsForWorkspaceMember } from "../execution-assignment";

const WORKSPACE_MEMBER_ID = "wm-11111111-1111-1111-1111-111111111111";
const OTHER_MEMBER_ID = "wm-22222222-2222-2222-2222-222222222222";
const USER_ID = "auth-33333333-3333-3333-3333-333333333333";

const dueAt = "2026-09-15T10:00:00Z";
const assignmentFor = (id: string, memberId: string) => ({
  id,
  workspace_member_id: memberId,
  due_at: dueAt,
  completed_at: null,
});

describe("5E.1 getAssignmentsForWorkspaceMember", () => {
  it("A) matches the workspace member id even when user.id differs", () => {
    const assignments = [assignmentFor("a1", WORKSPACE_MEMBER_ID)];
    const result = getAssignmentsForWorkspaceMember(assignments, WORKSPACE_MEMBER_ID);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("a1");
  });

  it("B) never matches an assignment keyed to user.id", () => {
    const assignments = [assignmentFor("a1", USER_ID)];
    expect(getAssignmentsForWorkspaceMember(assignments, WORKSPACE_MEMBER_ID)).toEqual([]);
  });

  it("C) two members' assignments → only the current member's is returned", () => {
    const assignments = [
      assignmentFor("a1", OTHER_MEMBER_ID),
      assignmentFor("a2", WORKSPACE_MEMBER_ID),
    ];
    const result = getAssignmentsForWorkspaceMember(assignments, WORKSPACE_MEMBER_ID);
    expect(result.map((a) => a.id)).toEqual(["a2"]);
  });

  it("D) null workspaceMemberId → []", () => {
    expect(getAssignmentsForWorkspaceMember([assignmentFor("a1", WORKSPACE_MEMBER_ID)], null)).toEqual([]);
  });

  it("E) undefined workspaceMemberId → []", () => {
    expect(getAssignmentsForWorkspaceMember([assignmentFor("a1", WORKSPACE_MEMBER_ID)], undefined)).toEqual([]);
  });

  it("F) null/undefined assignments → []", () => {
    expect(getAssignmentsForWorkspaceMember(null, WORKSPACE_MEMBER_ID)).toEqual([]);
    expect(getAssignmentsForWorkspaceMember(undefined, WORKSPACE_MEMBER_ID)).toEqual([]);
  });

  it("G) multiple legitimate assignments of the same member are all kept", () => {
    const assignments = [
      assignmentFor("a1", WORKSPACE_MEMBER_ID),
      assignmentFor("a2", OTHER_MEMBER_ID),
      assignmentFor("a3", WORKSPACE_MEMBER_ID),
    ];
    const result = getAssignmentsForWorkspaceMember(assignments, WORKSPACE_MEMBER_ID);
    expect(result.map((a) => a.id)).toEqual(["a1", "a3"]);
  });
});

describe("5E.1 — structural guards on executar.$id.tsx (spec §9)", () => {
  const routeSource = readFileSync(resolve(process.cwd(), "src/routes/executar.$id.tsx"), "utf8");

  it("obtains workspaceMemberId from useWorkspaceRBAC", () => {
    expect(routeSource).toContain("workspaceMemberId");
    expect(routeSource).toMatch(/useWorkspaceRBAC\(checklist\?\.workspace_id\)/);
  });

  it("uses getAssignmentsForWorkspaceMember with the RBAC identity", () => {
    expect(routeSource).toContain("getAssignmentsForWorkspaceMember(checklist.checklist_assignments, workspaceMemberId)");
  });

  it("does NOT compare workspace_member_id with user?.id anywhere (bug regression guard)", () => {
    expect(routeSource).not.toMatch(/workspace_member_id\s*===?\s*user\??\.id/);
    expect(routeSource).not.toContain("a.workspace_member_id === user?.id");
  });

  it("badge/deadline rendering contract preserved", () => {
    expect(routeSource).toContain("getAssignmentStatus(a.due_at, a.completed_at)");
    expect(routeSource).toContain("getStatusBadge(status)");
    expect(routeSource).toContain("CalendarDays");
    expect(routeSource).toContain("Prazo: ");
  });

  it("access/RBAC resolution untouched (role-based gates remain)", () => {
    expect(routeSource).toMatch(/\(\!role && checklist\.workspace_id\)/);
    expect(routeSource).toContain("Acesso Negado");
  });
});
