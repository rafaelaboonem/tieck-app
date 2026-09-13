/**
 * Execution 6B.2A (GAP B) — fronteira do período pelo dia civil da unidade.
 *
 * A agregação (`analytics_unit_daily_compliance`) baldeia por
 * `date_trunc('day', scheduled_at AT TIME ZONE u.timezone)`. O detalhe precisa
 * consultar o MESMO conjunto, então o período YYYY-MM-DD vira um intervalo UTC
 * derivado da timezone IANA da unidade — nunca de um offset fixo.
 */
import { describe, it, expect } from "vitest";
import {
  addDaysISO,
  isValidTimeZone,
  unitDayRange,
  unitPeriodRange,
  zonedTodayISO,
} from "../unit-day-range";

const SP = "America/Sao_Paulo";

describe("6B.2A — unitDayRange: dia civil da unidade em UTC", () => {
  it("America/Sao_Paulo: 2026-09-13 é 2026-09-13T03:00Z → 2026-09-14T02:59:59.999Z", () => {
    expect(unitDayRange("2026-09-13", SP)).toEqual({
      start: "2026-09-13T03:00:00.000Z",
      end: "2026-09-14T02:59:59.999Z",
    });
  });

  it("UTC permanece idêntico ao comportamento anterior (sem timezone)", () => {
    const utc = { start: "2026-09-13T00:00:00.000Z", end: "2026-09-13T23:59:59.999Z" };
    expect(unitDayRange("2026-09-13", "UTC")).toEqual(utc);
    expect(unitDayRange("2026-09-13", null)).toEqual(utc);
    expect(unitDayRange("2026-09-13", undefined)).toEqual(utc);
    expect(unitDayRange("2026-09-13", "Not/AZone")).toEqual(utc);
  });

  it("offset não inteiro (Asia/Kolkata, +05:30) é derivado corretamente", () => {
    expect(unitDayRange("2026-09-13", "Asia/Kolkata")).toEqual({
      start: "2026-09-12T18:30:00.000Z",
      end: "2026-09-13T18:29:59.999Z",
    });
  });

  it("horário de verão: o dia civil pode ter 23h (spring forward)", () => {
    const r = unitDayRange("2026-03-08", "America/New_York");
    expect(r).toEqual({
      start: "2026-03-08T05:00:00.000Z",
      end: "2026-03-09T03:59:59.999Z",
    });
    // 23 horas exatas — offset mudou de -05:00 para -04:00 dentro do dia.
    expect(Date.parse(r.end) - Date.parse(r.start) + 1).toBe(23 * 3600000);
  });

  it("horário de verão: o dia civil pode ter 25h (fall back)", () => {
    const r = unitDayRange("2026-11-01", "America/New_York");
    expect(r).toEqual({
      start: "2026-11-01T04:00:00.000Z",
      end: "2026-11-02T04:59:59.999Z",
    });
    expect(Date.parse(r.end) - Date.parse(r.start) + 1).toBe(25 * 3600000);
  });

  it("data malformada falha alto em vez de consultar um período errado", () => {
    expect(() => unitDayRange("13/09/2026", SP)).toThrow(/data inválida/);
  });

  it("addDaysISO atravessa mês e ano", () => {
    expect(addDaysISO("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDaysISO("2026-03-01", -1)).toBe("2026-02-28");
    expect(addDaysISO("2026-09-10", 3)).toBe("2026-09-13");
  });

  it("isValidTimeZone distingue IANA real de string inválida", () => {
    expect(isValidTimeZone(SP)).toBe(true);
    expect(isValidTimeZone("UTC")).toBe(true);
    expect(isValidTimeZone("Nope/Nowhere")).toBe(false);
    expect(isValidTimeZone(null)).toBe(false);
    expect(isValidTimeZone(undefined)).toBe(false);
  });
});

describe("6B.2A — aceitação: uma execução na borda UTC pertence a UM único dia", () => {
  // 2026-09-14T01:30Z é 2026-09-13 22:30 em America/Sao_Paulo.
  const EDGE = Date.parse("2026-09-14T01:30:00.000Z");

  it("entra no dia 13 (unidade) e NÃO entra no dia 14 (unidade)", () => {
    const d13 = unitDayRange("2026-09-13", SP);
    const d14 = unitDayRange("2026-09-14", SP);
    expect(EDGE).toBeGreaterThanOrEqual(Date.parse(d13.start));
    expect(EDGE).toBeLessThanOrEqual(Date.parse(d13.end));
    expect(EDGE).toBeLessThan(Date.parse(d14.start));
  });

  it("a mesma execução cairia no dia 14 se o período fosse calculado em UTC", () => {
    const d13utc = unitDayRange("2026-09-13", "UTC");
    expect(EDGE).toBeGreaterThan(Date.parse(d13utc.end));
  });

  it("as bordas são inclusivas: início e fim pertencem ao dia", () => {
    const d = unitDayRange("2026-09-13", SP);
    expect(Date.parse(d.start)).toBe(Date.parse("2026-09-13T03:00:00.000Z"));
    expect(Date.parse(d.end)).toBe(Date.parse("2026-09-14T02:59:59.999Z"));
    // Um milissegundo fora de cada lado já pertence a outro dia.
    expect(Date.parse(d.start) - 1).toBeLessThan(Date.parse(d.start));
    expect(Date.parse(d.end) + 1).toBe(Date.parse(unitDayRange("2026-09-14", SP).start));
  });
});

describe("6B.2A — unitPeriodRange e zonedTodayISO", () => {
  it("intervalo multi-dia vai da meia-noite local do primeiro ao fim local do último", () => {
    expect(unitPeriodRange("2026-09-10", "2026-09-13", SP)).toEqual({
      start: "2026-09-10T03:00:00.000Z",
      end: "2026-09-14T02:59:59.999Z",
    });
  });

  it("um único dia no período equivale a unitDayRange", () => {
    expect(unitPeriodRange("2026-09-13", "2026-09-13", SP)).toEqual(unitDayRange("2026-09-13", SP));
  });

  it("zonedTodayISO usa o dia civil da timezone", () => {
    const instant = new Date("2026-09-14T01:30:00Z");
    expect(zonedTodayISO(SP, instant)).toBe("2026-09-13");
    expect(zonedTodayISO("UTC", instant)).toBe("2026-09-14");
    expect(zonedTodayISO("Asia/Kolkata", new Date("2026-09-13T19:00:00Z"))).toBe("2026-09-14");
    // Sem timezone válida volta ao dia UTC.
    expect(zonedTodayISO("Nope/Nowhere", instant)).toBe("2026-09-14");
  });
});
