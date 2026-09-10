/**
 * Execution 5E.1.1 — responsible + deadline UX hardening.
 *
 * §15 member label (A–E) · §16 assignable filter (F–L) · §17 date mode (M–Q)
 * §18 days mode (R–W) · §19 time entry (X–AD).
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";
import {
  getWorkspaceMemberLabel,
  getAssignableWorkspaceMembers,
  formatTimeDigits,
  normalizeDeadlineTime,
  isValidDayMonth,
  buildAssignmentDueAtFromDate,
  buildAssignmentDueAtFromDays,
  hydrateDeadlinePartsFromDueAt,
  getLocalYear,
  type WorkspaceMemberLike,
} from "../assignment-deadline-ui";
import { fromLocalISO, toLocalISO } from "@/utils/date-helpers";

const member = (over: Partial<WorkspaceMemberLike>): WorkspaceMemberLike => ({
  id: "m1",
  role: "editor",
  user_id: "u-1",
  ...over,
});

// ───────────────────────────────── §15 member label ─────────────────────────

describe("5E.1.1 getWorkspaceMemberLabel (§15)", () => {
  it("A) display_name present → used", () => {
    expect(getWorkspaceMemberLabel(member({ profiles: { display_name: "João Souza" } }))).toBe("João Souza");
  });

  it("B) no display_name + first/last → 'Nome Sobrenome'", () => {
    expect(getWorkspaceMemberLabel(member({ profiles: { first_name: "João", last_name: "Souza" } }))).toBe("João Souza");
  });

  it("C) only first_name → used", () => {
    expect(getWorkspaceMemberLabel(member({ profiles: { first_name: "João" } }))).toBe("João");
  });

  it("D) no names + email_normalized → e-mail", () => {
    expect(getWorkspaceMemberLabel(member({ profiles: null, email_normalized: "joao@email.com" }))).toBe("joao@email.com");
  });

  it("E) nothing usable → 'Membro'", () => {
    expect(getWorkspaceMemberLabel(member({ profiles: null }))).toBe("Membro");
    expect(getWorkspaceMemberLabel(member({ profiles: { display_name: "   " } }))).toBe("Membro");
  });
});

// ─────────────────────────────── §16 assignable ─────────────────────────────

describe("5E.1.1 getAssignableWorkspaceMembers (§16)", () => {
  const members: WorkspaceMemberLike[] = [
    member({ id: "m-owner", role: "owner", user_id: "u-owner" }),
    member({ id: "m-creator", role: "admin", user_id: "u-creator" }),
    member({ id: "m-admin", role: "admin", user_id: "u-admin" }),
    member({ id: "m-editor", role: "editor", user_id: "u-editor" }),
    member({ id: "m-viewer", role: "viewer", user_id: "u-viewer" }),
  ];

  it("F) role owner → excluded", () => {
    const result = getAssignableWorkspaceMembers(members, "u-creator");
    expect(result.find((m) => m.id === "m-owner")).toBeUndefined();
  });

  it("G) user_id === checklistOwnerUserId → excluded (even as admin)", () => {
    const result = getAssignableWorkspaceMembers(members, "u-creator");
    expect(result.find((m) => m.id === "m-creator")).toBeUndefined();
  });

  it("H/I/J) invited admin/editor/viewer → included", () => {
    const result = getAssignableWorkspaceMembers(members, "u-creator");
    expect(result.map((m) => m.id).sort()).toEqual(["m-admin", "m-editor", "m-viewer"]);
  });

  it("K) does not mutate the original array", () => {
    const original = [...members];
    getAssignableWorkspaceMembers(members, "u-creator");
    expect(members).toEqual(original);
    expect(members).toHaveLength(5);
  });

  it("L2) owner id null (metadata missing on existing checklist) → fail-closed keeps only role filter", () => {
    const onlyOwner = [member({ id: "m-owner", role: "owner", user_id: "u-owner" })];
    expect(getAssignableWorkspaceMembers(onlyOwner, null)).toEqual([]);
  });
});

// ───────────────────────────────── §17 date mode ────────────────────────────

describe("5E.1.1 date mode (§17)", () => {
  it("M) initial year = current local year (not hardcoded)", () => {
    expect(getLocalYear()).toBe(new Date().getFullYear());
    expect(hydrateDeadlinePartsFromDueAt(null).year).toBe(String(new Date().getFullYear()));
  });

  it("N) 10/09/2026 + valid time → ISO with exactly the local wall-clock time", () => {
    const iso = buildAssignmentDueAtFromDate("10", "09", 2026, "18:30");
    expect(iso).not.toBeNull();
    const local = toLocalISO(new Date(iso!));
    expect(local).toBe("2026-09-10T18:30");
  });

  it("O) 31/02 → invalid (leap years respected)", () => {
    expect(isValidDayMonth("31", "02", 2026)).toBe(false);
    expect(isValidDayMonth("29", "02", 2024)).toBe(true);
    expect(isValidDayMonth("29", "02", 2026)).toBe(false);
    expect(buildAssignmentDueAtFromDate("31", "02", 2026, "10:00")).toBeNull();
  });

  it("P) incomplete day/month → no due_at", () => {
    expect(buildAssignmentDueAtFromDate("1", "09", 2026, "10:00")).toBeNull();
    expect(buildAssignmentDueAtFromDate("", "09", 2026, "10:00")).toBeNull();
    expect(buildAssignmentDueAtFromDate("10", "", 2026, "10:00")).toBeNull();
    expect(buildAssignmentDueAtFromDate("10", "09", "26", "10:00")).toBeNull();
  });

  it("Q) existing due_at hydrates DD/MM/AAAA + HH:mm in local time", () => {
    const iso = fromLocalISO("2026-03-07T08:05")!;
    const parts = hydrateDeadlinePartsFromDueAt(iso);
    expect(parts).toEqual({ day: "07", month: "03", year: "2026", time: "08:05" });
  });
});

// ───────────────────────────────── §18 days mode ────────────────────────────

describe("5E.1.1 days mode (§18)", () => {
  const now = fromLocalISO("2026-09-10T18:30")!;

  it("R) 1 day → next local calendar day, same time", () => {
    const iso = buildAssignmentDueAtFromDays(1, "18:30", new Date(now));
    expect(toLocalISO(new Date(iso!))).toBe("2026-09-11T18:30");
  });

  it("S) 30 days → now + 30 calendar days", () => {
    const iso = buildAssignmentDueAtFromDays(30, "18:30", new Date(now));
    expect(toLocalISO(new Date(iso!))).toBe("2026-10-10T18:30");
  });

  it("T) month rollover is correct", () => {
    const iso = buildAssignmentDueAtFromDays(5, "18:30", new Date(fromLocalISO("2026-09-28T18:30")!));
    expect(toLocalISO(new Date(iso!))).toBe("2026-10-03T18:30");
  });

  it("U) year rollover is correct", () => {
    const iso = buildAssignmentDueAtFromDays(5, "00:00", new Date(fromLocalISO("2026-12-30T00:00")!));
    expect(toLocalISO(new Date(iso!))).toBe("2027-01-04T00:00");
  });

  it("V/W) 0 and 31 days → invalid", () => {
    expect(buildAssignmentDueAtFromDays(0, "18:30", new Date(now))).toBeNull();
    expect(buildAssignmentDueAtFromDays(31, "18:30", new Date(now))).toBeNull();
  });
});

// ───────────────────────────────── §19 time entry ───────────────────────────

describe("5E.1.1 time entry (§19)", () => {
  it("X/Z) four digits normalize with colon", () => {
    expect(formatTimeDigits("1337")).toBe("13:37");
    expect(normalizeDeadlineTime("1337")).toBe("13:37");
    expect(normalizeDeadlineTime("0830")).toBe("08:30");
    expect(normalizeDeadlineTime("0000")).toBe("00:00");
  });

  it("Y) already-colonated input stays valid", () => {
    expect(normalizeDeadlineTime("13:37")).toBe("13:37");
    expect(formatTimeDigits("13:37")).toBe("13:37");
  });

  it("AA) 23:59 valid", () => {
    expect(normalizeDeadlineTime("23:59")).toBe("23:59");
  });

  it("AB/AC) 24:00 and 12:60 invalid", () => {
    expect(normalizeDeadlineTime("24:00")).toBeNull();
    expect(normalizeDeadlineTime("12:60")).toBeNull();
    expect(normalizeDeadlineTime("2460")).toBeNull();
  });

  it("partial digits → no valid time yet", () => {
    expect(normalizeDeadlineTime("13:")).toBeNull();
    expect(normalizeDeadlineTime("")).toBeNull();
  });
});

// ───────────────────────── structural guards (checklist.tsx) ────────────────

describe("5E.1.1 structural guards on checklist.tsx", () => {
  const source = readFileSync(resolve(process.cwd(), "src/routes/checklist.tsx"), "utf8");
  // CRLF-safe anchor: needle must not span line endings.
  const sectionStart = source.indexOf('{hasWorkspaceResources && (');
  const deadlineIdx = source.indexOf('Alertas de Prazo</h3>');
  expect(sectionStart).toBeGreaterThan(-1);
  expect(deadlineIdx).toBeGreaterThan(sectionStart);
  const section = source.slice(sectionStart, deadlineIdx + 12000);

  it("AD) no native type=\"time\" in the Alertas de Prazo section", () => {
    expect(section).not.toContain('type="time"');
    expect(section).not.toContain('type="date"');
  });

  it("dropdown uses the filtered list + human labels, not raw workspaceMembers", () => {
    expect(section).toContain("assignableWorkspaceMembers.map");
    expect(section).toContain("getWorkspaceMemberLabel(m)");
    expect(section).not.toContain("workspaceMembers.map(m => (");
    expect(section).not.toContain('m.profiles?.display_name || "Membro"');
  });

  it("empty assignable list offers the disabled placeholder", () => {
    expect(section).toContain("Nenhum membro disponível");
  });

  it("mode segmented control exists with both labels", () => {
    expect(section).toContain("Data específica");
    expect(section).toContain("Em dias");
  });

  it("owner stays the alert recipient (untouched area)", () => {
    expect(section).toContain("Destinatário do alerta");
    expect(section).toContain("Proprietário do workspace");
  });

  it("member fetch includes email_normalized; profiles include first/last name", () => {
    expect(source).toContain('.select("id, user_id, role, status, email_normalized")');
    expect(source).toContain('.select("id, display_name, first_name, last_name, avatar_url")');
  });

  it("canonical save contract untouched (primaryMemberId + assignmentDueAt gate)", () => {
    expect(source).toContain("if (!primaryMemberId || !assignmentDueAt) {");
    expect(source).toContain("Selecione um responsável e defina um prazo");
    expect(source).toContain("set_assignment_deadline");
    expect(source).toContain("update_checklist_assignments");
  });

  it("hydration wired in loadDeadlineAssignmentState (both branches)", () => {
    expect(source).toContain("hydrateDeadlinePartsFromDueAt(primary.due_at)");
    expect(source).toContain('setDeadlineTime("23:59")');
  });

  it("controls sync into canonical assignmentDueAt via effect", () => {
    expect(source).toContain("buildAssignmentDueAtFromDate(deadlineDay, deadlineMonth, deadlineYear, deadlineTime)");
    expect(source).toContain("buildAssignmentDueAtFromDays(deadlineDays, deadlineTime)");
  });
});

// ─────────────────────── §13/§14 preservation guards ────────────────────────

describe("5E.1.1 — 5E.1 and 5E.0 preserved", () => {
  it("executar.$id.tsx identity fix untouched (workspaceMemberId, not user.id)", () => {
    const routeSource = readFileSync(resolve(process.cwd(), "src/routes/executar.$id.tsx"), "utf8");
    expect(routeSource).toContain("getAssignmentsForWorkspaceMember(checklist.checklist_assignments, workspaceMemberId)");
    expect(routeSource).not.toMatch(/workspace_member_id\s*===?\s*user\??\.id/);
  });

  it("helpers module carries no DB logic (pure UI only)", () => {
    const helperSource = readFileSync(resolve(process.cwd(), "src/lib/assignment-deadline-ui.ts"), "utf8");
    expect(helperSource).not.toContain("supabase");
    expect(helperSource).not.toContain(".from(");
  });
});
