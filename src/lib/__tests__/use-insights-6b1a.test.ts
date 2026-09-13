/**
 * Execution 6B.1A — useInsights fail-closed behavior.
 *
 * Covers: success path (real insights only), real-empty state, failure in
 * each of the 5 queries, fail-closed partial-data rejection, no SQL/table
 * leakage in state, refresh recovery, and realtime subscription cleanup.
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
  const b: any = Promise.resolve(result);
  b.select = vi.fn().mockReturnValue(b);
  b.eq = vi.fn().mockReturnValue(b);
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
    const { result } = renderHook(() => useInsights());
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
    const { result } = renderHook(() => useInsights());
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
      const { result } = renderHook(() => useInsights());
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
    const { result } = renderHook(() => useInsights());
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
    const { result } = renderHook(() => useInsights());
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
    const { result } = renderHook(() => useInsights());
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
    const { unmount } = renderHook(() => useInsights());
    expect(supabase.channel).toHaveBeenCalledWith("insights");
    unmount();
    expect(supabase.removeChannel).toHaveBeenCalledTimes(1);
  });
});
