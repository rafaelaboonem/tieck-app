/**
 * 6B.2J — EXECUÇÃO POR CHECKLIST: lógica pura (sem rede, sem React).
 *
 * Cobre os casos de contrato sobre `checklist-execution-metrics.ts`:
 * soma por checklist (a RPC já agrupa; o parser NÃO re-agrega nem deduplica),
 * identidade por id (títulos iguais não fundem), shift NULL válido, taxa
 * due_completed/due com null quando não há devidas, invariantes do lifecycle,
 * payload malformado E semanticamente impossível rejeitado (fail-closed,
 * sem clamp), UUID opcional distinguindo ausência de id inválido e
 * ordenação estável.
 */
import { describe, it, expect } from "vitest";

import {
  parseChecklistExecutionMetrics,
  dueExecutionRate,
  sortChecklistMetricsByTitle,
  checklistMetricTitle,
  type ChecklistExecutionMetricRow,
} from "../checklist-execution-metrics";

const ID_A = "11111111-1111-4111-8111-111111111111";
const ID_B = "22222222-2222-4222-8222-222222222222";
const ID_C = "33333333-3333-4333-8333-333333333333";
const UNIT_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const UNIT_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const SHIFT_MORNING = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const SHIFT_NIGHT = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";

/** Linha EXATAMENTE como a RPC 6B.2J devolve (bigint serializa como string). */
function row(overrides: Partial<ChecklistExecutionMetricRow> = {}): ChecklistExecutionMetricRow {
  return {
    checklist_id: ID_A,
    checklist_title: "Abertura da unidade",
    unit_id: UNIT_A,
    unit_name: "Unidade Norte",
    shift_id: SHIFT_MORNING,
    shift_name: "Manhã",
    total_occurrences: "20",
    completed_occurrences: "18",
    completed_on_time: "16",
    completed_late: "2",
    overdue_open_occurrences: "1",
    pending_open_occurrences: "1",
    due_occurrences: "19",
    due_completed_occurrences: "18",
    ...overrides,
  };
}

describe("6B.2J parser — agregação chega pronta da RPC", () => {
  it("A) preserva as ocorrências somadas pelo banco (não re-agrega nem deduplica)", () => {
    // Duas occurrences do MESMO checklist já chegam somadas em UMA linha.
    const parsed = parseChecklistExecutionMetrics([
      row({ total_occurrences: "2", completed_occurrences: "2", completed_on_time: "2", completed_late: "0", overdue_open_occurrences: "0", pending_open_occurrences: "0", due_occurrences: "2", due_completed_occurrences: "2" }),
    ]);
    expect(parsed).toHaveLength(1);
    expect(parsed[0]?.checklistId).toBe(ID_A);
    expect(parsed[0]?.totalOccurrences).toBe(2);
    expect(parsed[0]?.completedOccurrences).toBe(2);
  });

  it("A) payload com duas linhas do mesmo id atravessa SEM dedupe — somar é papel do consumidor (a RPC garante 1 linha por checklist_id)", () => {
    const parsed = parseChecklistExecutionMetrics([
      row({ total_occurrences: "10", completed_occurrences: "8", completed_on_time: "7", completed_late: "1", overdue_open_occurrences: "1", pending_open_occurrences: "1", due_occurrences: "10", due_completed_occurrences: "8" }),
      row({ total_occurrences: "10", completed_occurrences: "7", completed_on_time: "6", completed_late: "1", overdue_open_occurrences: "2", pending_open_occurrences: "1", due_occurrences: "9", due_completed_occurrences: "7" }),
    ]);
    const total = parsed.reduce((acc, m) => acc + m.totalOccurrences, 0);
    const completed = parsed.reduce((acc, m) => acc + m.completedOccurrences, 0);
    expect(parsed).toHaveLength(2);
    expect(total).toBe(20);
    expect(completed).toBe(15);
  });

  it("B) dois checklists com o mesmo título NÃO se fundem", () => {
    const parsed = parseChecklistExecutionMetrics([
      row({ checklist_id: ID_A, checklist_title: "Fechamento" }),
      row({ checklist_id: ID_B, checklist_title: "Fechamento" }),
    ]);
    expect(parsed).toHaveLength(2);
    expect(new Set(parsed.map((m) => m.checklistId)).size).toBe(2);
  });

  it("C) múltiplos dias chegam somados por checklist (grão é checklist, não dia)", () => {
    // 3 dias × 4 ocorrências = 12, já agregadas pelo GROUP BY do banco.
    const parsed = parseChecklistExecutionMetrics([
      row({ total_occurrences: "12", completed_occurrences: "9", completed_on_time: "8", completed_late: "1", overdue_open_occurrences: "2", pending_open_occurrences: "1", due_occurrences: "12", due_completed_occurrences: "9" }),
    ]);
    expect(parsed[0]?.totalOccurrences).toBe(12);
    expect(parsed[0]?.dueOccurrences).toBe(12);
  });

  it("D) múltiplas unidades permanecem separadas por checklist_id", () => {
    const parsed = parseChecklistExecutionMetrics([
      row({ checklist_id: ID_A, unit_id: UNIT_A, unit_name: "Unidade Norte" }),
      row({ checklist_id: ID_B, unit_id: UNIT_B, unit_name: "Unidade Sul" }),
    ]);
    expect(parsed.map((m) => m.unitId)).toEqual([UNIT_A, UNIT_B]);
  });

  it("E) shift NULL é partição real e válida", () => {
    const parsed = parseChecklistExecutionMetrics([
      row({ shift_id: null, shift_name: null }),
    ]);
    expect(parsed[0]?.shiftId).toBeNull();
    expect(parsed[0]?.shiftName).toBeNull();
  });

  it("N) identidade vem do id, nunca inferida do título", () => {
    const parsed = parseChecklistExecutionMetrics([
      row({ checklist_id: ID_A, checklist_title: "Mesmo título" }),
      row({ checklist_id: ID_C, checklist_title: "Mesmo título" }),
    ]);
    const ids = parsed.map((m) => m.checklistId).sort();
    expect(ids).toEqual([ID_A, ID_C].sort());
  });

  it("M) payload malformado é rejeitado (fail-closed): id inválido, contador ausente/negativo/não-inteiro", () => {
    expect(parseChecklistExecutionMetrics(null)).toEqual([]);
    expect(parseChecklistExecutionMetrics(undefined)).toEqual([]);
    expect(parseChecklistExecutionMetrics("x" as unknown as unknown[])).toEqual([]);
    expect(parseChecklistExecutionMetrics({} as unknown as unknown[])).toEqual([]);
    expect(parseChecklistExecutionMetrics([{ checklist_id: "nao-uuid", total_occurrences: "1" }])).toEqual([]);
    expect(parseChecklistExecutionMetrics([row({ total_occurrences: null })])).toEqual([]);
    expect(parseChecklistExecutionMetrics([row({ completed_occurrences: "-1" })])).toEqual([]);
    expect(parseChecklistExecutionMetrics([row({ due_occurrences: 1.5 })])).toEqual([]);
    expect(parseChecklistExecutionMetrics([row({ due_completed_occurrences: "muito" })])).toEqual([]);
    expect(parseChecklistExecutionMetrics([row({ checklist_id: null })])).toEqual([]);
    // Linha boa sobrevive ao lado da ruim.
    const mixed = parseChecklistExecutionMetrics([row(), row({ checklist_id: "x" })]);
    expect(mixed).toHaveLength(1);
  });
});

describe("6B.2J invariantes semânticas do parser (fail-closed, sem clamp)", () => {
  it("rejeita completed != on_time + late", () => {
    expect(
      parseChecklistExecutionMetrics([
        row({ completed_occurrences: "10", completed_on_time: "3", completed_late: "2" }),
      ]),
    ).toEqual([]);
  });

  it("rejeita total != completed + overdue_open + pending_open", () => {
    // 19 ≠ 18 concluídas + 1 + 1 = 20; due=19 ≤ total e due_completed ok.
    expect(parseChecklistExecutionMetrics([row({ total_occurrences: "19" })])).toEqual([]);
  });

  it("rejeita due_occurrences > total_occurrences", () => {
    expect(parseChecklistExecutionMetrics([row({ due_occurrences: "25" })])).toEqual([]);
  });

  it("rejeita due_completed_occurrences > due_occurrences", () => {
    // 12 > 10 devidas, mas 12 ≤ 18 concluídas — só esta regra falha.
    expect(
      parseChecklistExecutionMetrics([row({ due_occurrences: "10", due_completed_occurrences: "12" })]),
    ).toEqual([]);
  });

  it("rejeita due_completed_occurrences > completed_occurrences (única regra violada)", () => {
    // 10 concluídas (8+2), 5 abertas em atraso, 5 pendentes → total 20;
    // 15 devidas com 12 concluídas: só due_completed > completed falha.
    expect(
      parseChecklistExecutionMetrics([
        row({
          total_occurrences: "20",
          completed_occurrences: "10",
          completed_on_time: "8",
          completed_late: "2",
          overdue_open_occurrences: "5",
          pending_open_occurrences: "5",
          due_occurrences: "15",
          due_completed_occurrences: "12",
        }),
      ]),
    ).toEqual([]);
  });

  it("linha boa sobrevive ao lado de uma semanticamente impossível", () => {
    const parsed = parseChecklistExecutionMetrics([
      row(),
      row({ checklist_id: ID_B, completed_occurrences: "10", completed_on_time: "3", completed_late: "2" }),
    ]);
    expect(parsed).toHaveLength(1);
    expect(parsed[0]?.checklistId).toBe(ID_A);
  });
});

describe("6B.2J UUID opcional — ausência legítima != id inválido", () => {
  it("unit_id ausente/null é válido (unitId null)", () => {
    const parsed = parseChecklistExecutionMetrics([row({ unit_id: null, unit_name: null })]);
    expect(parsed).toHaveLength(1);
    expect(parsed[0]?.unitId).toBeNull();
  });

  it("shift_id ausente/undefined é válido (shiftId null)", () => {
    const parsed = parseChecklistExecutionMetrics([row({ shift_id: undefined, shift_name: undefined })]);
    expect(parsed).toHaveLength(1);
    expect(parsed[0]?.shiftId).toBeNull();
  });

  it("unit_id presente porém inválido descarta a linha", () => {
    expect(parseChecklistExecutionMetrics([row({ unit_id: "abc" })])).toEqual([]);
    expect(parseChecklistExecutionMetrics([row({ unit_id: 42 as unknown as string })])).toEqual([]);
  });

  it("shift_id presente porém inválido descarta a linha (nunca vira bucket 'sem turno')", () => {
    expect(parseChecklistExecutionMetrics([row({ shift_id: "abc" })])).toEqual([]);
    expect(parseChecklistExecutionMetrics([row({ shift_id: "" })])).toEqual([]);
  });

  it("id inválido numa linha não derruba a linha boa vizinha", () => {
    const parsed = parseChecklistExecutionMetrics([
      row(),
      row({ checklist_id: ID_B, shift_id: "abc" }),
    ]);
    expect(parsed).toHaveLength(1);
    expect(parsed[0]?.checklistId).toBe(ID_A);
  });
});

describe("6B.2J dueExecutionRate — taxa das ocorrências devidas", () => {
  it("H) usa due_completed / due (não completed/total)", () => {
    // completed/total daria 18/20 = 90%; a taxa correta é 18/19 = 94.7%.
    const metric = parseChecklistExecutionMetrics([row()])[0];
    expect(dueExecutionRate(metric!)).toBe(94.7);
  });

  it("I) ocorrência futura dentro do período não reduz a taxa", () => {
    // 18 concluídas de 19 devidas; a 20ª (futura) fica fora do denominador.
    const metric = parseChecklistExecutionMetrics([
      row({ total_occurrences: "20", pending_open_occurrences: "1", due_occurrences: "19", due_completed_occurrences: "18" }),
    ])[0];
    expect(metric?.totalOccurrences).toBe(20);
    expect(dueExecutionRate(metric!)).toBe(94.7);
  });

  it("I) período 100% futuro (nada devido ainda) não é 0%", () => {
    const metric = parseChecklistExecutionMetrics([
      row({ completed_occurrences: "0", completed_on_time: "0", completed_late: "0", overdue_open_occurrences: "0", pending_open_occurrences: "20", due_occurrences: "0", due_completed_occurrences: "0" }),
    ])[0];
    expect(dueExecutionRate(metric!)).toBeNull();
  });

  it("J) due_occurrences = 0 → null (nunca 0%)", () => {
    const metric = parseChecklistExecutionMetrics([
      row({ due_occurrences: "0", due_completed_occurrences: "0" }),
    ])[0];
    expect(dueExecutionRate(metric!)).toBeNull();
  });

  it("taxa com uma casa decimal (round, não truncate)", () => {
    // 2/3 = 66.666… → 66.7
    const metric = parseChecklistExecutionMetrics([
      row({ due_occurrences: "3", due_completed_occurrences: "2" }),
    ])[0];
    expect(dueExecutionRate(metric!)).toBe(66.7);
    // 100% exato permanece inteiro na leitura (100 → 100).
    const full = parseChecklistExecutionMetrics([
      row({ due_occurrences: "4", due_completed_occurrences: "4" }),
    ])[0];
    expect(dueExecutionRate(full!)).toBe(100);
  });
});

describe("6B.2J invariantes do lifecycle (5E.2A)", () => {
  it("K) completed = on_time + late", () => {
    const metric = parseChecklistExecutionMetrics([row()])[0]!;
    expect(metric.completedOccurrences).toBe(metric.completedOnTime + metric.completedLate);
  });

  it("L) total = completed + overdue_open + pending_open", () => {
    const metric = parseChecklistExecutionMetrics([row()])[0]!;
    expect(metric.totalOccurrences).toBe(
      metric.completedOccurrences + metric.overdueOpenOccurrences + metric.pendingOpenOccurrences,
    );
  });

  it("K/L valem para qualquer combinação coerente do banco", () => {
    const metric = parseChecklistExecutionMetrics([
      row({
        total_occurrences: "7",
        completed_occurrences: "3",
        completed_on_time: "1",
        completed_late: "2",
        overdue_open_occurrences: "3",
        pending_open_occurrences: "1",
        due_occurrences: "5",
        due_completed_occurrences: "2",
      }),
    ])[0]!;
    expect(metric.completedOccurrences).toBe(metric.completedOnTime + metric.completedLate);
    expect(metric.totalOccurrences).toBe(
      metric.completedOccurrences + metric.overdueOpenOccurrences + metric.pendingOpenOccurrences,
    );
    // Devidas nunca excedem o total.
    expect(metric.dueOccurrences).toBeLessThanOrEqual(metric.totalOccurrences);
    expect(metric.dueCompletedOccurrences).toBeLessThanOrEqual(metric.completedOccurrences);
  });
});

describe("6B.2J ordenação estável (sem ranking)", () => {
  it("ordena alfabético por título, desempatando pelo checklist_id", () => {
    const parsed = parseChecklistExecutionMetrics([
      row({ checklist_id: ID_B, checklist_title: "Fechamento" }),
      row({ checklist_id: ID_A, checklist_title: "Abertura" }),
      row({ checklist_id: ID_C, checklist_title: "Fechamento" }),
    ]);
    const sorted = sortChecklistMetricsByTitle(parsed);
    // Os dois "Fechamento" (B e C) ordenam por id: B < C lexicograficamente.
    expect(sorted.map((m) => m.checklistId)).toEqual([ID_A, ID_B, ID_C]);
    // Estável: re-ordenar não altera (id desempata sempre na mesma direção).
    expect(sortChecklistMetricsByTitle(sorted).map((m) => m.checklistId)).toEqual([ID_A, ID_B, ID_C]);
  });

  it("título ausente vai por último, também desempatado por id", () => {
    const parsed = parseChecklistExecutionMetrics([
      row({ checklist_id: ID_B, checklist_title: null }),
      row({ checklist_id: ID_C, checklist_title: null }),
      row({ checklist_id: ID_A, checklist_title: "Abertura" }),
    ]);
    const sorted = sortChecklistMetricsByTitle(parsed);
    expect(sorted.map((m) => m.checklistId)).toEqual([ID_A, ID_B, ID_C]);
  });

  it("não muta a entrada", () => {
    const parsed = parseChecklistExecutionMetrics([
      row({ checklist_id: ID_B, checklist_title: "Z" }),
      row({ checklist_id: ID_A, checklist_title: "A" }),
    ]);
    const before = parsed.map((m) => m.checklistId);
    sortChecklistMetricsByTitle(parsed);
    expect(parsed.map((m) => m.checklistId)).toEqual(before);
  });

  it("título ausente tem rótulo de apresentação sem inventar identidade", () => {
    const metric = parseChecklistExecutionMetrics([row({ checklist_title: null })])[0]!;
    expect(metric.checklistTitle).toBeNull();
    expect(checklistMetricTitle(metric)).toBeTruthy();
  });
});
