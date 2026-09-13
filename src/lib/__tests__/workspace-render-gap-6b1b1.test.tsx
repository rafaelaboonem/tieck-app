/**
 * Execution 6B.1B.1 — render-time scope ownership and gated refresh.
 *
 * Gap closed: useEffect-based clearing runs AFTER the render, so on the first
 * render with scope B the previously published state of A could still be read.
 * These suites capture the value produced DURING the render of B (before any
 * passive effect) via a render probe and assert it is neutral. Also covers:
 * refresh() respecting the effective canQuery gate (enabled=false → noop) and
 * the operational detail route's scope-bound authorization + honest
 * no-workspace state.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, renderHook, act, waitFor, screen } from "@testing-library/react";
import { useUnitCompliance } from "@/hooks/useUnitCompliance";
import { useUnitOperationalDetails } from "@/hooks/useUnitOperationalDetails";
import { useInsights } from "@/lib/useInsights";
import { supabase } from "@/integrations/supabase/client";

interface QResult {
  data: unknown;
  error: unknown;
}

type Deferred<T> = {
  promise: Promise<T>;
  resolve: (v: T) => void;
  reject: (e: unknown) => void;
};

function deferred<T>(): Deferred<T> {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

/** Builder thenable com resultado controlado por gate diferido. */
function gatedBuilder(gate?: Deferred<QResult>, fixed?: QResult) {
  const b: any = {};
  const outcome = gate ? gate.promise : Promise.resolve(fixed ?? { data: [], error: null });
  b.then = (onF: any, onR: any) => outcome.then(onF, onR);
  b.catch = (onR: any) => outcome.catch(onR);
  b.finally = (cb: any) => outcome.finally(cb);
  const chain = () => vi.fn(() => b);
  b.select = chain();
  b.eq = chain();
  b.in = chain();
  b.gte = chain();
  b.lte = chain();
  b.order = chain();
  b.maybeSingle = chain();
  return b;
}

const drain = async () => {
  for (let i = 0; i < 12; i++) await Promise.resolve();
};

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: vi.fn(),
    channel: vi.fn().mockReturnValue({
      on: vi.fn().mockReturnThis(),
      subscribe: vi.fn().mockReturnThis(),
    }),
    removeChannel: vi.fn(),
  },
}));

beforeEach(() => {
  // clearAllMocks preserva implementações apenas com mockClear; aqui
  // restabelecemos o comportamento padrão explicitamente a cada teste.
  vi.clearAllMocks();
  vi.mocked(supabase.from).mockImplementation(() => gatedBuilder() as never);
  console.error = vi.fn();
});

// ---------------------------------------------------------------------------
// Sonda de render: captura o valor produzido DURANTE cada render (antes dos
// efeitos passivos serem drenados). É a prova de que o primeiro render de B
// nunca vê o estado de A.
// ---------------------------------------------------------------------------
function makeProbe<T, TValue = unknown>(useHook: (props: T) => TValue) {
  const snapshots: TValue[] = [];
  function Probe(props: T) {
    const value = useHook(props);
    snapshots.push(value);
    return null;
  }
  return { Probe, snapshots };
}

const complianceRow = {
  unitId: "uA",
  unitName: "STALE-A",
  completedTasks: 1,
  totalScheduledTasks: 1,
  delayedTasks: 0,
  criticalFailures: 0,
  compliancePercentage: 100,
  completedOnTime: 1,
  completedLate: 0,
  overdueOpenTasks: 0,
  pendingEvidences: 0,
  weightTotal: 1,
  weightDone: 1,
  totalDueTasks: 1,
  dueCompletedTasks: 1,
  dueWeightTotal: 1,
  dueWeightDone: 1,
  dueCompliancePercentage: 100,
};

describe("6B.1B.1 — useUnitCompliance render-time scope ownership", () => {
  it("first render of B never exposes A's published data", async () => {
    const gateA = deferred<QResult>();
    const gateB = deferred<QResult>();
    let call = 0;
    vi.mocked(supabase.from).mockImplementation(
      (() => gatedBuilder(++call === 1 ? gateA : gateB)) as never,
    );

    const base = { startDate: "2026-01-01", endDate: "2026-01-31" };
    const { Probe, snapshots } = makeProbe(
      (props: { organizationId: string | null }) => useUnitCompliance({ ...base, ...props }).data,
    );

    render(<Probe organizationId="org-A" />);
    // A publica dados reais.
    gateA.resolve({
      data: [
        {
          organization_id: "org-A",
          unit_id: "uA",
          unit_name: "STALE-A",
          reference_date: "2026-01-05",
          total_scheduled_tasks: 1,
          completed_tasks: 1,
          completed_on_time: 1,
          completed_late: 0,
          overdue_open_tasks: 0,
          delayed_tasks: 0,
          critical_failures: 0,
          pending_evidences: 0,
          weight_total: 1,
          weight_done: 1,
          compliance_percentage: 100,
          total_due_tasks: 1,
          due_completed_tasks: 1,
          due_weight_total: 1,
          due_weight_done: 1,
          due_compliance_percentage: 100,
        },
      ],
      error: null,
    });
    await waitFor(() => {
      const last = snapshots[snapshots.length - 1];
      expect((last as unknown as typeof complianceRow[]).length).toBe(1);
    });
    expect(
      (snapshots[snapshots.length - 1] as unknown as typeof complianceRow[])[0].unitName,
    ).toBe("STALE-A");
    // Delimita a era A: snapshots a partir daqui não podem mais conter dados de A.
    const aPublishedAt = snapshots.length;

    // Troca para B: o snapshot capturado durante o PRÓPRIO render (antes dos
    // efeitos) já deve ser neutro.
    await act(async () => {
      render(<Probe organizationId="org-B" />);
      await drain();
    });

    const afterSwitch = snapshots[snapshots.length - 1] as unknown as typeof complianceRow[];
    // Nenhum snapshot capturado APÓS a era A pode conter dados de A — nem o
    // primeiro render de B (antes dos efeitos).
    for (const snap of snapshots.slice(aPublishedAt)) {
      const rows = snap as unknown as typeof complianceRow[];
      if (Array.isArray(rows)) {
        for (const r of rows) {
          expect(r.unitName).not.toBe("STALE-A");
        }
      }
    }
    expect(afterSwitch.every((r) => r.unitName !== "STALE-A")).toBe(true);

    // A resposta tardia de A continua descartada.
    void gateA; // já resolvida
    // B publica somente os dados de B.
    gateB.resolve({
      data: [
        {
          organization_id: "org-B",
          unit_id: "uB",
          unit_name: "B-UNIT",
          reference_date: "2026-01-05",
          total_scheduled_tasks: 2,
          completed_tasks: 2,
          completed_on_time: 2,
          completed_late: 0,
          overdue_open_tasks: 0,
          delayed_tasks: 0,
          critical_failures: 0,
          pending_evidences: 0,
          weight_total: 2,
          weight_done: 2,
          compliance_percentage: 100,
          total_due_tasks: 2,
          due_completed_tasks: 2,
          due_weight_total: 2,
          due_weight_done: 2,
          due_compliance_percentage: 100,
        },
      ],
      error: null,
    });
    await waitFor(() => {
      const last = snapshots[snapshots.length - 1] as unknown as typeof complianceRow[];
      expect(last.length).toBe(1);
      expect(last[0].unitName).toBe("B-UNIT");
    });
  });

  it("refresh() is a noop when enabled=false (no query, no channel, neutral state)", async () => {
    vi.mocked(supabase.from).mockImplementation((() => gatedBuilder()) as never);
    const { result } = renderHook(() =>
      useUnitCompliance({
        startDate: "2026-01-01",
        endDate: "2026-01-31",
        organizationId: "org-1",
        enabled: false,
      }),
    );
    await act(async () => {
      await drain();
    });
    expect(supabase.from).not.toHaveBeenCalled();
    expect(supabase.channel).not.toHaveBeenCalled();

    await act(async () => {
      await result.current.refresh();
    });

    expect(supabase.from).not.toHaveBeenCalled();
    expect(supabase.channel).not.toHaveBeenCalled();
    expect(result.current.loading).toBe(false);
    expect(result.current.data).toEqual([]);
    expect(result.current.error).toBeNull();
  });

  it("refresh captured while enabled=true becomes a noop after enabled flips to false", async () => {
    const gate = deferred<QResult>();
    vi.mocked(supabase.from).mockImplementation((() => gatedBuilder(gate)) as never);
    const { result, rerender } = renderHook(
      ({ enabled }) =>
        useUnitCompliance({
          startDate: "2026-01-01",
          endDate: "2026-01-31",
          organizationId: "org-1",
          enabled,
        }),
      { initialProps: { enabled: true } },
    );
    expect(vi.mocked(supabase.from)).toHaveBeenCalledTimes(1);
    const refreshRef = result.current.refresh;

    // Desabilita: gate antigo não pode mais consultar.
    rerender({ enabled: false });
    await act(async () => {
      await drain();
    });
    const callsBefore = vi.mocked(supabase.from).mock.calls.length;

    await act(async () => {
      // Callback antigo capturado com enabled=true — o gate atual bloqueia.
      await refreshRef();
    });

    expect(vi.mocked(supabase.from).mock.calls.length).toBe(callsBefore);
    expect(result.current.loading).toBe(false);
    expect(result.current.data).toEqual([]);
    void gate;
  });
});

describe("6B.1B.1 — useInsights render-time scope ownership + gated refresh", () => {
  it("first render of B never exposes A's published insights", async () => {
    const gateA = deferred<QResult>();
    const gateB = deferred<QResult>();
    let call = 0;
    vi.mocked(supabase.from).mockImplementation(
      (() => gatedBuilder(++call <= 5 ? gateA : gateB)) as never,
    );

    const { Probe, snapshots } = makeProbe(
      (props: { organizationId: string | null }) => useInsights(props).insights,
    );
    render(<Probe organizationId="org-A" />);
    // A publica um insight real (2 atrasos da mesma tarefa → regra de reincidência).
    gateA.resolve({
      data: [
        { unit_id: "uA", shift_id: "s1", task_id: "t1", title: "STALE-A", scheduled_at: "2026-01-05T10:00:00Z" },
        { unit_id: "uA", shift_id: "s1", task_id: "t1", title: "STALE-A", scheduled_at: "2026-01-05T11:00:00Z" },
      ],
      error: null,
    });
    await waitFor(() => {
      const last = snapshots[snapshots.length - 1] as unknown as Array<{ title: string }>;
      expect(last.some((i) => i.title.includes("STALE-A"))).toBe(true);
    });

    // Delimita a era A: snapshots a partir daqui não podem conter insights de A.
    const aPublishedAt = snapshots.length;

    // Troca para B: o primeiro render de B não pode conter o insight de A.
    await act(async () => {
      render(<Probe organizationId="org-B" />);
      await drain();
    });
    for (const snap of snapshots.slice(aPublishedAt)) {
      const list = snap as unknown as Array<{ title: string }>;
      expect(list.every((i) => !i.title.includes("STALE-A"))).toBe(true);
    }

    // B publica somente seus insights.
    gateB.resolve({ data: [{ unit_id: "uB", shift_id: "s1", task_id: "t2", title: "B-TASK", scheduled_at: "2026-01-05T10:00:00Z" }, { unit_id: "uB", shift_id: "s1", task_id: "t2", title: "B-TASK", scheduled_at: "2026-01-05T11:00:00Z" }, { unit_id: "uB", shift_id: "s1", task_id: "t2", title: "B-TASK", scheduled_at: "2026-01-05T12:00:00Z" }, { unit_id: "uB", shift_id: "s1", task_id: "t2", title: "B-TASK", scheduled_at: "2026-01-05T13:00:00Z" }], error: null });
    await waitFor(() => {
      const last = snapshots[snapshots.length - 1] as unknown as Array<{ title: string }>;
      expect(last.some((i) => i.title.includes("B-TASK"))).toBe(true);
      expect(last.every((i) => !i.title.includes("STALE-A"))).toBe(true);
    });
  });

  it("refresh() is a noop when enabled=false (no query, no subscription)", async () => {
    vi.mocked(supabase.from).mockImplementation((() => gatedBuilder()) as never);
    const { result } = renderHook(() =>
      useInsights({ organizationId: "org-1", enabled: false }),
    );
    await act(async () => {
      await drain();
    });
    expect(supabase.from).not.toHaveBeenCalled();
    expect(supabase.channel).not.toHaveBeenCalled();

    await act(async () => {
      await result.current.refresh();
    });

    expect(supabase.from).not.toHaveBeenCalled();
    expect(supabase.channel).not.toHaveBeenCalled();
    expect(result.current.loading).toBe(false);
    expect(result.current.insights).toEqual([]);
    expect(result.current.error).toBe(false);
  });

  it("refresh captured while enabled=true becomes a noop after enabled flips to false", async () => {
    const gate = deferred<QResult>();
    vi.mocked(supabase.from).mockImplementation((() => gatedBuilder(gate)) as never);
    const { result, rerender } = renderHook(
      ({ enabled }) => useInsights({ organizationId: "org-1", enabled }),
      { initialProps: { enabled: true } },
    );
    expect(vi.mocked(supabase.from)).toHaveBeenCalledTimes(5);
    const refreshRef = result.current.refresh;

    rerender({ enabled: false });
    await act(async () => {
      await drain();
    });
    const callsBefore = vi.mocked(supabase.from).mock.calls.length;

    await act(async () => {
      await refreshRef();
    });

    expect(vi.mocked(supabase.from).mock.calls.length).toBe(callsBefore);
    expect(result.current.loading).toBe(false);
    expect(result.current.insights).toEqual([]);
    void gate;
  });
});

describe("6B.1B.1 — useUnitOperationalDetails render-time scope ownership", () => {
  it("first render of B never exposes A's published executions", async () => {
    const gateA = deferred<QResult>();
    const gateB = deferred<QResult>();
    // Roteamento por organization_id: TODAS as consultas de uma fase (execuções
    // e evidências) aguardam o gate do seu próprio escopo — o número de
    // from() por carga varia (evidências só consultam quando há execuções).
    const gates: Record<string, Deferred<QResult>> = { "org-A": gateA, "org-B": gateB };
    vi.mocked(supabase.from).mockImplementation(
      (() => {
        const b: any = {};
        let gate = gateA;
        const chain = () => vi.fn(() => b);
        b.select = chain();
        b.eq = vi.fn((col: string, val: unknown) => {
          if (col === "organization_id") gate = gates[String(val)] ?? gateA;
          return b;
        });
        b.in = chain();
        b.gte = chain();
        b.lte = chain();
        b.order = chain();
        b.maybeSingle = chain();
        const outcome = () => gate.promise;
        b.then = (onF: any, onR: any) => outcome().then(onF, onR);
        b.catch = (onR: any) => outcome().catch(onR);
        b.finally = (cb: any) => outcome().finally(cb);
        return b;
      }) as never,
    );

    const base = { startDate: "2026-01-01", endDate: "2026-01-31", unitId: "unit-1" };
    const { Probe, snapshots } = makeProbe(
      (props: { organizationId: string | null }) =>
        useUnitOperationalDetails({ ...base, ...props }).data,
    );
    render(<Probe organizationId="org-A" />);
    gateA.resolve({
      data: [
        {
          id: "exec-A",
          task_id: "t1",
          shift_id: null,
          scheduled_at: "2026-01-05T10:00:00Z",
          executed_at: null,
          status: "programada",
          notes: null,
          executed_by: null,
          cancelled_at: null,
          cancellation_reason: null,
          tasks: { id: "t1", title: "STALE-A", description: null, code: null, weight: "comum" },
          shifts: null,
        },
      ],
      error: null,
    });
    await waitFor(() => {
      const last = snapshots[snapshots.length - 1] as unknown as Array<{ taskTitle: string }>;
      expect(last.length).toBe(1);
      expect(last[0].taskTitle).toBe("STALE-A");
    });

    // Delimita a era A: snapshots a partir daqui não podem conter execuções de A.
    const aPublishedAt = snapshots.length;

    // Primeiro render de B: neutro, sem nenhum resquício de A.
    await act(async () => {
      render(<Probe organizationId="org-B" />);
      await drain();
    });
    for (const snap of snapshots.slice(aPublishedAt)) {
      const list = snap as unknown as Array<{ taskTitle: string }>;
      expect(list.every((e) => e.taskTitle !== "STALE-A")).toBe(true);
    }

    gateB.resolve({
      data: [
        {
          id: "exec-B",
          task_id: "t1",
          shift_id: null,
          scheduled_at: "2026-01-05T10:00:00Z",
          executed_at: null,
          status: "programada",
          notes: null,
          executed_by: null,
          cancelled_at: null,
          cancellation_reason: null,
          tasks: { id: "t1", title: "B-EXEC", description: null, code: null, weight: "comum" },
          shifts: null,
        },
      ],
      error: null,
    });
    await waitFor(() => {
      const last = snapshots[snapshots.length - 1] as unknown as Array<{ taskTitle: string }>;
      expect(last.length).toBe(1);
      expect(last[0].taskTitle).toBe("B-EXEC");
    });
  });
});

