/**
 * Execution 6B.2D — hook de detalhe da unidade (RPC escopada).
 *
 * Prova:
 *   - a RPC recebe exatamente workspace/unidade/período, sem reconversão de fuso;
 *   - sem unidade, sem workspace ou desabilitado ⇒ zero chamada;
 *   - o primeiro render do escopo novo já é neutro e em carregamento;
 *   - resposta antiga (inclusive erro) nunca publica sob o escopo atual;
 *   - A→B→A invalida callbacks do primeiro A;
 *   - refresh desabilitado é noop; rejeição termina em fail-closed.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, act, waitFor } from "@testing-library/react";
import { useUnitOccurrenceDetails } from "@/hooks/useUnitOccurrenceDetails";

const ORG_A = "aaaaaaaa-1111-4111-8111-111111111111";
const ORG_B = "bbbbbbbb-2222-4222-8222-222222222222";
const UNIT_A = "cccccccc-3333-4333-8333-333333333333";
const UNIT_B = "dddddddd-4444-4444-8444-444444444444";
const DAY = "2026-09-13";

type RpcResult = { data: unknown; error: unknown };

const h = vi.hoisted(() => ({ rpc: vi.fn() }));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { rpc: h.rpc },
}));

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const calls: Array<{
  args: Record<string, unknown>;
  resolve: (v: RpcResult) => void;
  reject: (e: unknown) => void;
}> = [];

beforeEach(() => {
  calls.length = 0;
  h.rpc.mockReset();
  h.rpc.mockImplementation((_name: string, args: Record<string, unknown>) => {
    const d = deferred<RpcResult>();
    calls.push({ args, resolve: d.resolve, reject: d.reject });
    return d.promise;
  });
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

function occurrenceRow(over: Record<string, unknown> = {}) {
  return {
    occurrence_id: "11111111-1111-4111-8111-111111111111",
    schedule_id: "22222222-2222-4222-8222-222222222222",
    checklist_id: "33333333-3333-4333-8333-333333333333",
    checklist_title: "Abertura de loja",
    occurrence_date: DAY,
    due_at: "2026-09-13T12:00:00Z",
    started_at: null,
    completed_at: null,
    response_id: null,
    unit_id: UNIT_A,
    shift_id: null,
    shift_name: null,
    workspace_member_id: "44444444-4444-4444-8444-444444444444",
    responsible_name: "Ana",
    ...over,
  };
}

const ok = (data: unknown): RpcResult => ({ data, error: null });

function Probe({
  params,
  snapshot,
}: {
  params: Parameters<typeof useUnitOccurrenceDetails>[0];
  snapshot: Array<{ rows: number; loading: boolean; error: string | null }>;
}) {
  const r = useUnitOccurrenceDetails(params);
  snapshot.push({ rows: r.data.length, loading: r.loading, error: r.error });
  return <div data-testid="rows">{r.data.length}</div>;
}

describe("6B.2D details hook — chamada da RPC", () => {
  it("passa workspace, unidade e período exatamente como recebidos", async () => {
    const snapshot: Array<{ rows: number; loading: boolean; error: string | null }> = [];
    render(
      <Probe
        params={{
          unitId: UNIT_A,
          startDate: DAY,
          endDate: DAY,
          organizationId: ORG_A,
          enabled: true,
        }}
        snapshot={snapshot}
      />,
    );

    await waitFor(() => expect(calls).toHaveLength(1));
    expect(h.rpc).toHaveBeenCalledWith("list_workspace_execution_occurrences", {
      p_workspace_id: ORG_A,
      p_unit_id: UNIT_A,
      p_start_date: DAY,
      p_end_date: DAY,
    });

    await act(async () => calls[0].resolve(ok([occurrenceRow()])));
    expect(snapshot.at(-1)).toEqual({ rows: 1, loading: false, error: null });
  });

  it("não converte datas nem consulta por outro escopo", async () => {
    const snapshot: Array<{ rows: number; loading: boolean; error: string | null }> = [];
    render(
      <Probe
        params={{
          unitId: UNIT_A,
          startDate: "2026-09-01",
          endDate: "2026-09-30",
          organizationId: ORG_A,
          enabled: true,
        }}
        snapshot={snapshot}
      />,
    );
    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0].args.p_start_date).toBe("2026-09-01");
    expect(calls[0].args.p_end_date).toBe("2026-09-30");
    expect(Object.keys(calls[0].args).sort()).toEqual([
      "p_end_date",
      "p_start_date",
      "p_unit_id",
      "p_workspace_id",
    ]);
  });

  it("sem unidade ⇒ zero chamada e estado neutro", async () => {
    const snapshot: Array<{ rows: number; loading: boolean; error: string | null }> = [];
    render(
      <Probe
        params={{
          unitId: null,
          startDate: DAY,
          endDate: DAY,
          organizationId: ORG_A,
          enabled: true,
        }}
        snapshot={snapshot}
      />,
    );
    await act(async () => {});
    expect(h.rpc).not.toHaveBeenCalled();
    expect(snapshot.at(-1)).toEqual({ rows: 0, loading: false, error: null });
  });

  it("sem workspace ⇒ zero chamada", async () => {
    const snapshot: Array<{ rows: number; loading: boolean; error: string | null }> = [];
    render(
      <Probe
        params={{
          unitId: UNIT_A,
          startDate: DAY,
          endDate: DAY,
          organizationId: null,
          enabled: true,
        }}
        snapshot={snapshot}
      />,
    );
    await act(async () => {});
    expect(h.rpc).not.toHaveBeenCalled();
  });

  it("enabled=false ⇒ zero chamada, mesmo com escopo completo", async () => {
    const snapshot: Array<{ rows: number; loading: boolean; error: string | null }> = [];
    render(
      <Probe
        params={{
          unitId: UNIT_A,
          startDate: DAY,
          endDate: DAY,
          organizationId: ORG_A,
          enabled: false,
        }}
        snapshot={snapshot}
      />,
    );
    await act(async () => {});
    expect(h.rpc).not.toHaveBeenCalled();
    expect(snapshot.at(-1)).toEqual({ rows: 0, loading: false, error: null });
  });

  it("refresh desabilitado é noop; habilitado consulta de novo", async () => {
    const refreshRef: { current: (() => Promise<void>) | null } = { current: null };

    function RefreshProbe({ enabled }: { enabled: boolean }) {
      const r = useUnitOccurrenceDetails({
        unitId: UNIT_A,
        startDate: DAY,
        endDate: DAY,
        organizationId: ORG_A,
        enabled,
      });
      refreshRef.current = r.refresh;
      return <div />;
    }

    const view = render(<RefreshProbe enabled={false} />);
    await act(async () => {});
    expect(h.rpc).not.toHaveBeenCalled();

    await act(async () => {
      await refreshRef.current!();
    });
    expect(h.rpc).not.toHaveBeenCalled();

    view.rerender(<RefreshProbe enabled />);
    await waitFor(() => expect(h.rpc).toHaveBeenCalledTimes(1));
    await act(async () => calls[0].resolve(ok([occurrenceRow()])));

    // O refresh habilitado abre uma NOVA consulta: não se espera a promise dele
    // (a resposta é controlada pelo deferred abaixo), apenas que a chamada ocorra.
    let pending: Promise<void> | undefined;
    await act(async () => {
      pending = refreshRef.current!();
    });
    expect(h.rpc).toHaveBeenCalledTimes(2);
    await act(async () => calls[1].resolve(ok([occurrenceRow()])));
    await act(async () => {
      await pending;
    });
  });
});

describe("6B.2D details hook — troca de escopo e corridas", () => {
  it("o primeiro render da nova unidade já é neutro e em carregamento", async () => {
    const snapshot: Array<{ rows: number; loading: boolean; error: string | null }> = [];
    const view = render(
      <Probe
        params={{
          unitId: UNIT_A,
          startDate: DAY,
          endDate: DAY,
          organizationId: ORG_A,
          enabled: true,
        }}
        snapshot={snapshot}
      />,
    );
    await waitFor(() => expect(calls).toHaveLength(1));
    await act(async () => calls[0].resolve(ok([occurrenceRow()])));
    expect(snapshot.at(-1)!.rows).toBe(1);

    snapshot.length = 0;
    view.rerender(
      <Probe
        params={{
          unitId: UNIT_B,
          startDate: DAY,
          endDate: DAY,
          organizationId: ORG_A,
          enabled: true,
        }}
        snapshot={snapshot}
      />,
    );
    expect(snapshot.at(-1)).toEqual({ rows: 0, loading: true, error: null });

    await waitFor(() => expect(calls).toHaveLength(2));
    expect(calls[1].args.p_unit_id).toBe(UNIT_B);
  });

  it("resposta tardia da unidade A não publica sob a unidade B", async () => {
    const snapshot: Array<{ rows: number; loading: boolean; error: string | null }> = [];
    const view = render(
      <Probe
        params={{
          unitId: UNIT_A,
          startDate: DAY,
          endDate: DAY,
          organizationId: ORG_A,
          enabled: true,
        }}
        snapshot={snapshot}
      />,
    );
    await waitFor(() => expect(calls).toHaveLength(1));

    view.rerender(
      <Probe
        params={{
          unitId: UNIT_B,
          startDate: DAY,
          endDate: DAY,
          organizationId: ORG_A,
          enabled: true,
        }}
        snapshot={snapshot}
      />,
    );
    await waitFor(() => expect(calls).toHaveLength(2));

    await act(async () => calls[0].resolve(ok([occurrenceRow()])));
    expect(snapshot.at(-1)).toEqual({ rows: 0, loading: true, error: null });

    await act(async () => calls[1].resolve(ok([occurrenceRow()])));
    expect(snapshot.at(-1)).toEqual({ rows: 1, loading: false, error: null });
  });

  it("erro de A não contamina sucesso de B", async () => {
    const snapshot: Array<{ rows: number; loading: boolean; error: string | null }> = [];
    const view = render(
      <Probe
        params={{
          unitId: UNIT_A,
          startDate: DAY,
          endDate: DAY,
          organizationId: ORG_A,
          enabled: true,
        }}
        snapshot={snapshot}
      />,
    );
    await waitFor(() => expect(calls).toHaveLength(1));

    view.rerender(
      <Probe
        params={{
          unitId: UNIT_B,
          startDate: DAY,
          endDate: DAY,
          organizationId: ORG_A,
          enabled: true,
        }}
        snapshot={snapshot}
      />,
    );
    await waitFor(() => expect(calls).toHaveLength(2));

    await act(async () =>
      calls[0].resolve({ data: null, error: { message: "permission denied for function" } }),
    );
    expect(snapshot.at(-1)).toEqual({ rows: 0, loading: true, error: null });

    await act(async () => calls[1].resolve(ok([occurrenceRow()])));
    expect(snapshot.at(-1)).toEqual({ rows: 1, loading: false, error: null });
  });

  it("A→B→A invalida o refresh do primeiro A", async () => {
    const snapshot: Array<{ rows: number; loading: boolean; error: string | null }> = [];
    const refreshRef: { current: (() => Promise<void>) | null } = { current: null };

    function CycleProbe({ unitId }: { unitId: string }) {
      const r = useUnitOccurrenceDetails({
        unitId,
        startDate: DAY,
        endDate: DAY,
        organizationId: ORG_A,
        enabled: true,
      });
      refreshRef.current = r.refresh;
      snapshot.push({ rows: r.data.length, loading: r.loading, error: r.error });
      return <div />;
    }

    const view = render(<CycleProbe unitId={UNIT_A} />);
    await waitFor(() => expect(calls).toHaveLength(1));
    await act(async () => calls[0].resolve(ok([occurrenceRow()])));
    const staleRefresh = refreshRef.current!;

    view.rerender(<CycleProbe unitId={UNIT_B} />);
    await waitFor(() => expect(calls).toHaveLength(2));
    await act(async () => calls[1].resolve(ok([occurrenceRow()])));

    snapshot.length = 0;
    view.rerender(<CycleProbe unitId={UNIT_A} />);
    expect(snapshot.at(-1)).toEqual({ rows: 0, loading: true, error: null });
    await waitFor(() => expect(calls).toHaveLength(3));

    const before = h.rpc.mock.calls.length;
    await act(async () => {
      await staleRefresh();
    });
    expect(h.rpc.mock.calls.length).toBe(before);

    await act(async () => calls[2].resolve(ok([occurrenceRow()])));
    expect(snapshot.at(-1)).toEqual({ rows: 1, loading: false, error: null });
  });

  it("rejeição termina em fail-closed com mensagem genérica", async () => {
    const snapshot: Array<{ rows: number; loading: boolean; error: string | null }> = [];
    render(
      <Probe
        params={{
          unitId: UNIT_A,
          startDate: DAY,
          endDate: DAY,
          organizationId: ORG_A,
          enabled: true,
        }}
        snapshot={snapshot}
      />,
    );
    await waitFor(() => expect(calls).toHaveLength(1));

    await act(async () => calls[0].reject(new Error("network down")));

    const last = snapshot.at(-1)!;
    expect(last).toEqual({
      rows: 0,
      loading: false,
      error: "Falha ao carregar as rotinas da unidade.",
    });
    expect(last.error).not.toMatch(
      /list_workspace_execution_occurrences|relation|permission denied/i,
    );
  });

  it("unmount: resposta pendente não publica", async () => {
    const snapshot: Array<{ rows: number; loading: boolean; error: string | null }> = [];
    const view = render(
      <Probe
        params={{
          unitId: UNIT_A,
          startDate: DAY,
          endDate: DAY,
          organizationId: ORG_A,
          enabled: true,
        }}
        snapshot={snapshot}
      />,
    );
    await waitFor(() => expect(calls).toHaveLength(1));

    const before = snapshot.length;
    view.unmount();
    await act(async () => calls[0].resolve(ok([occurrenceRow()])));
    expect(snapshot).toHaveLength(before);
  });
});
