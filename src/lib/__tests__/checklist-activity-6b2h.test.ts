/**
 * Atividade dos checklists — CONTRATO da série diária (6B.2H).
 *
 * Fonte: `analytics_unit_daily_compliance`, a MESMA view dos KPIs de tarefa do
 * painel. A view tem grão organização × unidade × turno × dia; a série do gráfico
 * é a SOMA por dia civil. Esta suíte fixa as invariáveis que impedem um número
 * falso:
 *
 *   A) duas unidades no mesmo dia somam (não sobrescrevem);
 *   B) dois turnos no mesmo dia somam uma vez cada;
 *   C) partição com turno NULL participa quando o turno não está filtrado;
 *   D) turno específico exclui as outras partições (recorte vem da consulta);
 *   E) unidade específica exclui as outras;
 *   F) dia sem linha na view entra com zero (eixo contínuo);
 *   G) ordem cronológica crescente;
 *   H) data civil não muda por causa de fuso/timestamp;
 *   I/J) o total da série reproduz os KPIs `scheduled`/`done` do MESMO recorte —
 *       prova de que não há double count nem subcontagem.
 */
import { describe, expect, it } from "vitest";

import {
  activityRangeIncludesToday,
  buildDailyActivitySeries,
  checklistActivityTotals,
  isChecklistActivityEmpty,
  parseChecklistActivityRows,
  type ChecklistActivityRow,
} from "../checklist-activity";
import { formatShortDay } from "../../components/dashboard/panel/filters";

/**
 * Payload no shape REAL da view (o parse recebe `unknown`): inclui `unit_id` e
 * `shift_id`, que a consulta nem seleciona mas existem na fonte — assim os casos
 * de unidade/turno são testados sobre o grão verdadeiro da view.
 */
const VIEW_ROWS = [
  // 17/set — Unidade A / Manhã
  { organization_id: "org", unit_id: "ua", shift_id: "manha", reference_date: "2026-09-17", total_scheduled_tasks: 4, completed_tasks: 3 },
  // 17/set — Unidade A / Noite
  { organization_id: "org", unit_id: "ua", shift_id: "noite", reference_date: "2026-09-17", total_scheduled_tasks: 2, completed_tasks: 2 },
  // 17/set — Unidade B / SEM turno (NULL): não pode sumir em "todos os turnos"
  { organization_id: "org", unit_id: "ub", shift_id: null, reference_date: "2026-09-17", total_scheduled_tasks: 6, completed_tasks: 4 },
  // 18/set — Unidade A / Manhã
  { organization_id: "org", unit_id: "ua", shift_id: "manha", reference_date: "2026-09-18", total_scheduled_tasks: 5, completed_tasks: 5 },
];

const RANGE = { startDate: "2026-09-17", endDate: "2026-09-19" };

/** Mesmo dataset, recortado como a consulta recortaria (unidade/turno). */
function recorte(rows: typeof VIEW_ROWS, filter: { unitId?: string; shiftId?: string }) {
  return rows.filter(
    (row) =>
      (!filter.unitId || row.unit_id === filter.unitId) &&
      (!filter.shiftId || row.shift_id === filter.shiftId),
  );
}

describe("A–E) agregação por dia civil sobre o grão da view", () => {
  it("A+B+C) soma todas as partições do dia (unidade × turno), inclusive turno NULL", () => {
    const series = buildDailyActivitySeries(parseChecklistActivityRows(VIEW_ROWS), RANGE);

    // 17/set: 4+2+6 programadas · 3+2+4 concluídas
    expect(series[0]).toEqual({ date: "2026-09-17", scheduled: 12, completed: 9 });
    // 18/set: 5/5
    expect(series[1]).toEqual({ date: "2026-09-18", scheduled: 5, completed: 5 });
  });

  it("D) turno específico recorta só aquela partição (as outras não somam)", () => {
    const rows = recorte(VIEW_ROWS, { shiftId: "manha" });
    const series = buildDailyActivitySeries(parseChecklistActivityRows(rows), RANGE);

    expect(series[0]).toEqual({ date: "2026-09-17", scheduled: 4, completed: 3 });
    // A partição com turno NULL fica de fora — como o domínio define.
    expect(series[0].scheduled).not.toBe(12);
  });

  it("E) unidade específica recorta só aquela unidade", () => {
    const rows = recorte(VIEW_ROWS, { unitId: "ub" });
    const series = buildDailyActivitySeries(parseChecklistActivityRows(rows), RANGE);

    expect(series[0]).toEqual({ date: "2026-09-17", scheduled: 6, completed: 4 });
    expect(series[1]).toEqual({ date: "2026-09-18", scheduled: 0, completed: 0 });
  });

  it("unidade + turno juntos não somam a mesma linha duas vezes", () => {
    const rows = recorte(VIEW_ROWS, { unitId: "ua", shiftId: "manha" });
    const series = buildDailyActivitySeries(parseChecklistActivityRows(rows), RANGE);

    expect(series[0].scheduled).toBe(4);
    expect(series[1].scheduled).toBe(5);
  });
});

describe("F–G) eixo temporal contínuo", () => {
  it("F) dia sem linha na view entra como zero — buraco não vira ausência de dado", () => {
    const series = buildDailyActivitySeries(parseChecklistActivityRows(VIEW_ROWS), RANGE);

    expect(series).toHaveLength(3);
    expect(series[2]).toEqual({ date: "2026-09-19", scheduled: 0, completed: 0 });
  });

  it("F) recorte inteiramente vazio continua produzindo o eixo completo", () => {
    const series = buildDailyActivitySeries([], RANGE);

    expect(series.map((d) => d.date)).toEqual(["2026-09-17", "2026-09-18", "2026-09-19"]);
    expect(isChecklistActivityEmpty(series)).toBe(true);
  });

  it("F) um único dia (Hoje) produz exatamente um ponto", () => {
    const series = buildDailyActivitySeries(
      parseChecklistActivityRows(VIEW_ROWS),
      { startDate: "2026-09-17", endDate: "2026-09-17" },
    );

    expect(series).toEqual([{ date: "2026-09-17", scheduled: 12, completed: 9 }]);
  });

  it("G) ordem cronológica crescente, seja qual for a ordem do payload", () => {
    const shuffled = [VIEW_ROWS[3], VIEW_ROWS[0], VIEW_ROWS[2], VIEW_ROWS[1]];
    const series = buildDailyActivitySeries(parseChecklistActivityRows(shuffled), RANGE);

    expect(series.map((d) => d.date)).toEqual(["2026-09-17", "2026-09-18", "2026-09-19"]);
  });

  it("recorte inválido (invertido/formato errado) não inventa série", () => {
    expect(buildDailyActivitySeries([], { startDate: "2026-09-19", endDate: "2026-09-17" })).toEqual([]);
    expect(buildDailyActivitySeries([], { startDate: "17/09/2026", endDate: "2026-09-19" })).toEqual([]);
  });

  it("linha fora do recorte não infla a série (o KPI também não a veria)", () => {
    const rows = parseChecklistActivityRows([
      ...VIEW_ROWS,
      { reference_date: "2026-08-31", total_scheduled_tasks: 100, completed_tasks: 100 },
    ]);
    const series = buildDailyActivitySeries(rows, RANGE);
    const totals = checklistActivityTotals(series);

    expect(totals.scheduled).toBe(17);
    expect(totals.completed).toBe(14);
  });
});

describe("H) data civil", () => {
  it("H) o dia do eixo é o `reference_date` da view, literal — sem conversão de fuso", () => {
    const series = buildDailyActivitySeries(parseChecklistActivityRows(VIEW_ROWS), {
      startDate: "2026-09-17",
      endDate: "2026-09-18",
    });

    expect(series.map((d) => d.date)).toEqual(["2026-09-17", "2026-09-18"]);
  });

  it("H) virada de horário de verão no hemisfério norte não desloca o dia", () => {
    // Nos EUA o DST começa em 08/03/2026 (02:00 locais). Um eixo construído com
    // Date/UTC erraria um dia nesse intervalo; aqui cada ponto é uma data civil.
    const series = buildDailyActivitySeries([], { startDate: "2026-03-07", endDate: "2026-03-10" });

    expect(series.map((d) => d.date)).toEqual([
      "2026-03-07",
      "2026-03-08",
      "2026-03-09",
      "2026-03-10",
    ]);
  });

  it("H) o rótulo do eixo vem da string civil (nunca de `new Date`)", () => {
    // `formatShortDay` é o formatter do eixo/tooltip: se ele parseasse a data como
    // instante, "2026-09-17" poderia virar "16 set" em fuso negativo.
    expect(formatShortDay("2026-09-17")).toBe("17 set");
    expect(formatShortDay("2026-01-01")).toBe("1 jan");
    expect(formatShortDay("2026-12-31")).toBe("31 dez");
  });
});

describe("I/J) equivalência com os KPIs do painel", () => {
  /** KPI do painel: soma das MESMAS linhas da view (nenhuma conta nova). */
  function kpisFromView(rows: ChecklistActivityRow[]) {
    return rows.reduce(
      (acc, row) => ({
        scheduled: acc.scheduled + row.total_scheduled_tasks,
        done: acc.done + row.completed_tasks,
      }),
      { scheduled: 0, done: 0 },
    );
  }

  const scenarios: Array<{ name: string; filter: { unitId?: string; shiftId?: string } }> = [
    { name: "todas as unidades / todos os turnos", filter: {} },
    { name: "unidade específica", filter: { unitId: "ua" } },
    { name: "turno específico", filter: { shiftId: "manha" } },
    { name: "unidade + turno", filter: { unitId: "ua", shiftId: "noite" } },
  ];

  for (const scenario of scenarios) {
    it(`I/J) total da série = KPI scheduled/done do recorte (${scenario.name})`, () => {
      const rows = parseChecklistActivityRows(recorte(VIEW_ROWS, scenario.filter));
      const series = buildDailyActivitySeries(rows, RANGE);
      const totals = checklistActivityTotals(series);
      const kpis = kpisFromView(rows);

      // `kpis.scheduled` do painel = soma de `total_scheduled_tasks`;
      // `kpis.done` = soma de `completed_tasks` (a série usa outro nome de campo).
      expect(totals.scheduled).toBe(kpis.scheduled);
      expect(totals.completed).toBe(kpis.done);
    });
  }
});

describe("parse fail-closed e realtime gate", () => {
  it("linha sem `reference_date` válido é descartada (nunca vira dia indefinido)", () => {
    const rows = parseChecklistActivityRows([
      { reference_date: "2026-09-17", total_scheduled_tasks: 1, completed_tasks: 1 },
      { reference_date: null, total_scheduled_tasks: 9, completed_tasks: 9 },
      { reference_date: "17/09/2026", total_scheduled_tasks: 9, completed_tasks: 9 },
      { total_scheduled_tasks: 9, completed_tasks: 9 },
      "lixo",
      null,
    ]);

    expect(rows).toEqual([
      { reference_date: "2026-09-17", total_scheduled_tasks: 1, completed_tasks: 1 },
    ]);
  });

  it("payload não-array vira série vazia (sem exceção)", () => {
    expect(parseChecklistActivityRows(null)).toEqual([]);
    expect(parseChecklistActivityRows({ data: [] })).toEqual([]);
  });

  it("contador ausente/não numérico vale 0, nunca NaN", () => {
    const series = buildDailyActivitySeries(
      parseChecklistActivityRows([
        { reference_date: "2026-09-17", total_scheduled_tasks: 3, completed_tasks: null },
      ]),
      { startDate: "2026-09-17", endDate: "2026-09-17" },
    );

    expect(series).toEqual([{ date: "2026-09-17", scheduled: 3, completed: 0 }]);
  });

  it("o realtime só vale para o recorte que inclui HOJE", () => {
    expect(activityRangeIncludesToday({ startDate: "2026-09-01", endDate: "2026-09-17" }, "2026-09-17")).toBe(true);
    expect(activityRangeIncludesToday({ startDate: "2026-09-01", endDate: "2026-09-17" }, "2026-09-18")).toBe(false);
    expect(activityRangeIncludesToday({ startDate: "2026-09-18", endDate: "2026-09-20" }, "2026-09-17")).toBe(false);
  });
});
