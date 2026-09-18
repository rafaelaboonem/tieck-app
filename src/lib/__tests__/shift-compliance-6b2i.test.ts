/**
 * Insights da operação — AGREGAÇÃO POR TURNO (6B.2I).
 *
 * A segunda agregação roda sobre a MESMA resposta da view que a agregação por
 * unidade. O que esta suíte protege:
 *
 *   A) o mesmo turno em vários dias SOMA;
 *   B) o mesmo turno em várias unidades SOMA;
 *   C) dois turnos com o MESMO NOME e ids diferentes NÃO são fundidos;
 *   D) `shift_id NULL` é bucket próprio (id null, sem id inventado);
 *   E/F) conformidade é PONDERADA (Σ pesos), nunca média de percentuais;
 *   G) `completionPercentage` é conclusão simples e não substitui a conformidade;
 *   H) denominador zero → null (nem 0%, nem divisão por zero);
 *   I–O) invariáveis contra a agregação por unidade: as duas vêm do mesmo
 *        conjunto, então nada se perde nem se duplica entre elas.
 */
import { describe, expect, it } from "vitest";

import {
  NO_SHIFT_LABEL,
  aggregateByShift,
  isShiftInsightsEmpty,
  ratioPercentage,
  shiftDisplayName,
  sortShiftRows,
  type ShiftAggregationRow,
} from "../shift-compliance";
import { aggregateByUnit } from "@/hooks/useUnitCompliance";
import type { ShiftComplianceRow } from "../shift-compliance";

const UA = "unit-a";
const UB = "unit-b";
const S_MANHA = "shift-manha";
const S_MANHA_OUTRO = "shift-manha-2"; // mesmo NOME, id diferente
const S_NOITE = "shift-noite";

/** Linhas no shape da view (como `useUnitCompliance` as recebe). */
const ROWS: Array<ShiftAggregationRow & { unit_id: string; reference_date: string }> = [
  // ua / manhã — dia 1
  { unit_id: UA, reference_date: "2026-09-16", shift_id: S_MANHA, shift_name: "Manhã", total_scheduled_tasks: 10, completed_tasks: 8, completed_on_time: 7, completed_late: 1, overdue_open_tasks: 1, critical_failures: 0, pending_evidences: 0, due_weight_total: 20, due_weight_done: 18 },
  // ua / manhã — dia 2 (mesmo turno, outro dia: SOMA)
  { unit_id: UA, reference_date: "2026-09-17", shift_id: S_MANHA, shift_name: "Manhã", total_scheduled_tasks: 10, completed_tasks: 10, completed_on_time: 10, completed_late: 0, overdue_open_tasks: 0, critical_failures: 0, pending_evidences: 2, due_weight_total: 20, due_weight_done: 20 },
  // ub / manhã — mesma turno, OUTRA unidade: SOMA
  { unit_id: UB, reference_date: "2026-09-17", shift_id: S_MANHA, shift_name: "Manhã", total_scheduled_tasks: 5, completed_tasks: 3, completed_on_time: 2, completed_late: 1, overdue_open_tasks: 2, critical_failures: 1, pending_evidences: 0, due_weight_total: 10, due_weight_done: 6 },
  // ua / noite
  { unit_id: UA, reference_date: "2026-09-17", shift_id: S_NOITE, shift_name: "Noite", total_scheduled_tasks: 4, completed_tasks: 4, completed_on_time: 4, completed_late: 0, overdue_open_tasks: 0, critical_failures: 0, pending_evidences: 0, due_weight_total: 8, due_weight_done: 8 },
  // ub / turno SEM nome, id próprio e mesmo rótulo de outro: NÃO pode fundir
  { unit_id: UB, reference_date: "2026-09-17", shift_id: S_MANHA_OUTRO, shift_name: "Manhã", total_scheduled_tasks: 2, completed_tasks: 1, completed_on_time: 1, completed_late: 0, overdue_open_tasks: 0, critical_failures: 0, pending_evidences: 0, due_weight_total: 4, due_weight_done: 2 },
  // ua / SEM turno (NULL): bucket próprio
  { unit_id: UA, reference_date: "2026-09-16", shift_id: null, shift_name: null, total_scheduled_tasks: 3, completed_tasks: 3, completed_on_time: 3, completed_late: 0, overdue_open_tasks: 0, critical_failures: 0, pending_evidences: 0, due_weight_total: 6, due_weight_done: 6 },
  // ub / noite — fechamento com atrasos abertos e evidência
  { unit_id: UB, reference_date: "2026-09-16", shift_id: S_NOITE, shift_name: "Noite", total_scheduled_tasks: 6, completed_tasks: 2, completed_on_time: 2, completed_late: 0, overdue_open_tasks: 3, critical_failures: 0, pending_evidences: 1, due_weight_total: 12, due_weight_done: 4 },
];

const sum = (rows: readonly ShiftComplianceRow[]) =>
  rows.reduce(
    (acc, r) => ({
      scheduled: acc.scheduled + r.totalScheduledTasks,
      completed: acc.completed + r.completedTasks,
      onTime: acc.onTime + r.completedOnTime,
      late: acc.late + r.completedLate,
      overdue: acc.overdue + r.overdueOpenTasks,
      critical: acc.critical + r.criticalFailures,
      evidences: acc.evidences + r.pendingEvidences,
      weightTotal: acc.weightTotal + r.dueWeightTotal,
      weightDone: acc.weightDone + r.dueWeightDone,
    }),
    { scheduled: 0, completed: 0, onTime: 0, late: 0, overdue: 0, critical: 0, evidences: 0, weightTotal: 0, weightDone: 0 },
  );

const findByShift = (rows: ShiftComplianceRow[], shiftId: string | null) =>
  rows.find((r) => r.shiftId === shiftId);

describe("A–D) agrupamento por turno", () => {
  it("A+B) o mesmo turno soma dias e unidades em UMA linha", () => {
    const rows = aggregateByShift(ROWS);
    const manha = findByShift(rows, S_MANHA);

    expect(manha).toBeDefined();
    // 10 (ua/dia 1) + 10 (ua/dia 2) + 5 (ub) = 25
    expect(manha?.totalScheduledTasks).toBe(25);
    expect(manha?.completedTasks).toBe(21);
    expect(manha?.completedOnTime).toBe(19);
    expect(manha?.completedLate).toBe(2);
    expect(manha?.overdueOpenTasks).toBe(3);
    expect(manha?.criticalFailures).toBe(1);
    expect(manha?.pendingEvidences).toBe(2);
    expect(manha?.dueWeightTotal).toBe(50);
    expect(manha?.dueWeightDone).toBe(44);
  });

  it("C) dois ids com o MESMO nome não são fundidos (agrupa por id)", () => {
    const rows = aggregateByShift(ROWS);
    const namedManha = rows.filter((r) => r.shiftName === "Manhã");

    expect(namedManha).toHaveLength(2);
    expect(namedManha.map((r) => r.shiftId).sort()).toEqual([S_MANHA, S_MANHA_OUTRO].sort());
    expect(findByShift(rows, S_MANHA_OUTRO)?.totalScheduledTasks).toBe(2);
  });

  it("D) turno NULL vira bucket próprio, com id real null", () => {
    const rows = aggregateByShift(ROWS);
    const semTurno = findByShift(rows, null);

    expect(semTurno).toBeDefined();
    expect(semTurno?.shiftName).toBeNull();
    expect(semTurno?.totalScheduledTasks).toBe(3);
    expect(shiftDisplayName(semTurno!)).toBe(NO_SHIFT_LABEL);
    // Nenhum id fake foi inventado para o bucket.
    expect(rows.filter((r) => !r.shiftId)).toHaveLength(1);
  });

  it("turno sem nome cai no próprio id (nunca em branco)", () => {
    const rows = aggregateByShift([
      { ...ROWS[0], shift_id: "shift-sem-nome", shift_name: null },
    ]);

    expect(shiftDisplayName(rows[0])).toBe("shift-sem-nome");
  });
});

describe("E–H) métricas", () => {
  it("E/F) conformidade é ponderada — não é média de percentuais", () => {
    const manha = findByShift(aggregateByShift(ROWS), S_MANHA)!;

    // Σ done / Σ total = 44/50 = 88,0%
    expect(manha.dueCompliancePercentage).toBe(88);
    // A média das porcentagens diárias seria 90,0 / 100 / 60 = 83,3 — falso.
    const dailyAverage = Math.round(((90 + 100 + 60) / 3) * 10) / 10;
    expect(dailyAverage).toBe(83.3);
    expect(manha.dueCompliancePercentage).not.toBe(dailyAverage);
  });

  it("por turno, Σ pesos × fórmula reproduz o mesmo número que a mão", () => {
    const noite = findByShift(aggregateByShift(ROWS), S_NOITE)!;

    expect(noite.dueWeightTotal).toBe(20);
    expect(noite.dueWeightDone).toBe(12);
    expect(noite.dueCompliancePercentage).toBe(60);
  });

  it("G) completionPercentage é conclusão simples, distinta da conformidade", () => {
    const manha = findByShift(aggregateByShift(ROWS), S_MANHA)!;

    // 21/25 = 84,0% de conclusão, contra 88,0% de conformidade ponderada.
    expect(manha.completionPercentage).toBe(84);
    expect(manha.completionPercentage).not.toBe(manha.dueCompliancePercentage);
  });

  it("H) denominador zero → null (nem 0%, nem divisão por zero)", () => {
    expect(ratioPercentage(0, 0)).toBeNull();
    expect(ratioPercentage(5, 0)).toBeNull();
    expect(ratioPercentage(0, 5)).toBe(0);

    const rows = aggregateByShift([
      {
        shift_id: S_NOITE,
        shift_name: "Noite",
        total_scheduled_tasks: 0,
        completed_tasks: 0,
        completed_on_time: 0,
        completed_late: 0,
        overdue_open_tasks: 0,
        critical_failures: 0,
        pending_evidences: 0,
        due_weight_total: 0,
        due_weight_done: 0,
      },
    ]);

    expect(rows[0].dueCompliancePercentage).toBeNull();
    expect(rows[0].completionPercentage).toBeNull();
  });
});

describe("I–O) invariáveis contra a agregação por unidade", () => {
  const shiftRows = aggregateByShift(ROWS);
  const unitRows = aggregateByUnit(ROWS as never);
  const shiftTotals = sum(shiftRows);
  const unitTotals = unitRows.reduce(
    (acc, r) => ({
      scheduled: acc.scheduled + r.totalScheduledTasks,
      completed: acc.completed + r.completedTasks,
      overdue: acc.overdue + r.overdueOpenTasks,
      critical: acc.critical + r.criticalFailures,
      evidences: acc.evidences + r.pendingEvidences,
      weightTotal: acc.weightTotal + r.dueWeightTotal,
      weightDone: acc.weightDone + r.dueWeightDone,
    }),
    { scheduled: 0, completed: 0, overdue: 0, critical: 0, evidences: 0, weightTotal: 0, weightDone: 0 },
  );

  it("I) Σ shift scheduled = Σ unidade scheduled (KPI do recorte)", () => {
    expect(shiftTotals.scheduled).toBe(unitTotals.scheduled);
    expect(shiftTotals.scheduled).toBe(40);
  });

  it("J) Σ shift completed = Σ unidade completed (KPI Respondidos)", () => {
    expect(shiftTotals.completed).toBe(unitTotals.completed);
    expect(shiftTotals.completed).toBe(31);
  });

  it("K) Σ shift overdue = Σ unidade overdue (KPI Em atraso abertas)", () => {
    expect(shiftTotals.overdue).toBe(unitTotals.overdue);
    expect(shiftTotals.overdue).toBe(6);
  });

  it("L) Σ shift critical = Σ unidade critical (Falhas críticas)", () => {
    expect(shiftTotals.critical).toBe(unitTotals.critical);
    expect(shiftTotals.critical).toBe(1);
  });

  it("M) Σ shift evidences = Σ unidade evidences (Evidências aguardando)", () => {
    expect(shiftTotals.evidences).toBe(unitTotals.evidences);
    expect(shiftTotals.evidences).toBe(3);
  });

  it("N) Σ pesos do turno = Σ pesos da unidade (nada perdido nem duplicado)", () => {
    expect(shiftTotals.weightTotal).toBe(unitTotals.weightTotal);
    expect(shiftTotals.weightDone).toBe(unitTotals.weightDone);
    expect(shiftTotals.weightTotal).toBe(80);
    expect(shiftTotals.weightDone).toBe(64);
  });

  it("O) com turno filtrado (o que a consulta já faz), a soma continua fechando", () => {
    const filtered = ROWS.filter((r) => r.shift_id === S_NOITE);
    const filteredShift = sum(aggregateByShift(filtered));
    const filteredUnit = aggregateByUnit(filtered as never).reduce(
      (acc, r) => ({
        scheduled: acc.scheduled + r.totalScheduledTasks,
        completed: acc.completed + r.completedTasks,
        overdue: acc.overdue + r.overdueOpenTasks,
      }),
      { scheduled: 0, completed: 0, overdue: 0 },
    );

    expect(filteredShift.scheduled).toBe(filteredUnit.scheduled);
    expect(filteredShift.completed).toBe(filteredUnit.completed);
    expect(filteredShift.overdue).toBe(filteredUnit.overdue);
    // Um recorte por turno produz no máximo 1 bucket de turno.
    expect(aggregateByShift(filtered)).toHaveLength(1);
    expect(aggregateByShift(filtered)[0].shiftId).toBe(S_NOITE);
  });
});

describe("ordem, vazio e formato", () => {
  it("ordena alfabeticamente com 'Sem turno definido' por último", () => {
    const ordered = sortShiftRows(aggregateByShift(ROWS)).map((r) => shiftDisplayName(r));

    // Os dois "Manhã" (ids diferentes) continuam lado a lado por nome; o bucket
    // sem turno fecha a lista.
    expect(ordered).toEqual(["Manhã", "Manhã", "Noite", NO_SHIFT_LABEL]);
  });

  it("ordem é estável e não depende da ordem de chegada das linhas", () => {
    const a = sortShiftRows(aggregateByShift(ROWS)).map((r) => r.shiftId);
    const b = sortShiftRows(aggregateByShift([...ROWS].reverse())).map((r) => r.shiftId);

    expect(a).toEqual(b);
  });

  it("vazio: nenhum turno ou tudo zerado", () => {
    expect(isShiftInsightsEmpty([])).toBe(true);
    expect(isShiftInsightsEmpty(aggregateByShift(ROWS))).toBe(false);
    expect(
      isShiftInsightsEmpty(
        aggregateByShift([
          { ...ROWS[0], total_scheduled_tasks: 0, completed_tasks: 0, completed_on_time: 0, completed_late: 0, overdue_open_tasks: 0, critical_failures: 0, pending_evidences: 0, due_weight_total: 0, due_weight_done: 0 },
        ]),
      ),
    ).toBe(true);
  });

  it("lista vazia de linhas produz vazio (sem inventar turno)", () => {
    expect(aggregateByShift([])).toEqual([]);
  });
});
