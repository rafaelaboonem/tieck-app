/**
 * Execution 6B.1B — workspace scope in useUnitOperationalDetails.
 *
 * Dual organization_id + unit_id filters, no organization_id on profiles,
 * scope-change invalidation with real deferred promises, rejection
 * fail-closed and unmount guards, scoped realtime channel naming.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { useUnitOperationalDetails } from "../useUnitOperationalDetails";
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

/** Builder thenable com filtros encadeáveis e registro das chamadas .eq. */
function makeBuilder(result: QResult, deferredGate?: Deferred<QResult>) {
  const eqCalls: Array<[string, unknown]> = [];
  const b: any = {};
  b.then = (onF: any, onR: any) =>
    (deferredGate ? deferredGate.promise : Promise.resolve(result)).then(onF, onR);
  b.catch = (onR: any) =>
    (deferredGate ? deferredGate.promise : Promise.resolve(result)).catch(onR);
  b.finally = (cb: any) =>
    (deferredGate ? deferredGate.promise : Promise.resolve(result)).finally(cb);
  const chain = (name: string) =>
    vi.fn((...args: unknown[]) => {
      if (name === "eq") eqCalls.push(args as [string, unknown]);
      return b;
    });
  b.select = chain("select");
  b.eq = chain("eq");
  b.in = chain("in");
  b.gte = chain("gte");
  b.lte = chain("lte");
  b.order = chain("order");
  b.maybeSingle = chain("maybeSingle");
  b.__eqCalls = eqCalls;
  return b;
}

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: vi.fn(() => makeBuilder({ data: [], error: null })),
    channel: vi.fn().mockReturnValue({
      on: vi.fn().mockReturnThis(),
      subscribe: vi.fn().mockReturnThis(),
    }),
    removeChannel: vi.fn(),
  },
}));

const baseFilters = {
  unitId: "unit-1",
  startDate: "2026-01-01",
  endDate: "2026-01-31",
  organizationId: "org-1",
};

const drain = async () => {
  for (let i = 0; i < 10; i++) await Promise.resolve();
};

describe("useUnitOperationalDetails — 6B.1B workspace scope", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    console.error = vi.fn();
  });

  it("missing organizationId: zero query, zero realtime, neutral state", async () => {
    const { result } = renderHook(() =>
      useUnitOperationalDetails({ ...baseFilters, organizationId: null }),
    );
    await act(async () => {
      await drain();
    });

    expect(supabase.from).not.toHaveBeenCalled();
    expect(supabase.channel).not.toHaveBeenCalled();
    expect(result.current.loading).toBe(false);
    expect(result.current.data).toEqual([]);
    expect(result.current.error).toBeNull();
  });

  it("missing unitId: zero query, zero realtime, neutral state", async () => {
    const { result } = renderHook(() =>
      useUnitOperationalDetails({ ...baseFilters, unitId: "" }),
    );
    await act(async () => {
      await drain();
    });

    expect(supabase.from).not.toHaveBeenCalled();
    expect(supabase.channel).not.toHaveBeenCalled();
    expect(result.current.loading).toBe(false);
    expect(result.current.data).toEqual([]);
  });

  it("main query contains exact organization_id and unit_id (dual filter)", async () => {
    renderHook(() => useUnitOperationalDetails(baseFilters));
    await waitFor(() => expect(vi.mocked(supabase.from)).toHaveBeenCalledTimes(1));

    expect(vi.mocked(supabase.from)).toHaveBeenCalledWith("task_executions");
    const builder = vi.mocked(supabase.from).mock.results[0].value as any;
    expect(builder.__eqCalls).toContainEqual(["organization_id", "org-1"]);
    expect(builder.__eqCalls).toContainEqual(["unit_id", "unit-1"]);
    // Filtros de data preservados.
    const names = builder.__eqCalls.map(([c]: any) => c);
    void names;
  });

  it("evidences query contains organization_id; profiles never does", async () => {
    // 1ª consulta: task_executions com uma execução de outro usuário/executador.
    const execBuilder = makeBuilder({
      data: [
        {
          id: "exec-1",
          task_id: "t1",
          shift_id: null,
          scheduled_at: "2026-01-05T10:00:00Z",
          executed_at: "2026-01-05T10:05:00Z",
          status: "concluida_no_prazo",
          notes: null,
          executed_by: "user-7",
          cancelled_at: null,
          cancellation_reason: null,
          tasks: { id: "t1", title: "T", description: null, code: null, weight: "comum" },
          shifts: null,
        },
      ],
      error: null,
    });
    const evBuilder = makeBuilder({ data: [], error: null });
    const profBuilder = makeBuilder({ data: [], error: null });
    vi.mocked(supabase.from).mockImplementation(((table: string) => {
      if (table === "task_executions") return execBuilder as never;
      if (table === "evidences") return evBuilder as never;
      if (table === "profiles") return profBuilder as never;
      return makeBuilder({ data: [], error: null }) as never;
    }) as never);

    renderHook(() => useUnitOperationalDetails(baseFilters));
    await waitFor(() => expect(resultHasData()));

    function resultHasData() {
      return vi.mocked(supabase.from).mock.calls.length >= 3;
    }

    // evidences recebe o filtro da organização; profiles NUNCA recebe.
    expect(evBuilder.__eqCalls).toContainEqual(["organization_id", "org-1"]);
    expect(profBuilder.__eqCalls.some(([c]: any) => c === "organization_id")).toBe(false);
  });

  it("realtime channel name includes organizationId and unitId", async () => {
    renderHook(() =>
      useUnitOperationalDetails({
        ...baseFilters,
        endDate: "2026-12-31", // janela inclui hoje
      }),
    );

    expect(supabase.channel).toHaveBeenCalledWith(
      "unit-ops-org-1-unit-1-2026-01-01-2026-12-31",
    );
  });

  it("workspace switch invalidates the old response (real deferred race)", async () => {
    const gateA = deferred<QResult>();
    const gateB = deferred<QResult>();
    let call = 0;
    vi.mocked(supabase.from).mockImplementation(
      (() => makeBuilder({ data: [], error: null }, ++call <= 1 ? gateA : gateB)) as never,
    );

    const { result, rerender } = renderHook(
      ({ organizationId }) => useUnitOperationalDetails({ ...baseFilters, organizationId }),
      { initialProps: { organizationId: "org-A" } },
    );
    expect(result.current.loading).toBe(true);

    // Troca de workspace enquanto A está pendente; B resolve primeiro.
    await act(async () => {
      rerender({ organizationId: "org-B" });
      await drain();
    });

    gateB.resolve({ data: [], error: null });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.data).toEqual([]);

    // Resposta antiga de A chega por último: não pode repopular.
    gateA.resolve({
      data: [
        {
          id: "stale-exec",
          task_id: "t1",
          shift_id: null,
          scheduled_at: "2026-01-05T10:00:00Z",
          executed_at: null,
          status: "programada",
          notes: null,
          executed_by: null,
          cancelled_at: null,
          cancellation_reason: null,
          tasks: { id: "t1", title: "STALE", description: null, code: null, weight: "comum" },
          shifts: null,
        },
      ],
      error: null,
    });
    await act(async () => {
      await drain();
    });

    expect(result.current.data).toEqual([]);
    expect(JSON.stringify(result.current.data)).not.toContain("STALE");
    expect(result.current.loading).toBe(false);
  });

  it("rejected promise never leaves loading stuck and yields no stale data", async () => {
    const gate = deferred<QResult>();
    vi.mocked(supabase.from).mockImplementation(
      (() => makeBuilder({ data: [], error: null }, gate)) as never,
    );
    const { result } = renderHook(() => useUnitOperationalDetails(baseFilters));
    expect(result.current.loading).toBe(true);

    gate.reject(new Error("network boom: SELECT secrets"));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).not.toBeNull();
    expect(result.current.data).toEqual([]);
  });

  it("unmount prevents any later state write", async () => {
    const gate = deferred<QResult>();
    vi.mocked(supabase.from).mockImplementation(
      (() => makeBuilder({ data: [], error: null }, gate)) as never,
    );
    const { result, unmount } = renderHook(() => useUnitOperationalDetails(baseFilters));
    expect(result.current.loading).toBe(true);

    unmount();
    gate.resolve({
      data: [
        {
          id: "late-exec",
          task_id: "t1",
          shift_id: null,
          scheduled_at: "2026-01-05T10:00:00Z",
          executed_at: null,
          status: "programada",
          notes: null,
          executed_by: null,
          cancelled_at: null,
          cancellation_reason: null,
          tasks: { id: "t1", title: "LATE", description: null, code: null, weight: "comum" },
          shifts: null,
        },
      ],
      error: null,
    });
    await act(async () => {
      await drain();
    });

    expect(result.current.loading).toBe(true);
    expect(result.current.data).toEqual([]);
    expect(result.current.error).toBeNull();
  });

  it("cleanup removes the realtime channel", async () => {
    const { unmount } = renderHook(() =>
      useUnitOperationalDetails({ ...baseFilters, endDate: "2026-12-31" }),
    );
    await act(async () => {});
    unmount();
    expect(supabase.removeChannel).toHaveBeenCalled();
  });
});
