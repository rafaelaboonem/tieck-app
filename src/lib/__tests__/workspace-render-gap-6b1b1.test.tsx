/**
 * Execution 6B.1B.2 — render-time scope ownership com rerender na MESMA
 * instância + callbacks vinculados ao próprio escopo (closure).
 *
 * Três garantias por cenário:
 *  1. O PRIMEIRO render de B (capturado pela sonda na MESMA instância, via
 *     view.rerender — nunca uma segunda render()) é neutro: dados publicados
 *     por A jamais retornam.
 *  2. Callbacks capturados sob A (refresh/load/callback realtime) são noop
 *     sob B ANTES de qualquer supabase.from — provado inspecionando os
 *     filtros de TODAS as consultas gravadas: nenhuma nova consulta com
 *     organization_id, datas ou unitId de A.
 *  3. A elegibilidade (enabled/canQuery) faz parte da tag de render:
 *     disabled no primeiro render já é neutro; reabilitar mostra loading,
 *     nunca um vazio falso.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, act, waitFor, renderHook } from "@testing-library/react";
import { supabase } from "@/integrations/supabase/client";
import { useUnitCompliance } from "@/hooks/useUnitCompliance";
import {
  useUnitOperationalDetails,
  type UseUnitOperationalDetailsResult,
} from "@/hooks/useUnitOperationalDetails";
import { useInsights, type Insight } from "@/lib/useInsights";
import type { UseUnitComplianceResult } from "@/hooks/useUnitCompliance";

type QResult = { data: unknown; error: unknown; count?: number };

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: vi.fn(),
    channel: vi.fn(),
    removeChannel: vi.fn(),
  },
}));

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

const drain = async () => {
  for (let i = 0; i < 12; i++) await Promise.resolve();
};

interface RecordedQuery {
  table: string;
  eqs: Array<[string, unknown]>;
  ranges: Array<[string, unknown]>;
}

/**
 * Builder que grava tabela + filtros (.eq/.gte/.lte) de cada consulta e roteia
 * o resultado pelo organization_id efetivamente filtrado — cobre cargas com
 * número variável de consultas (ex.: evidências só consultam quando há
 * execuções).
 */
function makeRecordingFrom(opts: {
  gates?: Record<string, Deferred<QResult>>;
  defaultGate?: Deferred<QResult>;
  /** Modo fila: cada consulta consome o próximo gate (testes de mudança de
   * datas/unitId dentro da MESMA organização, onde o roteamento por org não
   * distingue as cargas). */
  queue?: Array<Deferred<QResult>>;
}) {
  const queries: RecordedQuery[] = [];
  const from = vi.fn((table: string) => {
    const q: RecordedQuery = { table, eqs: [], ranges: [] };
    queries.push(q);
    const b: any = {};
    let org: string | undefined;
    // gateSource é computado uma única vez antes de qualquer .then/.catch,
    // para que um same-organization queue reencha corretamente e um segundo
    // call ao mesmo builder (refresh antigo) retorne o mesmo gate que já
    // resolveu — ele não recomeça o routing de org/fila no meio da promise.
    let gateSource: Promise<QResult> | null = null;
    const outcome = () => {
      if (gateSource) return gateSource;
      let gated = (org && opts.gates?.[org]) || opts.defaultGate;
      if (!gated && opts.queue) gated = opts.queue.shift() ?? deferred<QResult>();
      gateSource = gated ? gated.promise : Promise.resolve<QResult>({ data: [], error: null, count: 0 });
      return gateSource;
    };
    const chain = () => vi.fn(() => b);
    b.select = chain();
    b.eq = vi.fn((col: string, val: unknown) => {
      q.eqs.push([col, val]);
      if (col === "organization_id") org = String(val);
      return b;
    });
    b.gte = vi.fn((col: string, val: unknown) => {
      q.ranges.push([col, val]);
      return b;
    });
    b.lte = vi.fn((col: string, val: unknown) => {
      q.ranges.push([col, val]);
      return b;
    });
    b.in = chain();
    b.order = chain();
    b.maybeSingle = chain();
    b.then = (onF: any, onR: any) => outcome().then(onF, onR);
    b.catch = (onR: any) => outcome().catch(onR);
    b.finally = (cb: any) => outcome().finally(cb);
    return b;
  });
  return { from, queries };
}

const countOrgQueries = (queries: RecordedQuery[], org: string) =>
  queries.filter((q) => q.eqs.some(([c, v]) => c === "organization_id" && v === org)).length;

const hasEq = (q: RecordedQuery, col: string, val: unknown) =>
  q.eqs.some(([c, v]) => c === col && v === val);

const hasRange = (q: RecordedQuery, col: string, val: unknown) =>
  q.ranges.some(([c, v]) => c === col && v === val);

// Sonda de render: captura o valor produzido DURANTE cada render (antes dos
// efeitos passivos serem drenados). A MESMA instância é reutilizada com
// view.rerender — nunca uma segunda render().
function makeProbe<T, TValue = unknown>(useHook: (props: T) => TValue) {
  const snapshots: TValue[] = [];
  function Probe(props: T) {
    const value = useHook(props);
    snapshots.push(value);
    return null;
  }
  return { Probe, snapshots };
}

let channelCbs: Array<(payload?: unknown) => void> = [];

/** Captura os callbacks registrados em cada canal realtime. */
function installChannelMock() {
  const onCallbacks: Array<(payload?: unknown) => void> = [];
  vi.mocked(supabase.channel).mockImplementation((() => {
    const obj: any = {};
    obj.on = vi.fn(
      (_event: string, _config: unknown, cb?: (p?: unknown) => void) => {
        if (typeof cb === "function") onCallbacks.push(cb);
        return obj;
      },
    );
    obj.subscribe = vi.fn(() => obj);
    return obj;
  }) as never);
  return onCallbacks;
}

const DAILY_BASE = {
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
};
const dailyRow = (organization_id: string, unit_id: string, unit_name: string) => ({
  organization_id,
  unit_id,
  unit_name,
  ...DAILY_BASE,
});

const overdueRow = (title: string, taskId: string) => ({
  unit_id: "uA",
  shift_id: "s1",
  task_id: taskId,
  title,
  scheduled_at: "2026-01-05T10:00:00Z",
});

const execRow = (id: string, title: string) => ({
  id,
  task_id: "t1",
  shift_id: null,
  scheduled_at: "2026-01-05T10:00:00Z",
  executed_at: null,
  status: "programada",
  notes: null,
  executed_by: null,
  cancelled_at: null,
  cancellation_reason: null,
  tasks: { id: "t1", title, description: null, code: null, weight: "comum" },
  shifts: null,
});

beforeEach(() => {
  vi.clearAllMocks();
  console.error = vi.fn();
  channelCbs = installChannelMock();
});

// ---------------------------------------------------------------------------
// useUnitCompliance
// ---------------------------------------------------------------------------
describe("6B.1B.2 — useUnitCompliance: single-instance rerender + scoped callbacks", () => {
  it("first render of B never exposes A's published data (same instance, view.rerender)", async () => {
    const gateA = deferred<QResult>();
    const gateB = deferred<QResult>();
    const rec = makeRecordingFrom({ gates: { "org-A": gateA, "org-B": gateB }, defaultGate: gateB });
    vi.mocked(supabase.from).mockImplementation(rec.from as never);

    const base = { startDate: "2026-01-01", endDate: "2026-01-31" };
    const { Probe, snapshots } = makeProbe(
      (props: { organizationId: string | null }) =>
        useUnitCompliance({ ...base, ...props }).data,
    );
    const view = render(<Probe organizationId="org-A" />);
    gateA.resolve({ data: [dailyRow("org-A", "uA", "STALE-A")], error: null });
    await waitFor(() => {
      const last = snapshots[snapshots.length - 1] as unknown as Array<{ unitName: string }>;
      expect(last.length).toBe(1);
      expect(last[0].unitName).toBe("STALE-A"); // A publicado pela MESMA instância
    });
    const aPublishedAt = snapshots.length;

    // MESMA instância: troca para B com rerender (nunca uma segunda render()).
    view.rerender(<Probe organizationId="org-B" />);

    // O PRIMEIRO snapshot do render de B (antes dos efeitos) é neutro.
    const firstB = snapshots[aPublishedAt] as unknown as Array<{ unitName: string }>;
    expect(firstB).toEqual([]);
    for (const snap of snapshots.slice(aPublishedAt)) {
      const rows = snap as unknown as Array<{ unitName: string }>;
      for (const r of rows) expect(r.unitName).not.toBe("STALE-A");
    }

    // Agora recarrega o builder para permitir a carga B resolver.
    vi.mocked(supabase.from).mockImplementation(rec.from as never);

    // B publica somente os dados de B.
    gateB.resolve({ data: [dailyRow("org-B", "uB", "B-UNIT")], error: null });
    await waitFor(() => {
      const last = snapshots[snapshots.length - 1] as unknown as Array<{ unitName: string }>;
      expect(last.length).toBe(1);
      expect(last[0].unitName).toBe("B-UNIT");
    });

    // Nenhuma nova consulta com organization_id de A depois da troca.
    expect(countOrgQueries(rec.queries, "org-A")).toBe(1); // somente a carga original de A
    expect(countOrgQueries(rec.queries, "org-B")).toBe(1);
  });

  it("refresh captured under A is a noop under B: zero new queries with A's filters", async () => {
    const gateA = deferred<QResult>();
    const gateB = deferred<QResult>();
    const rec = makeRecordingFrom({ gates: { "org-A": gateA, "org-B": gateB }, defaultGate: gateB });
    vi.mocked(supabase.from).mockImplementation(rec.from as never);

    const base = { startDate: "2026-01-01", endDate: "2026-01-31" };
    const { Probe, snapshots } = makeProbe((props: { organizationId: string | null }) =>
      useUnitCompliance({ ...base, ...props }),
    );
    const view = render(<Probe organizationId="org-A" />);
    gateA.resolve({ data: [dailyRow("org-A", "uA", "STALE-A")], error: null });
    await waitFor(() => {
      const last = snapshots[snapshots.length - 1] as UseUnitComplianceResult;
      expect(last.data.length).toBe(1);
    });
    const aPublishedAt = snapshots.length;
    const refreshA = (snapshots[aPublishedAt - 1] as UseUnitComplianceResult).refresh;

    view.rerender(<Probe organizationId="org-B" />);
    await act(async () => {
      await drain(); // carga de B em voo
    });
    const before = rec.queries.length;
    const aBefore = countOrgQueries(rec.queries, "org-A");

    await act(async () => {
      await refreshA(); // callback antigo de A sob o escopo B
    });

    expect(rec.queries.length).toBe(before);
    expect(countOrgQueries(rec.queries, "org-A")).toBe(aBefore);

    gateB.resolve({ data: [dailyRow("org-B", "uB", "B-UNIT")], error: null });
    await waitFor(() => {
      const last = snapshots[snapshots.length - 1] as UseUnitComplianceResult;
      expect(last.data.length).toBe(1);
      expect(last.data[0].unitName).toBe("B-UNIT");
      expect(last.data.every((r) => r.unitName !== "STALE-A")).toBe(true);
    });
  });

  it("dates-only change invalidates callbacks captured with the old dates", async () => {
    // Fila: carga A (1 consulta) → carga B (1 consulta).
    const gateA = deferred<QResult>();
    const gateB = deferred<QResult>();
    const rec = makeRecordingFrom({ queue: [gateA, gateB] });
    vi.mocked(supabase.from).mockImplementation(rec.from as never);

    const base = { organizationId: "org-1" as string | null, endDate: "2026-01-31" };
    const { Probe, snapshots } = makeProbe((props: { startDate: string }) =>
      useUnitCompliance({ ...base, startDate: props.startDate }),
    );
    const view = render(<Probe startDate="2026-01-01" />);
    gateA.resolve({ data: [dailyRow("org-1", "u1", "JAN")], error: null });
    await waitFor(() => {
      const last = snapshots[snapshots.length - 1] as UseUnitComplianceResult;
      expect(last.data.length).toBe(1);
      expect(last.data[0].unitName).toBe("JAN");
    });
    const aPublishedAt = snapshots.length;
    const refreshA = (snapshots[aPublishedAt - 1] as UseUnitComplianceResult).refresh;

    view.rerender(<Probe startDate="2026-02-01" />);
    await act(async () => {
      await drain();
    });
    const before = rec.queries.length;
    const oldDateQueries = rec.queries.filter((q) => hasRange(q, "reference_date", "2026-01-01")).length;

    await act(async () => {
      await refreshA(); // closure com as datas de janeiro
    });

    expect(rec.queries.length).toBe(before);
    expect(rec.queries.filter((q) => hasRange(q, "reference_date", "2026-01-01")).length).toBe(oldDateQueries);
    // A consulta de fevereiro carrega as datas novas.
    expect(rec.queries.some((q) => hasRange(q, "reference_date", "2026-02-01"))).toBe(true);

    gateB.resolve({ data: [dailyRow("org-1", "u1", "FEV")], error: null });
    await waitFor(() => {
      const last = snapshots[snapshots.length - 1] as UseUnitComplianceResult;
      expect(last.data[0].unitName).toBe("FEV");
    });
  });

  it("unitId-only change invalidates callbacks captured with the old unitId", async () => {
    // Fila: carga A (1 consulta) → carga B (1 consulta).
    const gateA = deferred<QResult>();
    const gateB = deferred<QResult>();
    const rec = makeRecordingFrom({ queue: [gateA, gateB] });
    vi.mocked(supabase.from).mockImplementation(rec.from as never);

    const base = { organizationId: "org-1" as string | null, startDate: "2026-01-01", endDate: "2026-01-31" };
    const { Probe, snapshots } = makeProbe((props: { unitId?: string }) =>
      useUnitCompliance({ ...base, unitId: props.unitId }),
    );
    const view = render(<Probe unitId="u1" />);
    gateA.resolve({ data: [dailyRow("org-1", "u1", "UNIT-1")], error: null });
    await waitFor(() => {
      const last = snapshots[snapshots.length - 1] as UseUnitComplianceResult;
      expect(last.data[0].unitName).toBe("UNIT-1");
    });
    const aPublishedAt = snapshots.length;
    const refreshA = (snapshots[aPublishedAt - 1] as UseUnitComplianceResult).refresh;

    view.rerender(<Probe unitId="u2" />);
    await act(async () => {
      await drain();
    });
    const before = rec.queries.length;
    const oldUnitQueries = rec.queries.filter((q) => hasEq(q, "unit_id", "u1")).length;

    await act(async () => {
      await refreshA(); // closure com unitId=u1
    });

    expect(rec.queries.length).toBe(before);
    expect(rec.queries.filter((q) => hasEq(q, "unit_id", "u1")).length).toBe(oldUnitQueries);
    expect(rec.queries.some((q) => hasEq(q, "unit_id", "u2"))).toBe(true);

    gateB.resolve({ data: [dailyRow("org-1", "u2", "UNIT-2")], error: null });
    await waitFor(() => {
      const last = snapshots[snapshots.length - 1] as UseUnitComplianceResult;
      expect(last.data[0].unitName).toBe("UNIT-2");
    });
  });

  it("enabled true → false: the first disabled render is already neutral and refresh is a noop", async () => {
    const gate = deferred<QResult>();
    const rec = makeRecordingFrom({ defaultGate: gate });
    vi.mocked(supabase.from).mockImplementation(rec.from as never);

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
    gate.resolve({ data: [dailyRow("org-1", "u1", "UNIT")], error: null });
    await waitFor(() => expect(result.current.data.length).toBe(1));

    rerender({ enabled: false });
    // Primeiro render desabilitado: neutro sincronamente.
    expect(result.current.data).toEqual([]);
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();

    const before = rec.queries.length;
    await act(async () => {
      await result.current.refresh();
    });
    expect(rec.queries.length).toBe(before);
  });

  it("enabled false → true: first re-enabled render shows loading, never a false empty", async () => {
    const gate = deferred<QResult>();
    const rec = makeRecordingFrom({ defaultGate: gate });
    vi.mocked(supabase.from).mockImplementation(rec.from as never);

    const { result, rerender } = renderHook(
      ({ enabled }) =>
        useUnitCompliance({
          startDate: "2026-01-01",
          endDate: "2026-01-31",
          organizationId: "org-1",
          enabled,
        }),
      { initialProps: { enabled: false } },
    );
    await act(async () => {
      await drain();
    });
    expect(result.current.loading).toBe(false);
    expect(result.current.data).toEqual([]);

    rerender({ enabled: true });
    // Primeiro render reabilitado: loading=true (estado anterior é "off",
    // nunca um vazio concluído).
    expect(result.current.loading).toBe(true);
    expect(result.current.data).toEqual([]);

    gate.resolve({ data: [dailyRow("org-1", "u1", "UNIT")], error: null });
    await waitFor(() => expect(result.current.data.length).toBe(1));
    expect(result.current.loading).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// useInsights
// ---------------------------------------------------------------------------
describe("6B.1B.2 — useInsights: single-instance rerender + scoped callbacks", () => {
  it("first render of B never exposes A's published insights (same instance, view.rerender)", async () => {
    const gateA = deferred<QResult>();
    const gateB = deferred<QResult>();
    const rec = makeRecordingFrom({ gates: { "org-A": gateA, "org-B": gateB }, defaultGate: gateB });
    vi.mocked(supabase.from).mockImplementation(rec.from as never);

    const { Probe, snapshots } = makeProbe(
      (props: { organizationId: string | null }) => useInsights(props).insights,
    );
    const view = render(<Probe organizationId="org-A" />);
    gateA.resolve({
      data: [overdueRow("STALE-A", "t1"), overdueRow("STALE-A", "t1")],
      error: null,
    });
    await waitFor(() => {
      const last = snapshots[snapshots.length - 1] as unknown as Array<{ title: string }>;
      expect(last.some((i) => i.title.includes("STALE-A"))).toBe(true);
    });
    const aPublishedAt = snapshots.length;

    view.rerender(<Probe organizationId="org-B" />);

    const firstB = snapshots[aPublishedAt] as unknown as Insight[];
    expect(firstB).toEqual([]);
    for (const snap of snapshots.slice(aPublishedAt)) {
      const list = snap as unknown as Array<{ title: string }>;
      for (const i of list) expect(i.title.includes("STALE-A")).toBe(false);
    }

    gateB.resolve({
      data: [overdueRow("B-INSIGHT", "t9"), overdueRow("B-INSIGHT", "t9")],
      error: null,
    });
    await waitFor(() => {
      const last = snapshots[snapshots.length - 1] as unknown as Array<{ title: string }>;
      expect(last.some((i) => i.title.includes("B-INSIGHT"))).toBe(true);
      expect(last.every((i) => !i.title.includes("STALE-A"))).toBe(true);
    });
    expect(countOrgQueries(rec.queries, "org-A")).toBe(5); // somente a carga original de A
  });

  it("refresh captured under A is a noop under B: zero new queries with A's filters", async () => {
    const gateA = deferred<QResult>();
    const gateB = deferred<QResult>();
    const rec = makeRecordingFrom({ gates: { "org-A": gateA, "org-B": gateB }, defaultGate: gateB });
    vi.mocked(supabase.from).mockImplementation(rec.from as never);

    const { Probe, snapshots } = makeProbe((props: { organizationId: string | null }) =>
      useInsights(props),
    );
    const view = render(<Probe organizationId="org-A" />);
    gateA.resolve({
      data: [overdueRow("STALE-A", "t1"), overdueRow("STALE-A", "t1")],
      error: null,
    });
    await waitFor(() => {
      const last = snapshots[snapshots.length - 1] as ReturnType<typeof useInsights>;
      expect(last.insights.some((i) => i.title.includes("STALE-A"))).toBe(true);
    });
    const aPublishedAt = snapshots.length;
    const refreshA = (snapshots[aPublishedAt - 1] as ReturnType<typeof useInsights>).refresh;

    view.rerender(<Probe organizationId="org-B" />);
    await act(async () => {
      await drain();
    });
    const before = rec.queries.length;
    const aBefore = countOrgQueries(rec.queries, "org-A");

    await act(async () => {
      await refreshA();
    });

    expect(rec.queries.length).toBe(before);
    expect(countOrgQueries(rec.queries, "org-A")).toBe(aBefore);

    gateB.resolve({
      data: [overdueRow("B-INSIGHT", "t9"), overdueRow("B-INSIGHT", "t9")],
      error: null,
    });
    await waitFor(() => {
      const last = snapshots[snapshots.length - 1] as ReturnType<typeof useInsights>;
      expect(last.insights.some((i) => i.title.includes("B-INSIGHT"))).toBe(true);
      expect(last.insights.every((i) => !i.title.includes("STALE-A"))).toBe(true);
    });
  });

  it("realtime callback captured on channel A is a noop under B when invoked manually", async () => {
    const gateA = deferred<QResult>();
    const gateB = deferred<QResult>();
    const rec = makeRecordingFrom({ gates: { "org-A": gateA, "org-B": gateB }, defaultGate: gateB });
    vi.mocked(supabase.from).mockImplementation(rec.from as never);

    const { Probe, snapshots } = makeProbe(
      (props: { organizationId: string | null }) => useInsights(props).insights,
    );
    const view = render(<Probe organizationId="org-A" />);
    gateA.resolve({
      data: [overdueRow("STALE-A", "t1"), overdueRow("STALE-A", "t1")],
      error: null,
    });
    await waitFor(() => {
      const last = snapshots[snapshots.length - 1] as unknown as Array<{ title: string }>;
      expect(last.some((i) => i.title.includes("STALE-A"))).toBe(true);
    });
    // Callbacks registrados no canal A (task_executions + evidences).
    const aCallbacks = channelCbs.slice();
    expect(aCallbacks.length).toBe(2);

    view.rerender(<Probe organizationId="org-B" />);
    await act(async () => {
      await drain(); // canal B registrado; carga de B em voo
    });
    const before = rec.queries.length;
    const aBefore = countOrgQueries(rec.queries, "org-A");

    await act(async () => {
      // Invoca manualmente os callbacks ANTIGOS do canal A depois da troca.
      aCallbacks.forEach((cb) => cb({}));
      await drain();
    });

    expect(rec.queries.length).toBe(before);
    expect(countOrgQueries(rec.queries, "org-A")).toBe(aBefore);
  });

  it("enabled true → false: first disabled render is neutral (insights=[], isEmpty=true, error=false, loading=false)", async () => {
    const gate = deferred<QResult>();
    const rec = makeRecordingFrom({ defaultGate: gate });
    vi.mocked(supabase.from).mockImplementation(rec.from as never);

    const { result, rerender } = renderHook(
      ({ enabled }) => useInsights({ organizationId: "org-1", enabled }),
      { initialProps: { enabled: true } },
    );
    gate.resolve({
      data: [overdueRow("TASK", "t1"), overdueRow("TASK", "t1")],
      error: null,
    });
    await waitFor(() => expect(result.current.insights.length).toBeGreaterThan(0));

    rerender({ enabled: false });
    expect(result.current.insights).toEqual([]);
    expect(result.current.isEmpty).toBe(true);
    expect(result.current.error).toBe(false);
    expect(result.current.loading).toBe(false);

    const before = rec.queries.length;
    await act(async () => {
      await result.current.refresh();
    });
    expect(rec.queries.length).toBe(before);
  });

  it("enabled false → true: loading until the new load publishes, never a false empty", async () => {
    const gate = deferred<QResult>();
    const rec = makeRecordingFrom({ defaultGate: gate });
    vi.mocked(supabase.from).mockImplementation(rec.from as never);

    const { result, rerender } = renderHook(
      ({ enabled }) => useInsights({ organizationId: "org-1", enabled }),
      { initialProps: { enabled: false } },
    );
    await act(async () => {
      await drain();
    });
    expect(result.current.loading).toBe(false);
    expect(result.current.insights).toEqual([]);

    rerender({ enabled: true });
    expect(result.current.loading).toBe(true);
    expect(result.current.insights).toEqual([]);

    gate.resolve({
      data: [overdueRow("TASK", "t1"), overdueRow("TASK", "t1")],
      error: null,
    });
    await waitFor(() => expect(result.current.insights.length).toBeGreaterThan(0));
    expect(result.current.loading).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// useUnitOperationalDetails
// ---------------------------------------------------------------------------
describe("6B.1B.2 — useUnitOperationalDetails: single-instance rerender + scoped callbacks", () => {
  const base = { startDate: "2026-01-01", endDate: "2026-01-31", unitId: "unit-1" };

  it("first render of B never exposes A's published executions (same instance, view.rerender)", async () => {
    const gateA = deferred<QResult>();
    const gateB = deferred<QResult>();
    const rec = makeRecordingFrom({ gates: { "org-A": gateA, "org-B": gateB }, defaultGate: gateB });
    vi.mocked(supabase.from).mockImplementation(rec.from as never);

    const { Probe, snapshots } = makeProbe(
      (props: { organizationId: string | null }) =>
        useUnitOperationalDetails({ ...base, ...props }).data,
    );
    const view = render(<Probe organizationId="org-A" />);
    gateA.resolve({ data: [execRow("exec-A", "STALE-A")], error: null });
    await waitFor(() => {
      const last = snapshots[snapshots.length - 1] as unknown as Array<{ taskTitle: string }>;
      expect(last.length).toBe(1);
      expect(last[0].taskTitle).toBe("STALE-A");
    });
    const aPublishedAt = snapshots.length;

    view.rerender(<Probe organizationId="org-B" />);

    const firstB = snapshots[aPublishedAt] as unknown as Array<{ taskTitle: string }>;
    expect(firstB).toEqual([]);
    for (const snap of snapshots.slice(aPublishedAt)) {
      const list = snap as unknown as Array<{ taskTitle: string }>;
      for (const e of list) expect(e.taskTitle).not.toBe("STALE-A");
    }

    gateB.resolve({ data: [execRow("exec-B", "B-EXEC")], error: null });
    await waitFor(() => {
      const last = snapshots[snapshots.length - 1] as unknown as Array<{ taskTitle: string }>;
      expect(last.length).toBe(1);
      expect(last[0].taskTitle).toBe("B-EXEC");
    });
    expect(countOrgQueries(rec.queries, "org-A")).toBe(2); // execuções + evidências de A
  });

  it("refresh captured under A is a noop under B: zero new queries with A's filters", async () => {
    const gateA = deferred<QResult>();
    const gateB = deferred<QResult>();
    const rec = makeRecordingFrom({ gates: { "org-A": gateA, "org-B": gateB }, defaultGate: gateB });
    vi.mocked(supabase.from).mockImplementation(rec.from as never);

    const { Probe, snapshots } = makeProbe((props: { organizationId: string | null }) =>
      useUnitOperationalDetails({ ...base, ...props }),
    );
    const view = render(<Probe organizationId="org-A" />);
    gateA.resolve({ data: [execRow("exec-A", "STALE-A")], error: null });
    await waitFor(() => {
      const last = snapshots[snapshots.length - 1] as UseUnitOperationalDetailsResult;
      expect(last.data.length).toBe(1);
    });
    const aPublishedAt = snapshots.length;
    const refreshA = (snapshots[aPublishedAt - 1] as UseUnitOperationalDetailsResult).refresh;

    view.rerender(<Probe organizationId="org-B" />);
    await act(async () => {
      await drain();
    });
    const before = rec.queries.length;
    const aBefore = countOrgQueries(rec.queries, "org-A");

    await act(async () => {
      await refreshA();
    });

    expect(rec.queries.length).toBe(before);
    expect(countOrgQueries(rec.queries, "org-A")).toBe(aBefore);

    gateB.resolve({ data: [execRow("exec-B", "B-EXEC")], error: null });
    await waitFor(() => {
      const last = snapshots[snapshots.length - 1] as UseUnitOperationalDetailsResult;
      expect(last.data[0].taskTitle).toBe("B-EXEC");
      expect(last.data.every((e) => e.taskTitle !== "STALE-A")).toBe(true);
    });
  });

  it("unitId change invalidates callbacks captured with the old unitId", async () => {
    // Fila: carga A (execuções + evidências) → carga B (execuções + evidências).
    const gateAExec = deferred<QResult>();
    const gateAEv = deferred<QResult>();
    const gateBExec = deferred<QResult>();
    const gateBEv = deferred<QResult>();
    const rec = makeRecordingFrom({ queue: [gateAExec, gateAEv, gateBExec, gateBEv] });
    vi.mocked(supabase.from).mockImplementation(rec.from as never);

    const orgBase = { organizationId: "org-1" as string | null, startDate: "2026-01-01", endDate: "2026-01-31" };
    const { Probe, snapshots } = makeProbe((props: { unitId: string }) =>
      useUnitOperationalDetails({ ...orgBase, unitId: props.unitId }),
    );
    const view = render(<Probe unitId="unit-1" />);
    gateAExec.resolve({ data: [execRow("exec-1", "UNIT-1-TASK")], error: null });
    gateAEv.resolve({ data: [], error: null });
    await waitFor(() => {
      const last = snapshots[snapshots.length - 1] as UseUnitOperationalDetailsResult;
      expect(last.data[0].taskTitle).toBe("UNIT-1-TASK");
    });
    const aPublishedAt = snapshots.length;
    const refreshA = (snapshots[aPublishedAt - 1] as UseUnitOperationalDetailsResult).refresh;

    view.rerender(<Probe unitId="unit-2" />);
    await act(async () => {
      await drain();
    });
    const before = rec.queries.length;
    const oldUnitQueries = rec.queries.filter((q) => hasEq(q, "unit_id", "unit-1")).length;

    await act(async () => {
      await refreshA();
    });

    expect(rec.queries.length).toBe(before);
    expect(rec.queries.filter((q) => hasEq(q, "unit_id", "unit-1")).length).toBe(oldUnitQueries);
    expect(rec.queries.some((q) => hasEq(q, "unit_id", "unit-2"))).toBe(true);

    gateBExec.resolve({ data: [execRow("exec-2", "UNIT-2-TASK")], error: null });
    gateBEv.resolve({ data: [], error: null });
    await waitFor(() => {
      const last = snapshots[snapshots.length - 1] as UseUnitOperationalDetailsResult;
      expect(last.data[0].taskTitle).toBe("UNIT-2-TASK");
    });
  });

  it("dates change invalidates callbacks captured with the old dates", async () => {
    // Fila: carga A (execuções + evidências) → carga B (execuções + evidências).
    const gateAExec = deferred<QResult>();
    const gateAEv = deferred<QResult>();
    const gateBExec = deferred<QResult>();
    const gateBEv = deferred<QResult>();
    const rec = makeRecordingFrom({ queue: [gateAExec, gateAEv, gateBExec, gateBEv] });
    vi.mocked(supabase.from).mockImplementation(rec.from as never);

    const orgBase = { organizationId: "org-1" as string | null, unitId: "unit-1", endDate: "2026-01-31" };
    const { Probe, snapshots } = makeProbe((props: { startDate: string }) =>
      useUnitOperationalDetails({ ...orgBase, startDate: props.startDate }),
    );
    const view = render(<Probe startDate="2026-01-01" />);
    gateAExec.resolve({ data: [execRow("exec-1", "JAN-TASK")], error: null });
    gateAEv.resolve({ data: [], error: null });
    await waitFor(() => {
      const last = snapshots[snapshots.length - 1] as UseUnitOperationalDetailsResult;
      expect(last.data[0].taskTitle).toBe("JAN-TASK");
    });
    const aPublishedAt = snapshots.length;
    const refreshA = (snapshots[aPublishedAt - 1] as UseUnitOperationalDetailsResult).refresh;

    view.rerender(<Probe startDate="2026-02-01" />);
    await act(async () => {
      await drain();
    });
    const before = rec.queries.length;
    const oldStart = "2026-01-01T00:00:00.000Z";
    const oldDateQueries = rec.queries.filter((q) => hasRange(q, "scheduled_at", oldStart)).length;

    await act(async () => {
      await refreshA();
    });

    expect(rec.queries.length).toBe(before);
    expect(rec.queries.filter((q) => hasRange(q, "scheduled_at", oldStart)).length).toBe(oldDateQueries);
    expect(
      rec.queries.some((q) => hasRange(q, "scheduled_at", "2026-02-01T00:00:00.000Z")),
    ).toBe(true);

    gateBExec.resolve({ data: [execRow("exec-2", "FEV-TASK")], error: null });
    gateBEv.resolve({ data: [], error: null });
    await waitFor(() => {
      const last = snapshots[snapshots.length - 1] as UseUnitOperationalDetailsResult;
      expect(last.data[0].taskTitle).toBe("FEV-TASK");
    });
  });
});

// ---------------------------------------------------------------------------
// 6B.1B.3 — callback criado com enabled=false deve permanecer noop para sempre:
// mesmo depois de reabilitar o MESMO escopo, durante e depois da carga atual.
// ---------------------------------------------------------------------------
describe("6B.1B.3 — disabled-then-coupled refresh stays noop after re-enable", () => {
  it("useUnitCompliance: refreshDisabled stays noop even after enabled=true, during and after the current load", async () => {
    const gateCurrent = deferred<QResult>();
    const rec = makeRecordingFrom({ defaultGate: gateCurrent });
    vi.mocked(supabase.from).mockImplementation(rec.from as never);

    const base = { startDate: "2026-01-01", endDate: "2026-01-31" };
    const { Probe, snapshots } = makeProbe(
      (props: { enabled?: boolean }) =>
        useUnitCompliance({ ...base, organizationId: "org-1", ...props }),
    );
    const view = render(<Probe enabled={false} />);
    const refreshDisabled = (snapshots[snapshots.length - 1] as UseUnitComplianceResult).refresh;

    // Desabilitado: zero consulta.
    expect(rec.queries.length).toBe(0);

    // Reabilita o MESMO escopo: a carga atual inicia exatamente uma consulta,
    // com o filtro de organização atual.
    view.rerender(<Probe enabled={true} />);
    expect(rec.queries.length).toBe(1);
    expect(rec.queries[0].table).toBe("analytics_unit_daily_compliance");
    expect(hasEq(rec.queries[0], "organization_id", "org-1")).toBe(true);

    // refreshDisabled (closure |off) chamado DURANTE a carga atual: noop.
    await act(async () => {
      await refreshDisabled();
    });
    expect(rec.queries.length).toBe(1);

    gateCurrent.resolve({ data: [dailyRow("org-1", "u1", "UNIT")], error: null });
    await waitFor(() => {
      const last = snapshots[snapshots.length - 1] as UseUnitComplianceResult;
      expect(last.data.length).toBe(1);
      expect(last.loading).toBe(false);
    });

    // refreshDisabled DE NOVO depois do sucesso: continua noop e o estado
    // segue pertencendo à carga atual (UNIT, nunca UNIT-AFTER).
    await act(async () => {
      await refreshDisabled();
    });
    expect(rec.queries.length).toBe(1);
    const final = snapshots[snapshots.length - 1] as UseUnitComplianceResult;
    expect(final.data[0].unitName).toBe("UNIT");
    expect(final.loading).toBe(false);
    expect(final.error).toBeNull();
  });

  it("useInsights: refreshDisabled stays noop after re-enable; current load starts exactly its 5 queries; old callback adds no channel; success stays with the current load", async () => {
    const gateCurrent = deferred<QResult>();
    const rec = makeRecordingFrom({ defaultGate: gateCurrent });
    vi.mocked(supabase.from).mockImplementation(rec.from as never);

    const { Probe, snapshots } = makeProbe(
      (props: { enabled?: boolean }) =>
        useInsights({ organizationId: "org-1", ...props }),
    );
    const view = render(<Probe enabled={false} />);
    const refreshDisabled = (snapshots[snapshots.length - 1] as ReturnType<typeof useInsights>).refresh;

    // Desabilitado: zero consulta e zero canal.
    expect(rec.queries.length).toBe(0);
    expect(vi.mocked(supabase.channel).mock.calls.length).toBe(0);

    // Reabilita o MESMO escopo: a carga atual inicia exatamente suas 5
    // consultas, todas na organização atual, e um único canal.
    view.rerender(<Probe enabled={true} />);
    expect(rec.queries.length).toBe(5);
    expect(rec.queries.every((q) => hasEq(q, "organization_id", "org-1"))).toBe(true);
    expect(vi.mocked(supabase.channel).mock.calls.length).toBe(1);

    // refreshDisabled (closure |off) durante a carga: noop — zero consulta
    // adicional e zero canal novo.
    await act(async () => {
      await refreshDisabled();
    });
    expect(rec.queries.length).toBe(5);
    expect(vi.mocked(supabase.channel).mock.calls.length).toBe(1);

    gateCurrent.resolve({
      data: [
        overdueRow("TASK", "t1"),
        overdueRow("TASK", "t1"),
        overdueRow("TASK", "t4"),
        overdueRow("TASK", "t4"),
      ],
      error: null,
    });
    await waitFor(() => {
      const last = snapshots[snapshots.length - 1] as ReturnType<typeof useInsights>;
      expect(last.insights.length).toBeGreaterThan(0);
      expect(last.loading).toBe(false);
    });

    // refreshDisabled DE NOVO depois do sucesso: continua noop, sem canal
    // novo; insights/error/isEmpty/loading seguem da carga atual.
    await act(async () => {
      await refreshDisabled();
    });
    expect(rec.queries.length).toBe(5);
    expect(vi.mocked(supabase.channel).mock.calls.length).toBe(1);
    const final = snapshots[snapshots.length - 1] as ReturnType<typeof useInsights>;
    expect(final.insights.some((i) => i.title.includes("TASK"))).toBe(true);
    expect(final.error).toBe(false);
    expect(final.isEmpty).toBe(false);
    expect(final.loading).toBe(false);
  });
});
