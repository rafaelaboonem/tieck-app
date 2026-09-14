/**
 * Execution 6B.3 — contrato puro do filtro de turno.
 *
 * §1  — `sanitizeFilters` é o único ponto que transforma a URL em estado: turno
 *       vazio/inválido sai do estado (nunca vira um filtro impossível) e o
 *       turno válido é preservado literalmente.
 * §2  — `resolveEffectiveShiftId`/`shouldClearShiftId` decidem quando um turno é
 *       aplicável: enquanto as opções do escopo não resolveram, o turno é
 *       mantido (é um filtro legítimo); depois de resolver, um turno ausente do
 *       escopo é uma combinação impossível e precisa ser limpo.
 */
import { describe, it, expect } from "vitest";
import {
  defaultFilters,
  sanitizeFilters,
  resolveEffectiveShiftId,
  shouldClearShiftId,
} from "@/lib/dashboard-filters";

describe("6B.3 sanitizeFilters — turno vindo da URL", () => {
  it("preserva um shiftId válido", () => {
    expect(sanitizeFilters({ shiftId: "shift-m" }).shiftId).toBe("shift-m");
  });

  it("string vazia, tipo errado e ausência removem o turno", () => {
    expect(sanitizeFilters({ shiftId: "" }).shiftId).toBeUndefined();
    expect(sanitizeFilters({ shiftId: 42 as unknown as string }).shiftId).toBeUndefined();
    expect(sanitizeFilters({}).shiftId).toBeUndefined();
    expect(defaultFilters().shiftId).toBeUndefined();
  });

  it("mantém período, unidade e turno independentes entre si", () => {
    const f = sanitizeFilters({
      startDate: "2026-09-01",
      endDate: "2026-09-13",
      unitId: "unit-a",
      shiftId: "shift-n",
    });
    expect(f).toEqual({
      startDate: "2026-09-01",
      endDate: "2026-09-13",
      unitId: "unit-a",
      shiftId: "shift-n",
    });
  });

  it("datas inválidas caem no default sem derrubar o turno", () => {
    const f = sanitizeFilters({ startDate: "13/09/2026", endDate: "x", shiftId: "shift-m" });
    const def = defaultFilters();
    expect(f.startDate).toBe(def.startDate);
    expect(f.endDate).toBe(def.endDate);
    expect(f.shiftId).toBe("shift-m");
  });
});

describe("6B.3 resolveEffectiveShiftId — quando o turno é aplicável", () => {
  it("sem turno selecionado nada é aplicado", () => {
    expect(
      resolveEffectiveShiftId({
        shiftId: undefined,
        availableShiftIds: ["a"],
        optionsResolved: true,
      }),
    ).toBeUndefined();
  });

  it("enquanto as opções não resolveram, o turno selecionado é mantido", () => {
    expect(
      resolveEffectiveShiftId({ shiftId: "x", availableShiftIds: [], optionsResolved: false }),
    ).toBe("x");
  });

  it("turno presente no escopo é aplicado; ausente é descartado", () => {
    expect(
      resolveEffectiveShiftId({
        shiftId: "a",
        availableShiftIds: ["a", "b"],
        optionsResolved: true,
      }),
    ).toBe("a");
    expect(
      resolveEffectiveShiftId({
        shiftId: "z",
        availableShiftIds: ["a", "b"],
        optionsResolved: true,
      }),
    ).toBeUndefined();
  });
});

describe("6B.3 shouldClearShiftId — combinação impossível", () => {
  it("não limpa sem turno selecionado nem antes das opções resolverem", () => {
    expect(
      shouldClearShiftId({ shiftId: undefined, availableShiftIds: [], optionsResolved: true }),
    ).toBe(false);
    expect(
      shouldClearShiftId({ shiftId: "x", availableShiftIds: [], optionsResolved: false }),
    ).toBe(false);
  });

  it("limpa somente quando o turno realmente não existe no escopo", () => {
    expect(
      shouldClearShiftId({ shiftId: "x", availableShiftIds: ["a"], optionsResolved: true }),
    ).toBe(true);
    expect(
      shouldClearShiftId({ shiftId: "a", availableShiftIds: ["a"], optionsResolved: true }),
    ).toBe(false);
  });
});
