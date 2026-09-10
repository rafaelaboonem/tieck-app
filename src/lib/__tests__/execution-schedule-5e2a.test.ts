/**
 * Execution 5E.2A — TypeScript contract for execution schedules.
 * §23 A–K. Generation/timezone/status helpers are 5E.2B+ (not tested here).
 */
import { describe, it, expect } from "vitest";
import {
  EXECUTION_SCHEDULE_FREQUENCIES,
  isExecutionScheduleFrequency,
  isValidIsoWeekday,
  isValidScheduleWeekdays,
} from "../execution-schedule";

describe("5E.2A isExecutionScheduleFrequency", () => {
  it("A) accepts 'once'", () => {
    expect(isExecutionScheduleFrequency("once")).toBe(true);
  });

  it("B) accepts 'daily'", () => {
    expect(isExecutionScheduleFrequency("daily")).toBe(true);
  });

  it("C) accepts 'weekly'", () => {
    expect(isExecutionScheduleFrequency("weekly")).toBe(true);
  });

  it("D) accepts 'specific_weekdays'", () => {
    expect(isExecutionScheduleFrequency("specific_weekdays")).toBe(true);
  });

  it("E) rejects unknown values (fail-closed)", () => {
    expect(isExecutionScheduleFrequency("monthly")).toBe(false);
    expect(isExecutionScheduleFrequency("")).toBe(false);
    expect(isExecutionScheduleFrequency("ONCE")).toBe(false);
    expect(isExecutionScheduleFrequency(null)).toBe(false);
    expect(isExecutionScheduleFrequency(undefined)).toBe(false);
    expect(isExecutionScheduleFrequency(42)).toBe(false);
  });

  it("exposes exactly the four supported frequencies", () => {
    expect([...EXECUTION_SCHEDULE_FREQUENCIES]).toEqual([
      "once",
      "daily",
      "weekly",
      "specific_weekdays",
    ]);
  });
});

describe("5E.2A isValidIsoWeekday", () => {
  it("F) accepts 1 (Monday) and 7 (Sunday)", () => {
    expect(isValidIsoWeekday(1)).toBe(true);
    expect(isValidIsoWeekday(7)).toBe(true);
  });

  it("G) rejects 0 and 8 (and non-integers)", () => {
    expect(isValidIsoWeekday(0)).toBe(false);
    expect(isValidIsoWeekday(8)).toBe(false);
    expect(isValidIsoWeekday(-1)).toBe(false);
    expect(isValidIsoWeekday(1.5)).toBe(false);
    expect(isValidIsoWeekday("1")).toBe(false);
    expect(isValidIsoWeekday(null)).toBe(false);
  });
});

describe("5E.2A isValidScheduleWeekdays", () => {
  it("H) specific_weekdays with [1,3,5] is valid", () => {
    expect(isValidScheduleWeekdays("specific_weekdays", [1, 3, 5])).toBe(true);
  });

  it("H2) specific_weekdays accepts any 1..7-entry ISO subset", () => {
    expect(isValidScheduleWeekdays("specific_weekdays", [7])).toBe(true);
    expect(isValidScheduleWeekdays("specific_weekdays", [1, 2, 3, 4, 5, 6, 7])).toBe(true);
  });

  it("I) specific_weekdays with [] is invalid (1..7 required)", () => {
    expect(isValidScheduleWeekdays("specific_weekdays", [])).toBe(false);
  });

  it("I2) specific_weekdays with null/undefined is invalid", () => {
    expect(isValidScheduleWeekdays("specific_weekdays", null)).toBe(false);
    expect(isValidScheduleWeekdays("specific_weekdays", undefined)).toBe(false);
  });

  it("J) specific_weekdays containing 0 or 8 is invalid", () => {
    expect(isValidScheduleWeekdays("specific_weekdays", [0, 3, 5])).toBe(false);
    expect(isValidScheduleWeekdays("specific_weekdays", [1, 8])).toBe(false);
  });

  it("K) once/daily/weekly must have NULL/absent weekdays", () => {
    expect(isValidScheduleWeekdays("once", null)).toBe(true);
    expect(isValidScheduleWeekdays("daily", undefined)).toBe(true);
    expect(isValidScheduleWeekdays("weekly", null)).toBe(true);
    expect(isValidScheduleWeekdays("once", [1])).toBe(false);
    expect(isValidScheduleWeekdays("daily", [1, 2])).toBe(false);
    expect(isValidScheduleWeekdays("weekly", [5])).toBe(false);
  });
});
