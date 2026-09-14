/**
 * Execution 6B.3 — turno como dimensão de ESCOPO nos hooks analíticos.
 *
 * Prova que o filtro de turno:
 *
 *   1. vira um filtro real na consulta (`.eq("shift_id", ...)`) apenas quando um
 *      turno é selecionado — sem turno, nenhum filtro de shift_id é aplicado
 *      ("todos os turnos" inclui as linhas sem turno);
 *   2. faz parte do escopo publicado: a resposta de um turno antigo não pode
 *      sobrescrever o turno atual;
 *   3. mantém a identidade de CICLO da 6B.1B.4 — A(turno manhã) → B(noite) →
 *      A(manhã) não reabilita o callback/resposta do primeiro ciclo, mesmo com o
 *      conteúdo do escopo textualmente igual.
 *
 * As corridas usam Promises diferidas resolvidas FORA de ordem.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useUnitCompliance } from "@/hooks/useUnitCompliance";
import { useUnitOccurrenceMetrics } from "@/hooks/useUnitOccurrenceMetrics";
import { supabase } from "@/integrations/supabase/client";

const UNIT = "aaaaaaaa-1111-4111-8111-111111111111";
const ORG = "11111111-1111-4111-8111-111111111111";

type QResult = { data: unknown; error: unknown };

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const recorded: { table: string; calls: Array<[string, unknown]> }[] = [];
const queues = {
  compliance: [] as ReturnType<typeof deferred<QResult>>[],
  occurrences: [] as ReturnType<typeof deferred<QResult>>[],
};

/** Builder encadeável thenable controlado por Promise diferida. */
type QueryBuilder = {
  then: (onF: (v: QResult) => unknown, onR?: (e: unknown) => unknown) => Promise<unknown>;
  catch: (onR: (e: unknown) => unknown) => Promise<unknown>;
  finally: (cb: () => void) => Promise<unknown>;
  select: (...args: unknown[]) => QueryBuilder;
  eq: (...args: unknown[]) => QueryBuilder;
  gte: (...args: unknown[]) => QueryBuilder;
  lte: (...args: unknown[]) => QueryBuilder;
  limit: (...args: unknown[]) => QueryBuilder;
  order: (...args: unknown[]) => QueryBuilder;
};

function makeBuilder(table: string): QueryBuilder {
  const calls: Array<[string, unknown]> = [];
  recorded.push({ table, calls });
  const gate = deferred<QResult>();
  const queue =
    table === "analytics_unit_daily_occurrences" ? queues.occurrences : queues.compliance;
  queue.push(gate);
  const b = {} as QueryBuilder;
  b.then = (onF, onR) => gate.promise.then(onF, onR);
  b.catch = (onR) => gate.promise.catch(onR);
  b.finally = (cb) => gate.promise.finally(cb);
  const chain =
    (name: string) =>
    (...args: unknown[]) => {
      calls.push([name, args]);
      return b;
    };
  b.select = chain("select");
  b.eq = chain("eq");
  b.gte = chain("gte");
  b.lte = chain("lte");
  b.limit = chain("limit");
  b.order = chain("order");
  return b;
}

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: vi.fn((table: string) => makeBuilder(table)),
    channel: vi.fn().mockReturnValue({
      on: vi.fn().mockReturnThis(),
      subscribe: vi.fn().mockReturnThis(),
    }),
    removeChannel: vi.fn(),
  },
}));

const drain = async () => {
  for (let i = 0; i < 12; i++) await Promise.resolve();
};

/** Linha diária de tarefas (grão com turno). */
function taskDayRow(over: Record<string, unknown> = {}) {
  return {
    organization_id: ORG,
    unit_id: UNIT,
    unit_name: "Unidade A",
    reference_date: "2026-01-02",
    shift_id: "shift-m",
    shift_name: "Manhã",
    total_scheduled_tasks: 3,
    completed_tasks: 2,
    completed_on_time: 1,
    completed_late: 1,
    overdue_open_tasks: 1,
    delayed_tasks: 2,
    critical_failures: 0,
    pending_evidences: 0,
    weight_total: 3,
    weight_done: 2,
    compliance_percentage: 66.7,
    total_due_tasks: 2,
    due_completed_tasks: 1,
    due_weight_total: 2,
    due_weight_done: 1,
    due_compliance_percentage: 50,
    ...over,
  };
}

/** Linha diária de rotinas (identidades da 6B.2D respeitadas). */
function occDayRow(over: Record<string, unknown> = {}) {
  return {
    organization_id: ORG,
    unit_id: UNIT,
    unit_name: "Unidade A",
    reference_date: "2026-01-02",
    shift_id: "shift-m",
    shift_name: "Manhã",
    total_occurrences: 2,
    completed_occurrences: 1,
    completed_on_time: 1,
    completed_late: 0,
    overdue_open_occurrences: 1,
    pending_open_occurrences: 0,
    due_occurrences: 2,
    ...over,
  };
}

function lastCalls(table: string): Array<[string, unknown]> {
  const entry = [...recorded].reverse().find((r) => r.table === table);
  return entry ? entry.calls : [];
}

function hasFilter(table: string, op: string, column: string, value: string): boolean {
  return lastCalls(table).some(
    ([name, args]) => name === op && Array.isArray(args) && args[0] === column && args[1] === value,
  );
}

const base = {
  startDate: "2026-01-01",
  endDate: "2026-01-05",
  organizationId: ORG,
};

beforeEach(() => {
  vi.clearAllMocks();
  recorded.length = 0;
  queues.compliance.length = 0;
  queues.occurrences.length = 0;
});

describe("6B.3 useUnitCompliance — filtro de turno", () => {
  it("aplica .eq('shift_id') exatamente com o turno selecionado", async () => {
    renderHook(() => useUnitCompliance({ ...base, shiftId: "shift-m" }));
    await act(async () => {
      await drain();
    });

    expect(supabase.from).toHaveBeenCalledWith("analytics_unit_daily_compliance");
    expect(hasFilter("analytics_unit_daily_compliance", "eq", "shift_id", "shift-m")).toBe(true);
    // O escopo organizacional continua obrigatório.
    expect(hasFilter("analytics_unit_daily_compliance", "eq", "organization_id", ORG)).toBe(true);
  });

  it("sem turno selecionado NÃO aplica filtro de shift_id (todos os turnos)", async () => {
    renderHook(() => useUnitCompliance({ ...base }));
    await act(async () => {
      await drain();
    });

    const shiftFilters = lastCalls("analytics_unit_daily_compliance").filter(
      ([name, args]) => name === "eq" && Array.isArray(args) && args[0] === "shift_id",
    );
    expect(shiftFilters).toHaveLength(0);
  });

  it("troca de turno invalida a resposta do turno anterior (fora de ordem)", async () => {
    const { rerender, result } = renderHook<
      ReturnType<typeof useUnitCompliance>,
      { shiftId: string }
    >(({ shiftId }) => useUnitCompliance({ ...base, shiftId }), {
      initialProps: { shiftId: "shift-m" },
    });
    await act(async () => {
      await drain();
    });

    // Turno manhã em voo; troca para noite antes de resolver.
    rerender({ shiftId: "shift-n" });
    await act(async () => {
      await drain();
    });

    // Resposta antiga da manhã chega tarde: não pode publicar sob a noite.
    queues.compliance[0].resolve({ data: [taskDayRow({ unit_name: "MANHA-STALE" })], error: null });
    await act(async () => {
      await drain();
    });
    expect(result.current.data.some((r) => r.unitName === "MANHA-STALE")).toBe(false);

    // Resposta do turno atual publica normalmente.
    queues.compliance[1].resolve({
      data: [taskDayRow({ unit_name: "NOITE", shift_id: "shift-n" })],
      error: null,
    });
    await act(async () => {
      await drain();
    });
    expect(result.current.data.map((r) => r.unitName)).toEqual(["NOITE"]);
    expect(result.current.loading).toBe(false);
  });

  it("refresh capturado no turno ANTERIOR é noop no turno atual", async () => {
    const { rerender, result } = renderHook<
      ReturnType<typeof useUnitCompliance>,
      { shiftId: string }
    >(({ shiftId }) => useUnitCompliance({ ...base, shiftId }), {
      initialProps: { shiftId: "shift-m" },
    });
    await act(async () => {
      await drain();
    });

    // Callback nascido no escopo do turno manhã.
    const staleRefresh = result.current.refresh;

    rerender({ shiftId: "shift-n" });
    await act(async () => {
      await drain();
    });
    queues.compliance[1].resolve({
      data: [taskDayRow({ unit_name: "NOITE", shift_id: "shift-n" })],
      error: null,
    });
    await act(async () => {
      await drain();
    });
    expect(result.current.data.map((r) => r.unitName)).toEqual(["NOITE"]);

    const queriesBefore = recorded.filter(
      (r) => r.table === "analytics_unit_daily_compliance",
    ).length;
    await act(async () => {
      await staleRefresh();
    });
    await act(async () => {
      await drain();
    });

    // O turno faz parte do ESCOPO: o callback antigo não consulta nem publica —
    // sem isso ele rodaria com shiftId=manhã e sobrescreveria o turno noite.
    expect(recorded.filter((r) => r.table === "analytics_unit_daily_compliance").length).toBe(
      queriesBefore,
    );
    expect(result.current.data.map((r) => r.unitName)).toEqual(["NOITE"]);
  });

  it("A(manhã) → B(noite) → A(manhã): resposta do primeiro ciclo é descartada", async () => {
    const { rerender, result } = renderHook<
      ReturnType<typeof useUnitCompliance>,
      { shiftId: string }
    >(({ shiftId }) => useUnitCompliance({ ...base, shiftId }), {
      initialProps: { shiftId: "shift-m" },
    });
    await act(async () => {
      await drain();
    });

    rerender({ shiftId: "shift-n" });
    await act(async () => {
      await drain();
    });
    rerender({ shiftId: "shift-m" });
    await act(async () => {
      await drain();
    });

    // 3 requisições: A1, B e A2 — o renderScope de A1 e A2 é idêntico.
    expect(recorded.filter((r) => r.table === "analytics_unit_daily_compliance")).toHaveLength(3);

    queues.compliance[0].resolve({ data: [taskDayRow({ unit_name: "A1-STALE" })], error: null });
    await act(async () => {
      await drain();
    });
    queues.compliance[1].resolve({ data: [taskDayRow({ unit_name: "B-STALE" })], error: null });
    await act(async () => {
      await drain();
    });
    expect(result.current.data.some((r) => r.unitName.includes("STALE"))).toBe(false);

    queues.compliance[2].resolve({ data: [taskDayRow({ unit_name: "A2-CURRENT" })], error: null });
    await act(async () => {
      await drain();
    });
    expect(result.current.data.map((r) => r.unitName)).toEqual(["A2-CURRENT"]);
  });
});

describe("6B.3 useUnitOccurrenceMetrics — filtro de turno", () => {
  it("aplica .eq('shift_id') somente quando há turno selecionado", async () => {
    const a = renderHook(() => useUnitOccurrenceMetrics({ ...base, shiftId: "shift-m" }));
    await act(async () => {
      await drain();
    });
    expect(supabase.from).toHaveBeenCalledWith("analytics_unit_daily_occurrences");
    expect(hasFilter("analytics_unit_daily_occurrences", "eq", "shift_id", "shift-m")).toBe(true);
    expect(hasFilter("analytics_unit_daily_occurrences", "eq", "organization_id", ORG)).toBe(true);
    a.unmount();

    recorded.length = 0;
    queues.occurrences.length = 0;
    renderHook(() => useUnitOccurrenceMetrics({ ...base }));
    await act(async () => {
      await drain();
    });
    const shiftFilters = lastCalls("analytics_unit_daily_occurrences").filter(
      ([name, args]) => name === "eq" && Array.isArray(args) && args[0] === "shift_id",
    );
    expect(shiftFilters).toHaveLength(0);
  });

  it("A(manhã) → B(noite) → A(manhã): só o ciclo atual publica", async () => {
    const { rerender, result } = renderHook<
      ReturnType<typeof useUnitOccurrenceMetrics>,
      { shiftId: string }
    >(({ shiftId }) => useUnitOccurrenceMetrics({ ...base, shiftId }), {
      initialProps: { shiftId: "shift-m" },
    });
    await act(async () => {
      await drain();
    });
    rerender({ shiftId: "shift-n" });
    await act(async () => {
      await drain();
    });
    rerender({ shiftId: "shift-m" });
    await act(async () => {
      await drain();
    });

    queues.occurrences[0].resolve({ data: [occDayRow({ unit_name: "A1-STALE" })], error: null });
    await act(async () => {
      await drain();
    });
    expect(result.current.data.some((r) => r.unitName.includes("STALE"))).toBe(false);

    queues.occurrences[2].resolve({
      data: [
        occDayRow({
          unit_name: "A2-CURRENT",
          total_occurrences: 4,
          completed_occurrences: 2,
          completed_on_time: 2,
          overdue_open_occurrences: 2,
          pending_open_occurrences: 0,
          due_occurrences: 4,
        }),
      ],
      error: null,
    });
    await act(async () => {
      await drain();
    });
    expect(result.current.data.map((r) => r.unitName)).toEqual(["A2-CURRENT"]);
    expect(result.current.kpis.total).toBe(4);
  });

  it("refresh capturado no turno ANTERIOR é noop no turno atual", async () => {
    const { rerender, result } = renderHook<
      ReturnType<typeof useUnitOccurrenceMetrics>,
      { shiftId: string }
    >(({ shiftId }) => useUnitOccurrenceMetrics({ ...base, shiftId }), {
      initialProps: { shiftId: "shift-m" },
    });
    await act(async () => {
      await drain();
    });
    const staleRefresh = result.current.refresh;

    rerender({ shiftId: "shift-n" });
    await act(async () => {
      await drain();
    });
    queues.occurrences[1].resolve({
      data: [occDayRow({ unit_name: "NOITE", shift_id: "shift-n" })],
      error: null,
    });
    await act(async () => {
      await drain();
    });
    expect(result.current.data.map((r) => r.unitName)).toEqual(["NOITE"]);

    const queriesBefore = recorded.filter(
      (r) => r.table === "analytics_unit_daily_occurrences",
    ).length;
    await act(async () => {
      await staleRefresh();
    });
    await act(async () => {
      await drain();
    });

    expect(recorded.filter((r) => r.table === "analytics_unit_daily_occurrences").length).toBe(
      queriesBefore,
    );
    expect(result.current.data.map((r) => r.unitName)).toEqual(["NOITE"]);
  });

  it("turno é parte do escopo: resposta de um turno não vaza para o outro", async () => {
    const { rerender, result } = renderHook<
      ReturnType<typeof useUnitOccurrenceMetrics>,
      { shiftId: string }
    >(({ shiftId }) => useUnitOccurrenceMetrics({ ...base, shiftId }), {
      initialProps: { shiftId: "shift-m" },
    });
    await act(async () => {
      await drain();
    });
    rerender({ shiftId: "shift-n" });
    await act(async () => {
      await drain();
    });

    queues.occurrences[0].resolve({ data: [occDayRow({ unit_name: "MANHA-STALE" })], error: null });
    await act(async () => {
      await drain();
    });
    expect(result.current.data).toEqual([]);

    queues.occurrences[1].resolve({
      data: [occDayRow({ unit_name: "NOITE", shift_id: "shift-n" })],
      error: null,
    });
    await act(async () => {
      await drain();
    });
    expect(result.current.data.map((r) => r.unitName)).toEqual(["NOITE"]);
  });
});
