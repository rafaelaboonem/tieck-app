/**
 * Execution 6B.1A — useInsights fail-closed behavior.
 *
 * Covers: success path (real insights only), real-empty state, failure in
 * each of the 5 queries, fail-closed partial-data rejection, no SQL/table
 * leakage in state, refresh recovery, realtime subscription cleanup —
 * plus 6B.1A.1 resiliency: rejected promises, out-of-order responses
 * (deferred promises resolved deliberately out of order) and unmount
 * invalidation.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { useInsights } from "../useInsights";
import { supabase } from "@/integrations/supabase/client";

interface FromResult {
  data: unknown;
  error: unknown;
  count: number | null;
}

// PostgREST builder simulado: então (awaitable) e com .eq encadeável.
function makeBuilder(result: FromResult) {
  const eqCalls: Array<[string, unknown]> = [];
  const b: any = Promise.resolve(result);
  b.select = vi.fn().mockReturnValue(b);
  b.eq = vi.fn((...args: unknown[]) => {
    eqCalls.push(args as [string, unknown]);
    return b;
  });
  b.__eqCalls = eqCalls;
  return b as never;
}

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: vi.fn(() => makeBuilder({ data: [], error: null, count: 0 })),
    channel: vi.fn().mockReturnValue({
      on: vi.fn().mockReturnThis(),
      subscribe: vi.fn().mockReturnThis(),
    }),
    removeChannel: vi.fn(),
  },
}));

function mockFromByTable(tableResults: Record<string, FromResult>, evidenceFailOn?: string) {
  vi.mocked(supabase.from).mockImplementation(((table: string) => {
    if (table === "evidences" && evidenceFailOn) {
      // Distingue as duas consultas de evidences pelo valor do .eq("status", ...).
      const ok = makeBuilder({ data: [], error: null, count: 3 });
      const fail = makeBuilder({ data: null, error: { message: "jwt expired" }, count: null });
      return {
        select: () => ({
          eq: (_col: string, val: string) => (val === evidenceFailOn ? fail : ok),
        }),
      } as never;
    }
    return makeBuilder(tableResults[table] ?? { data: [], error: null, count: 0 });
  }) as never);
}

const okResult = (data: unknown = [], count: number | null = 0): FromResult => ({
  data,
  error: null,
  count,
});

function fullSuccessTables(): Record<string, FromResult> {
  return {
    analytics_overdue_tasks: okResult([
      {
        unit_id: "u1",
        shift_id: "s1",
        task_id: "t1",
        title: "Tarefa A",
        scheduled_at: "2026-09-13T10:00:00Z",
      },
      {
        unit_id: "u1",
        shift_id: "s1",
        task_id: "t1",
        title: "Tarefa A",
        scheduled_at: "2026-09-13T11:00:00Z",
      },
    ]),
    analytics_critical_failures: okResult([{ unit_id: "u2", title: "Tarefa B" }]),
    analytics_unit_ranking: okResult([
      { unit_id: "u1", unit_name: "Unidade Um", compliance_pct: 95 },
      { unit_id: "u2", unit_name: "Unidade Dois", compliance_pct: 50 },
    ]),
    evidences: okResult([], 3),
  };
}

describe("useInsights (6B.1A)", () => {
  const originalError = console.error;

  beforeEach(() => {
    vi.clearAllMocks();
    console.error = vi.fn();
  });

  afterEach(() => {
    console.error = originalError;
  });

  it("produces only real insights from successful queries", async () => {
    mockFromByTable(fullSuccessTables());
    const { result } = renderHook(() => useInsights({ organizationId: "org-1" }));
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.error).toBe(false);
    expect(result.current.isEmpty).toBe(false);
    expect(result.current.insights.length).toBeGreaterThan(0);
    for (const ins of result.current.insights) {
      expect([
        "analytics_overdue_tasks",
        "analytics_critical_failures",
        "analytics_unit_ranking",
        "evidences",
      ]).toContain(ins.source);
    }
  });

  it("real-empty data yields empty list with isEmpty=true and no error", async () => {
    mockFromByTable({
      analytics_overdue_tasks: okResult([]),
      analytics_critical_failures: okResult([]),
      analytics_unit_ranking: okResult([]),
      evidences: okResult([], 0),
    });
    const { result } = renderHook(() => useInsights({ organizationId: "org-1" }));
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.insights).toEqual([]);
    expect(result.current.isEmpty).toBe(true);
    expect(result.current.error).toBe(false);
  });

  const FAILURE_CASES = [
    "analytics_overdue_tasks",
    "analytics_critical_failures",
    "analytics_unit_ranking",
    "evidences(pending)",
    "evidences(rejected)",
  ] as const;

  function tablesWithFailure(key: string): Record<string, FromResult> {
    const tables = fullSuccessTables();
    if (key === "analytics_overdue_tasks")
      tables.analytics_overdue_tasks = { data: null, error: { message: "relation does not exist" }, count: null };
    if (key === "analytics_critical_failures")
      tables.analytics_critical_failures = { data: null, error: { message: "permission denied" }, count: null };
    if (key === "analytics_unit_ranking")
      tables.analytics_unit_ranking = { data: null, error: { message: "schema cache error" }, count: null };
    return tables;
  }

  for (const key of FAILURE_CASES) {
    it(`fail-closed: failure in ${key} rejects the whole result with explicit error`, async () => {
      const evidenceFailOn = key.startsWith("evidences(")
        ? key === "evidences(pending)"
          ? "pending"
          : "rejected"
        : undefined;
      mockFromByTable(tablesWithFailure(key), evidenceFailOn);
      const { result } = renderHook(() => useInsights({ organizationId: "org-1" }));
      await waitFor(() => expect(result.current.loading).toBe(false));

      expect(result.current.error).toBe(true);
      expect(result.current.insights).toEqual([]);
      // isEmpty permanece false para a UI renderizar o estado de erro, não o vazio.
      expect(result.current.isEmpty).toBe(false);
      expect(console.error).toHaveBeenCalled();
    });
  }

  it("never leaks SQL/table/schema details in state values", async () => {
    mockFromByTable(tablesWithFailure("analytics_overdue_tasks"));
    const { result } = renderHook(() => useInsights({ organizationId: "org-1" }));
    await waitFor(() => expect(result.current.loading).toBe(false));

    const serialized = JSON.stringify({
      insights: result.current.insights,
      error: result.current.error,
      isEmpty: result.current.isEmpty,
      loading: result.current.loading,
    });
    expect(serialized).not.toMatch(/relation|permission denied|schema cache|jwt expired|postgres|SQL/i);
  });

  it("refresh recovers from a previous failure", async () => {
    mockFromByTable(tablesWithFailure("analytics_unit_ranking"));
    const { result } = renderHook(() => useInsights({ organizationId: "org-1" }));
    await waitFor(() => expect(result.current.error).toBe(true));

    mockFromByTable(fullSuccessTables());
    await act(async () => {
      await result.current.refresh();
    });

    expect(result.current.error).toBe(false);
    expect(result.current.insights.length).toBeGreaterThan(0);
  });

  it("does not render stale data when a failure follows success", async () => {
    mockFromByTable(fullSuccessTables());
    const { result } = renderHook(() => useInsights({ organizationId: "org-1" }));
    await waitFor(() => expect(result.current.insights.length).toBeGreaterThan(0));

    mockFromByTable(tablesWithFailure("analytics_critical_failures"));
    await act(async () => {
      await result.current.refresh();
    });

    expect(result.current.error).toBe(true);
    expect(result.current.insights).toEqual([]);
  });

  it("cleans up the realtime subscription on unmount", () => {
    mockFromByTable(fullSuccessTables());
    const { unmount } = renderHook(() => useInsights({ organizationId: "org-1" }));
    expect(supabase.channel).toHaveBeenCalledWith("insights-org-1");
    unmount();
    expect(supabase.removeChannel).toHaveBeenCalledTimes(1);
  });

  // ------------------------------------------------------------------
  // 6B.1A.1 — resiliência: rejeições, corridas e unmount.
  // ------------------------------------------------------------------

  function deferred<T>() {
    let resolve!: (v: T) => void;
    let reject!: (e: unknown) => void;
    const promise = new Promise<T>((res, rej) => {
      resolve = res;
      reject = rej;
    });
    return { promise, resolve, reject };
  }

  /** Builder PostgREST thenable cujo resultado é controlado por uma promessa diferida. */
  function gatedBuilder(gate: { promise: Promise<FromResult> }) {
    const b: any = {
      then: (
        onFulfilled?: (v: FromResult) => unknown,
        onRejected?: (e: unknown) => unknown,
      ) => gate.promise.then(onFulfilled, onRejected),
      catch: (onRejected?: (e: unknown) => unknown) => gate.promise.catch(onRejected),
      finally: (cb?: () => void) => gate.promise.finally(cb),
      select: vi.fn(() => b),
      eq: vi.fn(() => b),
    };
    return b;
  }

  /** Drena microtasks pendentes sem depender de timers. */
  async function drain() {
    for (let i = 0; i < 10; i++) await Promise.resolve();
  }

  it("rejected query promise ends with loading=false and fail-closed state", async () => {
    const gate = deferred<FromResult>();
    vi.mocked(supabase.from).mockImplementation((() => gatedBuilder(gate)) as never);
    const { result } = renderHook(() => useInsights({ organizationId: "org-1" }));
    expect(result.current.loading).toBe(true);

    gate.reject(new Error("network boom: SELECT * FROM secrets"));
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.error).toBe(true);
    expect(result.current.insights).toEqual([]);
    expect(result.current.isEmpty).toBe(false);
    // Detalhes técnicos da exceção nunca chegam ao estado público.
    const serialized = JSON.stringify(result.current);
    expect(serialized).not.toMatch(/network boom|SELECT|secrets/i);
  });

  it("slow stale request A does not overwrite newer request B (success race)", async () => {
    const slowA = deferred<FromResult>();
    const fastB = deferred<FromResult>();
    let call = 0;
    vi.mocked(supabase.from).mockImplementation(
      (() => gatedBuilder(++call <= 5 ? slowA : fastB)) as never,
    );
    const { result } = renderHook(() => useInsights({ organizationId: "org-1" }));
    // Requisição A: 5 consultas pendentes.
    await waitFor(() => expect(vi.mocked(supabase.from)).toHaveBeenCalledTimes(5));

    // Requisição B começa enquanto A ainda está no ar (não esperamos A).
    await act(async () => {
      result.current.refresh();
      await drain();
    });
    expect(vi.mocked(supabase.from)).toHaveBeenCalledTimes(10);

    // B termina primeiro com o estado mais recente.
    fastB.resolve({ data: [], error: null, count: 0 });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe(false);
    expect(result.current.isEmpty).toBe(true);

    // A resposta antiga de A chega POR ÚLTIMO com dados: deve ser descartada.
    slowA.resolve({
      data: [
        {
          unit_id: "u1",
          shift_id: "s1",
          task_id: "t1",
          title: "STALE",
          scheduled_at: "2026-09-13T10:00:00Z",
        },
      ],
      error: null,
      count: 0,
    });
    await act(async () => {
      await drain();
    });

    expect(result.current.insights).toEqual([]);
    expect(result.current.error).toBe(false);
    expect(result.current.isEmpty).toBe(true);
    expect(result.current.loading).toBe(false);
  });

  it("stale error A does not overwrite newer success B", async () => {
    const slowA = deferred<FromResult>();
    const fastB = deferred<FromResult>();
    let call = 0;
    vi.mocked(supabase.from).mockImplementation(
      (() => gatedBuilder(++call <= 5 ? slowA : fastB)) as never,
    );
    const { result } = renderHook(() => useInsights({ organizationId: "org-1" }));
    await waitFor(() => expect(vi.mocked(supabase.from)).toHaveBeenCalledTimes(5));

    await act(async () => {
      result.current.refresh();
      await drain();
    });
    expect(vi.mocked(supabase.from)).toHaveBeenCalledTimes(10);

    fastB.resolve({ data: [], error: null, count: 0 });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe(false);

    // A falha antiga de A chega depois do sucesso recente de B: ignorada.
    slowA.reject(new Error("old network failure"));
    await act(async () => {
      await drain();
    });

    expect(result.current.error).toBe(false);
    expect(result.current.isEmpty).toBe(true);
    expect(result.current.loading).toBe(false);
  });

  it("stale success A does not remove newer error B", async () => {
    const slowA = deferred<FromResult>();
    const fastB = deferred<FromResult>();
    let call = 0;
    vi.mocked(supabase.from).mockImplementation(
      (() => gatedBuilder(++call <= 5 ? slowA : fastB)) as never,
    );
    const { result } = renderHook(() => useInsights({ organizationId: "org-1" }));
    await waitFor(() => expect(vi.mocked(supabase.from)).toHaveBeenCalledTimes(5));

    await act(async () => {
      result.current.refresh();
      await drain();
    });
    expect(vi.mocked(supabase.from)).toHaveBeenCalledTimes(10);

    // B falha primeiro.
    fastB.resolve({ data: null, error: { message: "fresh failure" }, count: null });
    await waitFor(() => expect(result.current.error).toBe(true));
    expect(result.current.insights).toEqual([]);

    // O sucesso antigo de A chega depois do erro recente de B: ignorado.
    slowA.resolve({
      data: [
        {
          unit_id: "u1",
          shift_id: "s1",
          task_id: "t1",
          title: "STALE",
          scheduled_at: null,
        },
      ],
      error: null,
      count: 0,
    });
    await act(async () => {
      await drain();
    });

    expect(result.current.error).toBe(true);
    expect(result.current.insights).toEqual([]);
    expect(result.current.isEmpty).toBe(false);
    expect(result.current.loading).toBe(false);
  });

  it("unmount invalidates the in-flight request: no state writes afterwards", async () => {
    const gate = deferred<FromResult>();
    vi.mocked(supabase.from).mockImplementation((() => gatedBuilder(gate)) as never);
    const { result, unmount } = renderHook(() => useInsights({ organizationId: "org-1" }));
    expect(result.current.loading).toBe(true);

    unmount();
    gate.resolve({ data: [], error: null, count: 0 });
    await act(async () => {
      await gate.promise.catch(() => undefined);
      await drain();
    });

    // Nenhum setState após o unmount: loading permanece como estava,
    // sem erro, sem dados.
    expect(result.current.loading).toBe(true);
    expect(result.current.error).toBe(false);
    expect(result.current.insights).toEqual([]);
  });

  // ------------------------------------------------------------------
  // 6B.1B — escopo de workspace explícito nas cinco consultas.
  // ------------------------------------------------------------------

  describe("6B.1B — workspace scope", () => {
    beforeEach(() => {
      vi.clearAllMocks();
      console.error = vi.fn();
    });

    it("each of the five queries contains the exact organization_id", async () => {
      mockFromByTable(fullSuccessTables());
      renderHook(() => useInsights({ organizationId: "org-XYZ" }));
      await waitFor(() => expect(vi.mocked(supabase.from)).toHaveBeenCalledTimes(5));

      const tables = [
        "analytics_overdue_tasks",
        "analytics_critical_failures",
        "analytics_unit_ranking",
        "evidences",
        "evidences",
      ];
      expect(vi.mocked(supabase.from).mock.calls.map(([t]) => t)).toEqual(tables);
      for (let i = 0; i < 5; i++) {
        const builder = vi.mocked(supabase.from).mock.results[i].value as any;
        expect(builder.__eqCalls).toContainEqual(["organization_id", "org-XYZ"]);
      }
    });

    it("enabled=false: zero query and zero subscription", async () => {
      mockFromByTable(fullSuccessTables());
      const { result } = renderHook(() =>
        useInsights({ organizationId: "org-1", enabled: false }),
      );
      await act(async () => {
        await drain();
      });

      expect(supabase.from).not.toHaveBeenCalled();
      expect(supabase.channel).not.toHaveBeenCalled();
      expect(result.current.loading).toBe(false);
      expect(result.current.insights).toEqual([]);
      expect(result.current.error).toBe(false);
    });

    it("missing organizationId: zero query and zero subscription", async () => {
      mockFromByTable(fullSuccessTables());
      const { result } = renderHook(() => useInsights({ organizationId: null }));
      await act(async () => {
        await drain();
      });

      expect(supabase.from).not.toHaveBeenCalled();
      expect(supabase.channel).not.toHaveBeenCalled();
      expect(result.current.loading).toBe(false);
      expect(result.current.insights).toEqual([]);
      expect(result.current.error).toBe(false);
    });

    it("workspace switch A -> B: channel A removed, channel B created, queries scoped to B", async () => {
      mockFromByTable(fullSuccessTables());
      const { rerender } = renderHook(
        ({ organizationId }) => useInsights({ organizationId }),
        { initialProps: { organizationId: "org-A" } },
      );
      await waitFor(() => expect(supabase.channel).toHaveBeenCalledWith("insights-org-A"));

      await act(async () => {
        rerender({ organizationId: "org-B" });
      });

      expect(supabase.removeChannel).toHaveBeenCalled();
      expect(supabase.channel).toHaveBeenCalledWith("insights-org-B");
      // Toda consulta emitida (A e B) carrega um filtro organization_id —
      // nenhuma consulta sem escopo.
      const allScoped = vi.mocked(supabase.from).mock.results.every((r) => {
        const b = r.value as any;
        return (b.__eqCalls ?? []).some(([c]: any) => c === "organization_id");
      });
      expect(allScoped).toBe(true);
      // A última leva (B) filtra exatamente por org-B.
      for (let i = 5; i < 10; i++) {
        const builder = vi.mocked(supabase.from).mock.results[i].value as any;
        expect(builder.__eqCalls).toContainEqual(["organization_id", "org-B"]);
      }
    });

    it("realtime filters use the current organizationId", async () => {
      mockFromByTable(fullSuccessTables());
      renderHook(() => useInsights({ organizationId: "org-RT" }));
      await waitFor(() => expect(supabase.channel).toHaveBeenCalledWith("insights-org-RT"));

      const channelMock = vi.mocked(supabase.channel).mock.results[0].value as any;
      const onCalls = channelMock.on.mock.calls as Array<
        [string, { table: string; filter?: string }, unknown]
      >;
      const events = onCalls.filter(([, cfg]) => cfg && cfg.table);
      expect(events.length).toBe(2);
      for (const [, cfg] of events) {
        expect(["task_executions", "evidences"]).toContain(cfg.table);
        expect(cfg.filter).toBe("organization_id=eq.org-RT");
      }
    });

    it("late success of A cannot overwrite B (workspace scope race)", async () => {
      const slowA = deferred<FromResult>();
      const fastB = deferred<FromResult>();
      let call = 0;
      vi.mocked(supabase.from).mockImplementation(
        (() => gatedBuilder(++call <= 5 ? slowA : fastB)) as never,
      );
      const { result, rerender } = renderHook(
        ({ organizationId }) => useInsights({ organizationId }),
        { initialProps: { organizationId: "org-A" } },
      );
      await waitFor(() => expect(vi.mocked(supabase.from)).toHaveBeenCalledTimes(5));

      // Troca de workspace enquanto A está no ar: B termina primeiro.
      await act(async () => {
        rerender({ organizationId: "org-B" });
        await drain();
      });
      expect(vi.mocked(supabase.from)).toHaveBeenCalledTimes(10);

      fastB.resolve({ data: [], error: null, count: 0 });
      await waitFor(() => expect(result.current.loading).toBe(false));
      expect(result.current.error).toBe(false);
      expect(result.current.isEmpty).toBe(true);

      // Sucesso antigo de A com dados de outro workspace: descartado.
      slowA.resolve({
        data: [
          { unit_id: "uA", shift_id: "sA", task_id: "tA", title: "STALE-A", scheduled_at: null },
        ],
        error: null,
        count: 0,
      });
      await act(async () => {
        await drain();
      });
      expect(result.current.insights).toEqual([]);
      expect(result.current.error).toBe(false);
      expect(result.current.loading).toBe(false);
    });
  });
});
