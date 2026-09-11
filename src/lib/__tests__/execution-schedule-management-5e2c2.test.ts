/**
 * Execution 5E.2C.2 — typed contract + helpers + Supabase surface (§16 A/B).
 *
 * Pure unit tests (no React): the local narrow Supabase contract, the RPC-only
 * write surface, the friendly error mapping, timezone helpers and the
 * human-readable frequency/weekday formatting.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  listChecklistExecutionSchedules,
  createChecklistExecutionSchedule,
  updateChecklistExecutionSchedule,
  deactivateChecklistExecutionSchedule,
  normalizeScheduleTime,
  normalizeScheduleWeekdays,
  isValidScheduleDate,
  scheduleEndsOnOrAfterStartsOn,
  validateScheduleDraft,
  SCHEDULE_ERROR_MESSAGES,
  getScheduleErrorMessage,
  getScheduleErrorCode,
  getBrowserTimezone,
  getSupportedTimezones,
  FREQUENCY_LABELS,
  ISO_WEEKDAY_LABELS,
  formatScheduleFrequency,
  formatScheduleEndsOn,
  type ExecutionScheduleRow,
} from "../execution-schedule-management";
import {
  EXECUTION_SCHEDULE_FREQUENCIES,
  ISO_WEEKDAYS,
} from "@/lib/execution-schedule";

// The management lib imports the real client; mock the whole module so no
// network can happen (§16: all network in tests uses mocks).
vi.mock("@/integrations/supabase/client", () => {
  const chain = () => {
    const promise = Promise.resolve({ data: [], error: null });
    const builder: Record<string, unknown> = {};
    const add = (name: string) => {
      builder[name] = vi.fn(() => builder);
    };
    ["select", "eq", "order", "single", "limit"].forEach(add);
    builder.then = promise.then.bind(promise);
    builder.catch = promise.catch.bind(promise);
    return builder;
  };
  const rpc = vi.fn(() => Promise.resolve({ data: null, error: null }));
  return {
    supabase: {
      from: vi.fn(() => chain()),
      rpc,
      __rpcMock: rpc,
    },
  };
});

import { supabase } from "@/integrations/supabase/client";

const rpcMock = (supabase as unknown as { __rpcMock: ReturnType<typeof vi.fn> }).__rpcMock;
const fromMock = supabase.from as unknown as ReturnType<typeof vi.fn>;

const row = (over: Partial<ExecutionScheduleRow>): ExecutionScheduleRow => ({
  id: "sched-1",
  checklist_id: "c1",
  workspace_member_id: "m1",
  frequency: "daily",
  weekdays: null,
  due_local_time: "18:00",
  timezone: "America/Sao_Paulo",
  starts_on: "2026-09-11",
  ends_on: null,
  is_active: true,
  created_by: "u1",
  created_at: "2026-09-10T12:00:00Z",
  updated_at: "2026-09-10T12:00:00Z",
  ...over,
} as ExecutionScheduleRow);

// ───────────────────────── §16 A — frequencies & labels ─────────────────────

describe("5E.2C.2 frequencies and labels", () => {
  it("four frequencies with exact Portuguese labels", () => {
    expect(EXECUTION_SCHEDULE_FREQUENCIES).toEqual(["once", "daily", "weekly", "specific_weekdays"]);
    expect(FREQUENCY_LABELS.once).toBe("Uma vez");
    expect(FREQUENCY_LABELS.daily).toBe("Todos os dias");
    expect(FREQUENCY_LABELS.weekly).toBe("Semanalmente");
    expect(FREQUENCY_LABELS.specific_weekdays).toBe("Dias específicos");
  });

  it("ISO weekdays 1..7 with correct Portuguese day names", () => {
    expect(ISO_WEEKDAYS).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(ISO_WEEKDAY_LABELS[1]).toBe("Segunda");
    expect(ISO_WEEKDAY_LABELS[7]).toBe("Domingo");
  });

  it("formatScheduleFrequency appends weekday names for specific_weekdays", () => {
    expect(formatScheduleFrequency({ frequency: "specific_weekdays", weekdays: [5, 1] })).toBe(
      "Dias específicos: Segunda, Sexta"
    );
    expect(formatScheduleFrequency({ frequency: "daily", weekdays: null })).toBe("Todos os dias");
  });
});

// ───────────────────────── §16 A — draft validation ─────────────────────────

describe("5E.2C.2 draft validation", () => {
  const valid = {
    workspaceMemberId: "m1",
    frequency: "daily" as const,
    weekdays: [] as number[],
    dueLocalTime: "18:00",
    timezone: "America/Sao_Paulo",
    startsOn: "2026-09-11",
    endsOn: null as string | null,
  };

  it("time valid/invalid: 00:00..23:59 accepted, 24:00 and 12:60 rejected", () => {
    expect(normalizeScheduleTime("00:00")).toBe("00:00");
    expect(normalizeScheduleTime("23:59")).toBe("23:59");
    expect(normalizeScheduleTime("24:00")).toBeNull();
    expect(normalizeScheduleTime("12:60")).toBeNull();
    expect(normalizeScheduleTime("8:00")).toBeNull();
    expect(normalizeScheduleTime("")).toBeNull();
  });

  it("starts_on required and must be a real calendar date (no UTC round-trip)", () => {
    expect(validateScheduleDraft({ ...valid, startsOn: "" }, { requireMember: true })).toBe(
      "schedule_date_invalid"
    );
    expect(isValidScheduleDate("2026-02-30")).toBe(false);
    expect(isValidScheduleDate("2026-02-28")).toBe(true);
  });

  it("ends_on >= starts_on (string comparison, never a UTC conversion)", () => {
    expect(validateScheduleDraft({ ...valid, endsOn: "2026-09-10" }, { requireMember: true })).toBe(
      "schedule_ends_on_before_start"
    );
    expect(validateScheduleDraft({ ...valid, endsOn: "2026-09-11" }, { requireMember: true })).toBeNull();
    expect(scheduleEndsOnOrAfterStartsOn("2026-09-11", null)).toBe(true);
    expect(scheduleEndsOnOrAfterStartsOn("2026-09-11", "2026-09-10")).toBe(false);
  });

  it("once forces ends_on null", () => {
    expect(validateScheduleDraft({ ...valid, frequency: "once", endsOn: "2026-10-01" }, { requireMember: true })).toBe(
      "schedule_once_ends_on"
    );
    expect(validateScheduleDraft({ ...valid, frequency: "once", endsOn: null }, { requireMember: true })).toBeNull();
  });

  it("specific_weekdays requires at least one day; others tolerate any weekdays input", () => {
    expect(
      validateScheduleDraft({ ...valid, frequency: "specific_weekdays", weekdays: [] }, { requireMember: true })
    ).toBe("schedule_weekdays_required");
    expect(
      validateScheduleDraft({ ...valid, frequency: "specific_weekdays", weekdays: [3] }, { requireMember: true })
    ).toBeNull();
  });

  it("timezone required; member required only at creation", () => {
    expect(validateScheduleDraft({ ...valid, timezone: "  " }, { requireMember: true })).toBe(
      "schedule_timezone_required"
    );
    expect(validateScheduleDraft({ ...valid, workspaceMemberId: null }, { requireMember: true })).toBe(
      "schedule_member_required"
    );
    expect(validateScheduleDraft({ ...valid, workspaceMemberId: null }, { requireMember: false })).toBeNull();
  });

  it("weekdays normalized: deduplicated, numerically sorted, null outside specific_weekdays", () => {
    expect(normalizeScheduleWeekdays("specific_weekdays", [5, 1, 5, 3])).toEqual([1, 3, 5]);
    expect(normalizeScheduleWeekdays("daily", [1])).toBeNull();
    expect(normalizeScheduleWeekdays("weekly", null)).toBeNull();
    expect(normalizeScheduleWeekdays("once", [])).toBeNull();
  });

  it("dates stay civil YYYY-MM-DD strings end-to-end (no ISO conversion)", () => {
    expect(validateScheduleDraft(valid, { requireMember: true })).toBeNull();
    expect(formatScheduleEndsOn(null)).toBe("Sem data final");
    expect(formatScheduleEndsOn("2026-10-01")).toBe("2026-10-01");
  });
});

// ───────────────────────── §16 B — Supabase surface ─────────────────────────

describe("5E.2C.2 Supabase surface", () => {
  beforeEach(() => {
    rpcMock.mockClear();
    rpcMock.mockResolvedValue({ data: null, error: null });
    fromMock.mockClear();
  });

  it("list uses SELECT only (no insert/update/delete), active first then newest-first", async () => {
    const newer = row({ id: "newer", created_at: "2026-09-11T00:00:00Z" });
    const olderActive = row({ id: "older-active", created_at: "2026-09-01T00:00:00Z" });
    const ended = row({ id: "ended", is_active: false, created_at: "2026-09-12T00:00:00Z" });

    const builder = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      then: (resolve: (v: unknown) => void) =>
        resolve({ data: [newer, olderActive, ended], error: null }),
    };
    fromMock.mockReturnValue(builder);

    const result = await listChecklistExecutionSchedules("c1");

    expect(fromMock).toHaveBeenCalledWith("checklist_execution_schedules");
    expect(builder.select).toHaveBeenCalledWith("*");
    expect(builder.eq).toHaveBeenCalledWith("checklist_id", "c1");
    expect(builder.order).toHaveBeenNthCalledWith(1, "is_active", { ascending: false });
    expect(builder.order).toHaveBeenNthCalledWith(2, "created_at", { ascending: false });
    expect(result.map((s) => s.id)).toEqual(["newer", "older-active", "ended"]);
    expect(fromMock.mock.results.length).toBeGreaterThan(0);
    const directWrites = ["insert", "update", "delete", "upsert"] as const;
    directWrites.forEach((m) =>
      expect((builder as unknown as Record<string, unknown>)[m]).toBeUndefined()
    );
  });

  it("create uses the create RPC with the exact audited payload", async () => {
    await createChecklistExecutionSchedule({
      checklistId: "c1",
      workspaceMemberId: "m1",
      frequency: "daily",
      weekdays: null,
      dueLocalTime: "18:00",
      timezone: "America/Sao_Paulo",
      startsOn: "2026-09-11",
      endsOn: null,
    });

    expect(rpcMock).toHaveBeenCalledTimes(1);
    expect(rpcMock).toHaveBeenCalledWith("create_checklist_execution_schedule", {
      p_checklist_id: "c1",
      p_workspace_member_id: "m1",
      p_frequency: "daily",
      p_weekdays: null,
      p_due_local_time: "18:00",
      p_timezone: "America/Sao_Paulo",
      p_starts_on: "2026-09-11",
      p_ends_on: null,
    });
  });

  it("update uses the update RPC and never sends a responsible member", async () => {
    await updateChecklistExecutionSchedule("sched-9", {
      frequency: "weekly",
      weekdays: null,
      dueLocalTime: "08:00",
      timezone: "Europe/London",
      startsOn: "2026-09-12",
      endsOn: "2026-12-31",
    });

    expect(rpcMock).toHaveBeenCalledTimes(1);
    const [fn, args] = rpcMock.mock.calls[0];
    expect(fn).toBe("update_checklist_execution_schedule");
    expect(args).toEqual({
      p_schedule_id: "sched-9",
      p_frequency: "weekly",
      p_weekdays: null,
      p_due_local_time: "08:00",
      p_timezone: "Europe/London",
      p_starts_on: "2026-09-12",
      p_ends_on: "2026-12-31",
    });
    expect(Object.keys(args)).not.toContain("p_workspace_member_id");
    expect(JSON.stringify(args)).not.toContain("workspace_member");
  });

  it("deactivate uses the deactivate RPC with only the schedule id", async () => {
    await deactivateChecklistExecutionSchedule("sched-9");

    expect(rpcMock).toHaveBeenCalledTimes(1);
    expect(rpcMock).toHaveBeenCalledWith("deactivate_checklist_execution_schedule", {
      p_schedule_id: "sched-9",
    });
  });

  it("zero p_actor_id / p_user_id / p_workspace_id across all RPC payloads", async () => {
    await createChecklistExecutionSchedule({
      checklistId: "c1",
      workspaceMemberId: "m1",
      frequency: "daily",
      weekdays: null,
      dueLocalTime: "18:00",
      timezone: "America/Sao_Paulo",
      startsOn: "2026-09-11",
      endsOn: null,
    });
    await updateChecklistExecutionSchedule("s1", {
      frequency: "daily",
      weekdays: null,
      dueLocalTime: "18:00",
      timezone: "America/Sao_Paulo",
      startsOn: "2026-09-11",
      endsOn: null,
    });
    await deactivateChecklistExecutionSchedule("s1");

    const allArgs = rpcMock.mock.calls.map((c) => JSON.stringify(c[1])).join(" ");
    expect(allArgs).not.toContain("p_actor_id");
    expect(allArgs).not.toContain("p_user_id");
    expect(allArgs).not.toContain("p_workspace_id");
  });

  it("zero materializer calls and zero occurrences surface", () => {
    const moduleSource = "materialize_checklist_execution_occurrences";
    void moduleSource;
    const libSource = require("fs").readFileSync(
      require("path").resolve(process.cwd(), "src/lib/execution-schedule-management.ts"),
      "utf8"
    );
    expect(libSource).not.toContain("materialize_checklist_execution_occurrences(");
    expect(libSource).not.toContain("checklist_execution_occurrences");
    expect(libSource).not.toContain('from("checklist_execution_schedules").insert');
    expect(libSource).not.toContain(".update(");
    expect(libSource).not.toContain(".delete(");
  });

  it("friendly error mapping covers every known DB code", () => {
    expect(getScheduleErrorMessage({ code: "schedule_member_inactive" })).toBe(
      "Este responsável não está mais ativo na equipe."
    );
    expect(getScheduleErrorMessage({ code: "schedule_workspace_mismatch" })).toBe(
      "O responsável não pertence ao workspace deste checklist."
    );
    expect(getScheduleErrorMessage({ code: "schedule_inactive" })).toBe("Esta rotina já foi encerrada.");
    expect(getScheduleErrorMessage({ code: "schedule_management_denied" })).toBe(
      "Você não tem permissão para gerenciar rotinas."
    );
    expect(getScheduleErrorMessage({ code: "schedule_actor_required" })).toBe(
      "Sua sessão expirou. Entre novamente."
    );
    expect(getScheduleErrorMessage({ code: "schedule_checklist_not_found" })).toBe(
      "Este checklist não está disponível para rotinas."
    );
    expect(getScheduleErrorMessage({ code: "schedule_timezone_invalid" })).toBe(
      "Escolha um fuso horário válido."
    );
    expect(getScheduleErrorMessage({ code: "not_a_known_code" })).toBe(
      SCHEDULE_ERROR_MESSAGES.unknown
    );
    expect(getScheduleErrorMessage(null)).toBe(SCHEDULE_ERROR_MESSAGES.unknown);
    expect(getScheduleErrorMessage({ message: "boom: schedule_member_required" })).toBe(
      "Selecione um responsável."
    );
  });

  it("5E.2C.2.1 §3: real PostgREST P0001 shape resolves the business token from message", () => {
    // RAISE EXCEPTION 'schedule_member_inactive' USING ERRCODE='P0001' →
    // Supabase delivers { code: "P0001", message: "schedule_member_inactive" }.
    expect(getScheduleErrorMessage({ code: "P0001", message: "schedule_member_inactive", details: null, hint: null })).toBe(
      "Este responsável não está mais ativo na equipe."
    );
    expect(getScheduleErrorMessage({ code: "P0001", message: "schedule_management_denied" })).toBe(
      "Você não tem permissão para gerenciar rotinas."
    );
    // Token can be embedded in a technical message wrapper.
    expect(getScheduleErrorMessage({ code: "P0001", message: "ERROR: schedule_timezone_invalid", details: null })).toBe(
      "Escolha um fuso horário válido."
    );
  });

  it("5E.2C.2.1 §3: P0001 is never treated as a friendly code; technical SQLSTATEs stay generic", () => {
    // Non-schedule code with no business token anywhere → generic copy.
    expect(getScheduleErrorMessage({ code: "23514", message: "constraint failed" })).toBe(
      SCHEDULE_ERROR_MESSAGES.unknown
    );
    // P0001 alone (no business token) → generic, never "P0001" in the UI.
    expect(getScheduleErrorMessage({ code: "P0001", message: "boom" })).toBe(
      SCHEDULE_ERROR_MESSAGES.unknown
    );
    // code itself being a schedule_ token is accepted directly.
    expect(getScheduleErrorMessage({ code: "schedule_inactive" })).toBe("Esta rotina já foi encerrada.");
    // tokenIn priority: message beats details/hint.
    expect(
      getScheduleErrorMessage({
        code: "P0001",
        message: "schedule_member_required",
        details: "schedule_inactive",
      })
    ).toBe("Selecione um responsável.");
    // details and hint are scanned when message has no token.
    expect(getScheduleErrorMessage({ code: "P0001", message: "x", details: "schedule_not_found" })).toBe(
      "Esta rotina não foi encontrada."
    );
    expect(getScheduleErrorMessage({ code: "P0001", message: "x", hint: "schedule_required" })).toBe(
      "Esta rotina não foi encontrada."
    );
    // No business code anywhere → null → generic message.
    expect(getScheduleErrorCode({ code: "P0001", message: "boom" })).toBeNull();
    expect(getScheduleErrorCode({})).toBeNull();
  });
});

// ───────────────────────────── §16 A — timezone ─────────────────────────────

describe("5E.2C.2 timezone helpers", () => {
  it("browser timezone is a non-empty IANA string in Node", () => {
    const tz = getBrowserTimezone();
    expect(typeof tz).toBe("string");
    expect(tz.length).toBeGreaterThan(0);
    expect(tz).toMatch(/^[A-Za-z_]+\/[A-Za-z_]+$/);
  });

  it("supportedValuesOf returns a list when available; fallback stays typed", () => {
    const list = getSupportedTimezones();
    expect(Array.isArray(list)).toBe(true);
    if (list.length > 0) {
      expect(list.every((t) => typeof t === "string")).toBe(true);
    }
  });
});
