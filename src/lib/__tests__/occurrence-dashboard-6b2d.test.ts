/**
 * Execution 6B.2D — domínio puro das rotinas agendadas.
 *
 * Cobre o cenário obrigatório da missão (§16) com as quatro occurrences
 * canônicas, a fronteira do dia civil (§17), o parse fail-closed das duas
 * leituras, as identidades dos KPIs, os quatro estados de exibição e a
 * separação absoluta em relação ao domínio de tarefas.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import {
  aggregateOccurrenceRowsByUnit,
  buildOccurrenceKpis,
  canLoadWorkspaceOccurrenceMetrics,
  checkOccurrenceKpiIdentities,
  deriveOccurrenceDashboardStatus,
  filterOccurrencesByShift,
  filterOccurrencesByStatus,
  formatOccurrenceDashboardStatus,
  loadUnitOccurrenceMetrics,
  loadWorkspaceExecutionOccurrences,
  parseUnitOccurrenceDayRows,
  parseWorkspaceExecutionOccurrences,
  sortOccurrencesByDue,
  type UnitOccurrenceDayRow,
  type WorkspaceExecutionOccurrence,
} from "../occurrence-dashboard";

const ORG = "11111111-1111-4111-8111-111111111111";
const UNIT_A = "22222222-2222-4222-8222-222222222222";
const UNIT_B = "33333333-3333-4333-8333-333333333333";
const DAY = "2026-09-13";

describe("6B.2D — parse fail-closed da view", () => {
  const valid: UnitOccurrenceDayRow = {
    organization_id: ORG,
    unit_id: UNIT_A,
    unit_name: "Unidade A",
    reference_date: DAY,
    total_occurrences: 4,
    completed_occurrences: 2,
    completed_on_time: 1,
    completed_late: 1,
    overdue_open_occurrences: 1,
    pending_open_occurrences: 1,
    due_occurrences: 3,
  };

  it("aceita uma linha íntegra", () => {
    expect(parseUnitOccurrenceDayRows([valid])).toHaveLength(1);
  });

  it("payload não-array vira lista vazia", () => {
    expect(parseUnitOccurrenceDayRows(null)).toEqual([]);
    expect(parseUnitOccurrenceDayRows({})).toEqual([]);
    expect(parseUnitOccurrenceDayRows("x")).toEqual([]);
  });

  it("descarta linha sem unidade ou sem dia de referência", () => {
    expect(parseUnitOccurrenceDayRows([{ ...valid, unit_id: null }])).toEqual([]);
    expect(parseUnitOccurrenceDayRows([{ ...valid, reference_date: "13/09/2026" }])).toEqual([]);
  });

  it("descarta métrica malformada em vez de tratar como zero", () => {
    expect(parseUnitOccurrenceDayRows([{ ...valid, total_occurrences: "4" }])).toEqual([]);
    expect(
      parseUnitOccurrenceDayRows([{ ...valid, overdue_open_occurrences: Number.NaN }]),
    ).toEqual([]);
  });

  it("descarta linha que VIOLA completed = on_time + late", () => {
    expect(parseUnitOccurrenceDayRows([{ ...valid, completed_occurrences: 3 }])).toEqual([]);
  });

  it("descarta linha que VIOLA total = completed + overdue + pending", () => {
    expect(parseUnitOccurrenceDayRows([{ ...valid, total_occurrences: 9 }])).toEqual([]);
  });

  it("trata contador ausente como zero (a view sempre envia, mas o contrato é tolerante)", () => {
    const rows = parseUnitOccurrenceDayRows([
      {
        ...valid,
        completed_occurrences: 0,
        completed_on_time: 0,
        completed_late: 0,
        overdue_open_occurrences: null,
        pending_open_occurrences: null,
        total_occurrences: 0,
      },
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0].overdue_open_occurrences).toBe(0);
  });
});

describe("6B.2D §16 — as quatro occurrences canônicas", () => {
  /**
   * A (vencida, aberta), B (futura, aberta), C (concluída no prazo) e
   * D (concluída com atraso) no MESMO dia e na MESMA unidade — exatamente como a
   * view as agrega (uma linha por workspace+unidade+dia).
   */
  const dayRow: UnitOccurrenceDayRow = {
    organization_id: ORG,
    unit_id: UNIT_A,
    unit_name: "Unidade A",
    reference_date: DAY,
    total_occurrences: 4,
    completed_occurrences: 2,
    completed_on_time: 1,
    completed_late: 1,
    overdue_open_occurrences: 1,
    pending_open_occurrences: 1,
    due_occurrences: 3,
  };

  const now = new Date("2026-09-13T18:00:00Z");
  const occurrences: WorkspaceExecutionOccurrence[] = [
    {
      occurrenceId: "aaaaaaa1-1111-4111-8111-111111111111",
      checklistId: "c1",
      dueAt: "2026-09-13T10:00:00Z",
      startedAt: null,
      completedAt: null,
    },
    {
      occurrenceId: "bbbbbbb2-2222-4222-8222-222222222222",
      checklistId: "c1",
      dueAt: "2026-09-13T23:00:00Z",
      startedAt: null,
      completedAt: null,
    },
    {
      occurrenceId: "ccccccc3-3333-4333-8333-333333333333",
      checklistId: "c1",
      dueAt: "2026-09-13T12:00:00Z",
      startedAt: "2026-09-13T11:00:00Z",
      completedAt: "2026-09-13T11:30:00Z",
    },
    {
      occurrenceId: "ddddddd4-4444-4444-8444-444444444444",
      checklistId: "c1",
      dueAt: "2026-09-13T12:00:00Z",
      startedAt: "2026-09-13T12:30:00Z",
      completedAt: "2026-09-13T13:30:00Z",
    },
  ].map((o) => ({
    occurrenceId: o.occurrenceId,
    scheduleId: null,
    checklistId: o.checklistId,
    checklistTitle: "Rotina",
    occurrenceDate: DAY,
    dueAt: o.dueAt,
    startedAt: o.startedAt,
    completedAt: o.completedAt,
    responseId: null,
    unitId: UNIT_A,
    shiftId: null,
    shiftName: null,
    workspaceMemberId: null,
    responsibleName: null,
  }));

  it("classifica cada occurrence no estado correto", () => {
    expect(deriveOccurrenceDashboardStatus(occurrences[0], now)).toBe("atrasada");
    expect(deriveOccurrenceDashboardStatus(occurrences[1], now)).toBe("pendente");
    expect(deriveOccurrenceDashboardStatus(occurrences[2], now)).toBe("concluida_no_prazo");
    expect(deriveOccurrenceDashboardStatus(occurrences[3], now)).toBe("concluida_com_atraso");
  });

  it("produz exatamente os números exigidos pela missão", () => {
    const rows = aggregateOccurrenceRowsByUnit(parseUnitOccurrenceDayRows([dayRow]));
    const kpis = buildOccurrenceKpis(rows);
    expect(kpis).toMatchObject({
      total: 4,
      completed: 2,
      completedOnTime: 1,
      completedLate: 1,
      overdueOpen: 1,
      pendingOpen: 1,
      due: 3,
      units: 1,
    });
    expect(checkOccurrenceKpiIdentities(kpis)).toEqual([]);
  });

  it("A (aberta em atraso) NÃO é o mesmo que D (concluída com atraso)", () => {
    const rows = aggregateOccurrenceRowsByUnit(parseUnitOccurrenceDayRows([dayRow]));
    const kpis = buildOccurrenceKpis(rows);
    expect(kpis.overdueOpen).toBe(1); // A ainda exige ação
    expect(kpis.completedLate).toBe(1); // D é história
    expect(formatOccurrenceDashboardStatus("atrasada")).toBe("Atrasada");
    expect(formatOccurrenceDashboardStatus("concluida_com_atraso")).toBe("Concluída com atraso");
  });

  it("started_at NUNCA conclui: iniciada mas não concluída continua pendente/atrasada", () => {
    const started = {
      dueAt: "2026-09-13T23:00:00Z",
      startedAt: "2026-09-13T17:00:00Z",
      completedAt: null,
    };
    expect(deriveOccurrenceDashboardStatus(started, now)).toBe("pendente");
    const startedLate = {
      dueAt: "2026-09-13T10:00:00Z",
      startedAt: "2026-09-13T17:00:00Z",
      completedAt: null,
    };
    expect(deriveOccurrenceDashboardStatus(startedLate, now)).toBe("atrasada");
  });

  it("completed_at sem comparação possível com due_at não inventa atraso", () => {
    const broken = { dueAt: "não-é-data", startedAt: null, completedAt: "2026-09-13T13:00:00Z" };
    expect(deriveOccurrenceDashboardStatus(broken, now)).toBe("concluida_no_prazo");
  });
});

describe("6B.2D §17 — dia civil, nunca o dia UTC de due_at", () => {
  it("preserva o reference_date recebido mesmo quando due_at cai em outro dia UTC", () => {
    // 23:00 no dia 13 em São Paulo (UTC-3) = 02:00Z no dia 14.
    const rows = parseUnitOccurrenceDayRows([
      {
        organization_id: ORG,
        unit_id: UNIT_A,
        unit_name: "Unidade A",
        reference_date: "2026-09-13",
        due_at: "2026-09-14T02:00:00Z",
        total_occurrences: 1,
        completed_occurrences: 0,
        completed_on_time: 0,
        completed_late: 0,
        overdue_open_occurrences: 1,
        pending_open_occurrences: 0,
        due_occurrences: 1,
      },
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0].reference_date).toBe("2026-09-13");
  });

  it("soma os dias da mesma unidade sem remapear por due_at", () => {
    const base = {
      organization_id: ORG,
      unit_id: UNIT_A,
      unit_name: "Unidade A",
      completed_occurrences: 0,
      completed_on_time: 0,
      completed_late: 0,
      pending_open_occurrences: 0,
      overdue_open_occurrences: 1,
      due_occurrences: 1,
      total_occurrences: 1,
    };
    const rows = aggregateOccurrenceRowsByUnit(
      parseUnitOccurrenceDayRows([
        { ...base, reference_date: "2026-09-13" },
        { ...base, reference_date: "2026-09-14" },
      ]),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].totalOccurrences).toBe(2);
    expect(rows[0].overdueOpenOccurrences).toBe(2);
  });
});

describe("6B.2D — agregação, KPIs e gate", () => {
  const row = (
    unitId: string,
    unitName: string,
    k: Partial<UnitOccurrenceDayRow>,
  ): UnitOccurrenceDayRow => ({
    organization_id: ORG,
    unit_id: unitId,
    unit_name: unitName,
    reference_date: DAY,
    total_occurrences: 0,
    completed_occurrences: 0,
    completed_on_time: 0,
    completed_late: 0,
    overdue_open_occurrences: 0,
    pending_open_occurrences: 0,
    due_occurrences: 0,
    ...k,
  });

  it("agrupa por unidade e ordena por nome", () => {
    const rows = aggregateOccurrenceRowsByUnit([
      row(UNIT_B, "Unidade B", { total_occurrences: 1, pending_open_occurrences: 1 }),
      row(UNIT_A, "Unidade A", {
        total_occurrences: 2,
        completed_occurrences: 1,
        completed_on_time: 1,
        pending_open_occurrences: 1,
      }),
    ]);
    expect(rows.map((r) => r.unitName)).toEqual(["Unidade A", "Unidade B"]);
    expect(rows[0].totalOccurrences).toBe(2);
    expect(rows[1].totalOccurrences).toBe(1);
  });

  it("as identidades valem na agregação multi-dia e multi-unidade", () => {
    const rows = aggregateOccurrenceRowsByUnit([
      row(UNIT_A, "A", {
        total_occurrences: 4,
        completed_occurrences: 2,
        completed_on_time: 1,
        completed_late: 1,
        overdue_open_occurrences: 1,
        pending_open_occurrences: 1,
        due_occurrences: 3,
      }),
      row(UNIT_B, "B", {
        total_occurrences: 3,
        completed_occurrences: 1,
        completed_on_time: 0,
        completed_late: 1,
        overdue_open_occurrences: 2,
        pending_open_occurrences: 0,
        due_occurrences: 3,
      }),
    ]);
    const kpis = buildOccurrenceKpis(rows);
    expect(checkOccurrenceKpiIdentities(kpis)).toEqual([]);
    expect(kpis.total).toBe(7);
    expect(kpis.units).toBe(2);
  });

  it("detecta violação de identidade", () => {
    expect(
      checkOccurrenceKpiIdentities({
        total: 5,
        completed: 2,
        completedOnTime: 1,
        completedLate: 1,
        overdueOpen: 1,
        pendingOpen: 1,
        due: 0,
        units: 1,
      }),
    ).toContain("total = completed + overdue_open + pending_open");
  });

  it("gate: só consulta com autenticação, admin e workspace", () => {
    expect(
      canLoadWorkspaceOccurrenceMetrics({ isAuthenticated: true, isAdmin: true, workspaceId: ORG }),
    ).toBe(true);
    expect(
      canLoadWorkspaceOccurrenceMetrics({
        isAuthenticated: false,
        isAdmin: true,
        workspaceId: ORG,
      }),
    ).toBe(false);
    expect(
      canLoadWorkspaceOccurrenceMetrics({
        isAuthenticated: true,
        isAdmin: false,
        workspaceId: ORG,
      }),
    ).toBe(false);
    expect(
      canLoadWorkspaceOccurrenceMetrics({ isAuthenticated: true, isAdmin: true, workspaceId: "" }),
    ).toBe(false);
    expect(
      canLoadWorkspaceOccurrenceMetrics({
        isAuthenticated: true,
        isAdmin: true,
        workspaceId: null,
      }),
    ).toBe(false);
  });
});

describe("6B.2D — parse da RPC de detalhe", () => {
  const rawRow = {
    occurrence_id: "aaaaaaaa-1111-4111-8111-111111111111",
    schedule_id: "bbbbbbbb-2222-4222-8222-222222222222",
    checklist_id: "cccccccc-3333-4333-8333-333333333333",
    checklist_title: "Abertura de loja",
    occurrence_date: DAY,
    due_at: "2026-09-13T12:00:00Z",
    started_at: null,
    completed_at: null,
    response_id: null,
    unit_id: UNIT_A,
    shift_id: null,
    shift_name: null,
    workspace_member_id: "dddddddd-4444-4444-8444-444444444444",
    responsible_name: "Ana",
  };

  it("aceita a linha completa", () => {
    const parsed = parseWorkspaceExecutionOccurrences([rawRow]);
    expect(parsed).toHaveLength(1);
    expect(parsed[0]).toMatchObject({
      checklistTitle: "Abertura de loja",
      occurrenceDate: DAY,
      responsibleName: "Ana",
      shiftName: null,
    });
  });

  it("tolera responsável e turno ausentes (rotina sem turno é válida)", () => {
    const parsed = parseWorkspaceExecutionOccurrences([
      { ...rawRow, responsible_name: null, shift_id: null, shift_name: null },
    ]);
    expect(parsed).toHaveLength(1);
    expect(parsed[0].responsibleName).toBeNull();
  });

  it("usa título de fallback quando ausente", () => {
    const parsed = parseWorkspaceExecutionOccurrences([{ ...rawRow, checklist_title: "" }]);
    expect(parsed[0].checklistTitle).toBe("Checklist sem título");
  });

  it("descarta linha sem identidade acionável", () => {
    expect(parseWorkspaceExecutionOccurrences([{ ...rawRow, occurrence_id: null }])).toEqual([]);
    expect(parseWorkspaceExecutionOccurrences([{ ...rawRow, checklist_id: "nope" }])).toEqual([]);
    expect(parseWorkspaceExecutionOccurrences([{ ...rawRow, occurrence_date: null }])).toEqual([]);
    expect(parseWorkspaceExecutionOccurrences([{ ...rawRow, due_at: "ontem" }])).toEqual([]);
  });

  it("descarta timestamp presente mas inválido em vez de mentir o lifecycle", () => {
    expect(parseWorkspaceExecutionOccurrences([{ ...rawRow, completed_at: "13/09/2026" }])).toEqual(
      [],
    );
    expect(parseWorkspaceExecutionOccurrences([{ ...rawRow, started_at: "13/09/2026" }])).toEqual(
      [],
    );
  });
});

describe("6B.2D — filtros e ordenação do detalhe", () => {
  const occ = (over: Partial<WorkspaceExecutionOccurrence>): WorkspaceExecutionOccurrence => ({
    occurrenceId: "aaaaaaaa-1111-4111-8111-111111111111",
    scheduleId: null,
    checklistId: "cccccccc-3333-4333-8333-333333333333",
    checklistTitle: "Rotina",
    occurrenceDate: DAY,
    dueAt: "2026-09-13T12:00:00Z",
    startedAt: null,
    completedAt: null,
    responseId: null,
    unitId: UNIT_A,
    shiftId: null,
    shiftName: null,
    workspaceMemberId: null,
    responsibleName: null,
    ...over,
  });

  const now = new Date("2026-09-13T18:00:00Z");
  const morning = occ({
    occurrenceId: "aaaaaaaa-1111-4111-8111-111111111111",
    shiftId: "s1",
    shiftName: "Manhã",
  });
  const night = occ({
    occurrenceId: "bbbbbbbb-2222-4222-8222-222222222222",
    shiftId: "s2",
    shiftName: "Noite",
  });
  const noShift = occ({
    occurrenceId: "cccccccc-3333-4333-8333-333333333333",
    shiftId: null,
    shiftName: null,
  });

  it("turno 'all' não filtra; turno específico exige o turno exato", () => {
    expect(filterOccurrencesByShift([morning, night, noShift], "all")).toHaveLength(3);
    expect(
      filterOccurrencesByShift([morning, night, noShift], "s2").map((o) => o.occurrenceId),
    ).toEqual([night.occurrenceId]);
  });

  it("status da rotina é filtro próprio (quatro estados)", () => {
    const list = [
      occ({ occurrenceId: "11111111-1111-4111-8111-111111111111", dueAt: "2026-09-13T10:00:00Z" }),
      occ({ occurrenceId: "22222222-2222-4222-8222-222222222222", dueAt: "2026-09-13T23:00:00Z" }),
      occ({
        occurrenceId: "33333333-3333-4333-8333-333333333333",
        dueAt: "2026-09-13T12:00:00Z",
        completedAt: "2026-09-13T11:00:00Z",
      }),
      occ({
        occurrenceId: "44444444-4444-4444-8444-444444444444",
        dueAt: "2026-09-13T12:00:00Z",
        completedAt: "2026-09-13T13:00:00Z",
      }),
    ];
    expect(filterOccurrencesByStatus(list, "all", now)).toHaveLength(4);
    expect(filterOccurrencesByStatus(list, "atrasada", now)).toHaveLength(1);
    expect(filterOccurrencesByStatus(list, "pendente", now)).toHaveLength(1);
    expect(filterOccurrencesByStatus(list, "concluida_no_prazo", now)).toHaveLength(1);
    expect(filterOccurrencesByStatus(list, "concluida_com_atraso", now)).toHaveLength(1);
  });

  it("ordena por vencimento com desempate determinístico", () => {
    const late = occ({
      occurrenceId: "99999999-9999-4999-8999-999999999999",
      dueAt: "2026-09-13T08:00:00Z",
    });
    const early = occ({
      occurrenceId: "88888888-8888-4888-8888-888888888888",
      dueAt: "2026-09-13T09:00:00Z",
    });
    expect(sortOccurrencesByDue([early, late]).map((o) => o.occurrenceId)).toEqual([
      late.occurrenceId,
      early.occurrenceId,
    ]);
  });
});

describe("6B.2D — orquestradores fail-closed", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("métricas: sem workspace não consulta", async () => {
    const fetchRows = vi.fn();
    const r = await loadUnitOccurrenceMetrics(
      { fetchRows },
      { organizationId: null, startDate: DAY, endDate: DAY },
    );
    expect(fetchRows).not.toHaveBeenCalled();
    expect(r).toEqual({ rows: [], error: false });
  });

  it("métricas: erro da leitura NÃO vira zero silencioso", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const r = await loadUnitOccurrenceMetrics(
      { fetchRows: async () => ({ data: null, error: { message: "relation does not exist" } }) },
      { organizationId: ORG, startDate: DAY, endDate: DAY, unitId: UNIT_A },
    );
    expect(r).toEqual({ rows: [], error: true });
  });

  it("métricas: payload inválido é erro, não vazio", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const r = await loadUnitOccurrenceMetrics(
      { fetchRows: async () => ({ data: { nope: true }, error: null }) },
      { organizationId: ORG, startDate: DAY, endDate: DAY },
    );
    expect(r.error).toBe(true);
  });

  it("métricas: sucesso agrega por unidade", async () => {
    const r = await loadUnitOccurrenceMetrics(
      {
        fetchRows: async () => ({
          data: [
            {
              organization_id: ORG,
              unit_id: UNIT_A,
              unit_name: "Unidade A",
              reference_date: DAY,
              total_occurrences: 2,
              completed_occurrences: 1,
              completed_on_time: 1,
              completed_late: 0,
              overdue_open_occurrences: 1,
              pending_open_occurrences: 0,
              due_occurrences: 2,
            },
          ],
          error: null,
        }),
      },
      { organizationId: ORG, startDate: DAY, endDate: DAY },
    );
    expect(r.error).toBe(false);
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0].completedOccurrences).toBe(1);
  });

  it("detalhe: sem unidade ou sem workspace não consulta", async () => {
    const fetchOccurrences = vi.fn();
    expect(
      await loadWorkspaceExecutionOccurrences(
        { fetchOccurrences },
        { organizationId: ORG, unitId: null, startDate: DAY, endDate: DAY },
      ),
    ).toEqual({ occurrences: [], error: false });
    expect(
      await loadWorkspaceExecutionOccurrences(
        { fetchOccurrences },
        { organizationId: null, unitId: UNIT_A, startDate: DAY, endDate: DAY },
      ),
    ).toEqual({ occurrences: [], error: false });
    expect(fetchOccurrences).not.toHaveBeenCalled();
  });

  it("detalhe: erro da RPC é erro explícito", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const r = await loadWorkspaceExecutionOccurrences(
      {
        fetchOccurrences: async () => ({
          data: null,
          error: { message: "permission denied for function" },
        }),
      },
      { organizationId: ORG, unitId: UNIT_A, startDate: DAY, endDate: DAY },
    );
    expect(r).toEqual({ occurrences: [], error: true });
  });

  it("detalhe: sucesso devolve a lista ordenada por vencimento", async () => {
    const mk = (id: string, due: string) => ({
      occurrence_id: id,
      schedule_id: null,
      checklist_id: "cccccccc-3333-4333-8333-333333333333",
      checklist_title: "Rotina",
      occurrence_date: DAY,
      due_at: due,
      started_at: null,
      completed_at: null,
      response_id: null,
      unit_id: UNIT_A,
      shift_id: null,
      shift_name: null,
      workspace_member_id: null,
      responsible_name: null,
    });
    const r = await loadWorkspaceExecutionOccurrences(
      {
        fetchOccurrences: async () => ({
          data: [
            mk("22222222-2222-4222-8222-222222222222", "2026-09-13T20:00:00Z"),
            mk("11111111-1111-4111-8111-111111111111", "2026-09-13T08:00:00Z"),
          ],
          error: null,
        }),
      },
      { organizationId: ORG, unitId: UNIT_A, startDate: DAY, endDate: DAY },
    );
    expect(r.error).toBe(false);
    expect(r.occurrences.map((o) => o.occurrenceId)).toEqual([
      "11111111-1111-4111-8111-111111111111",
      "22222222-2222-4222-8222-222222222222",
    ]);
  });
});
