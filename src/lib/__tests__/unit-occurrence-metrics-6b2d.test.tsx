/**
 * Execution 6B.2D — hook de métricas de rotinas: escopo, ciclo e fail-closed.
 *
 * Prova comportamento real com Promises DEFERRED resolvidas fora de ordem:
 *   - o filtro de organização é obrigatório e viaja em toda consulta;
 *   - enabled=false / sem workspace ⇒ zero consulta e estado neutro;
 *   - o PRIMEIRO render do escopo B (antes dos efeitos) já é neutro;
 *   - resposta tardia de A nunca publica sob B;
 *   - A→B→A não revalida callbacks do primeiro A (cycle identity) e um refresh
 *     antigo é noop;
 *   - Promise rejeitada termina em fail-closed com mensagem genérica.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, act, waitFor } from "@testing-library/react";
import { useUnitOccurrenceMetrics } from "@/hooks/useUnitOccurrenceMetrics";

const ORG_A = "aaaaaaaa-1111-4111-8111-111111111111";
const ORG_B = "bbbbbbbb-2222-4222-8222-222222222222";
const UNIT = "cccccccc-3333-4333-8333-333333333333";
const DAY = "2026-09-13";

type ViewResult = { data: unknown; error: unknown };

const h = vi.hoisted(() => ({
  from: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: h.from },
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

type Query = {
  filters: Record<string, unknown>;
  resolve: (v: ViewResult) => void;
  reject: (e: unknown) => void;
};

const queries: Query[] = [];

function makeBuilder() {
  const filters: Record<string, unknown> = {};
  const d = deferred<ViewResult>();
  const record: Query = { filters, resolve: d.resolve, reject: d.reject };
  queries.push(record);

  const b: Record<string, unknown> = {};
  const chain = () => b;
  Object.assign(b, {
    select: chain,
    eq: (c: string, v: unknown) => ((filters[c] = v), b),
    gte: (c: string, v: unknown) => ((filters[`gte:${c}`] = v), b),
    lte: (c: string, v: unknown) => ((filters[`lte:${c}`] = v), b),
    then: (onF: (v: ViewResult) => unknown, onR: (e: unknown) => unknown) =>
      d.promise.then(onF, onR),
  });
  return b;
}

/** Linha da view para uma unidade/dia (contadores consistentes). */
function viewRow(unitId: string, over: Record<string, unknown> = {}) {
  return {
    organization_id: ORG_A,
    unit_id: unitId,
    unit_name: `Unidade ${unitId.slice(0, 2)}`,
    reference_date: DAY,
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

const ok = (data: unknown): ViewResult => ({ data, error: null });

beforeEach(() => {
  queries.length = 0;
  h.from.mockReset();
  h.from.mockImplementation(() => makeBuilder());
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

/** Probe que registra o valor de CADA render (inclusive antes dos efeitos). */
function Probe({
  params,
  snapshot,
}: {
  params: Parameters<typeof useUnitOccurrenceMetrics>[0];
  snapshot: Array<{ rows: number; loading: boolean; error: string | null }>;
}) {
  const result = useUnitOccurrenceMetrics(params);
  snapshot.push({
    rows: result.data.length,
    loading: result.loading,
    error: result.error,
  });
  return <div data-testid="rows">{result.data.length}</div>;
}

describe("6B.2D metrics hook — escopo da consulta", () => {
  it("envia organization_id + datas + unit_id (quando informado)", async () => {
    const snapshot: Array<{ rows: number; loading: boolean; error: string | null }> = [];
    render(
      <Probe
        params={{
          startDate: DAY,
          endDate: DAY,
          unitId: UNIT,
          organizationId: ORG_A,
          enabled: true,
        }}
        snapshot={snapshot}
      />,
    );

    await waitFor(() => expect(queries).toHaveLength(1));
    expect(queries[0].filters).toMatchObject({
      organization_id: ORG_A,
      unit_id: UNIT,
      "gte:reference_date": DAY,
      "lte:reference_date": DAY,
    });

    await act(async () => queries[0].resolve(ok([viewRow(UNIT)])));
    expect(snapshot.at(-1)!.rows).toBe(1);
  });

  it("sem unidade não envia unit_id, mas mantém organização e período", async () => {
    const snapshot: Array<{ rows: number; loading: boolean; error: string | null }> = [];
    render(
      <Probe
        params={{ startDate: DAY, endDate: DAY, organizationId: ORG_A, enabled: true }}
        snapshot={snapshot}
      />,
    );

    await waitFor(() => expect(queries).toHaveLength(1));
    expect(queries[0].filters).not.toHaveProperty("unit_id");
    expect(queries[0].filters.organization_id).toBe(ORG_A);
  });

  it("enabled=false ⇒ zero consulta e estado neutro (nunca um zero falso de sucesso)", async () => {
    const snapshot: Array<{ rows: number; loading: boolean; error: string | null }> = [];
    render(
      <Probe
        params={{ startDate: DAY, endDate: DAY, organizationId: ORG_A, enabled: false }}
        snapshot={snapshot}
      />,
    );

    await act(async () => {});
    expect(h.from).not.toHaveBeenCalled();
    expect(snapshot.at(-1)).toEqual({ rows: 0, loading: false, error: null });
  });

  it("sem organizationId ⇒ zero consulta", async () => {
    const snapshot: Array<{ rows: number; loading: boolean; error: string | null }> = [];
    render(
      <Probe
        params={{ startDate: DAY, endDate: DAY, organizationId: null, enabled: true }}
        snapshot={snapshot}
      />,
    );

    await act(async () => {});
    expect(h.from).not.toHaveBeenCalled();
    expect(snapshot.at(-1)).toEqual({ rows: 0, loading: false, error: null });
  });

  it("refresh enquanto desabilitado é noop (zero consulta)", async () => {
    const snapshot: Array<{ rows: number; loading: boolean; error: string | null }> = [];
    const refreshRef: { current: (() => Promise<void>) | null } = { current: null };

    function RefreshProbe() {
      const r = useUnitOccurrenceMetrics({
        startDate: DAY,
        endDate: DAY,
        organizationId: ORG_A,
        enabled: false,
      });
      refreshRef.current = r.refresh;
      return <div />;
    }
    render(<RefreshProbe />);
    await act(async () => {});
    expect(h.from).not.toHaveBeenCalled();

    await act(async () => {
      await refreshRef.current!();
    });
    expect(h.from).not.toHaveBeenCalled();
    expect(snapshot).toHaveLength(0);
  });

  it("habilitar (false → true) no MESMO escopo consulta e não mostra vazio concluído", async () => {
    const snapshot: Array<{ rows: number; loading: boolean; error: string | null }> = [];
    const view = render(
      <Probe
        params={{ startDate: DAY, endDate: DAY, organizationId: ORG_A, enabled: false }}
        snapshot={snapshot}
      />,
    );
    await act(async () => {});
    expect(h.from).not.toHaveBeenCalled();

    view.rerender(
      <Probe
        params={{ startDate: DAY, endDate: DAY, organizationId: ORG_A, enabled: true }}
        snapshot={snapshot}
      />,
    );
    // O primeiro render habilitado já indica carregamento, não um vazio concluído.
    expect(snapshot.at(-1)).toEqual({ rows: 0, loading: true, error: null });

    await waitFor(() => expect(queries).toHaveLength(1));
    await act(async () => queries[0].resolve(ok([viewRow(UNIT)])));
    expect(snapshot.at(-1)).toEqual({ rows: 1, loading: false, error: null });
  });

  it("estado publicado pertence só ao escopo atual: nenhuma linha de A sob B", async () => {
    const snapshot: Array<{ rows: number; loading: boolean; error: string | null }> = [];
    const view = render(
      <Probe
        params={{ startDate: DAY, endDate: DAY, organizationId: ORG_A, enabled: true }}
        snapshot={snapshot}
      />,
    );
    await waitFor(() => expect(queries).toHaveLength(1));
    await act(async () => queries[0].resolve(ok([viewRow(UNIT)])));
    expect(snapshot.at(-1)!.rows).toBe(1);

    snapshot.length = 0;
    view.rerender(
      <Probe
        params={{ startDate: DAY, endDate: DAY, organizationId: ORG_B, enabled: true }}
        snapshot={snapshot}
      />,
    );

    // O PRIMEIRO render de B (antes dos efeitos) já é neutro E em carregamento.
    expect(snapshot.at(-1)).toEqual({ rows: 0, loading: true, error: null });

    await waitFor(() => expect(queries).toHaveLength(2));
    expect(queries[1].filters.organization_id).toBe(ORG_B);
  });

  it("resposta tardia de A é descartada depois da troca para B", async () => {
    const snapshot: Array<{ rows: number; loading: boolean; error: string | null }> = [];
    const view = render(
      <Probe
        params={{ startDate: DAY, endDate: DAY, organizationId: ORG_A, enabled: true }}
        snapshot={snapshot}
      />,
    );
    await waitFor(() => expect(queries).toHaveLength(1));

    // Troca para B com A ainda pendente.
    view.rerender(
      <Probe
        params={{ startDate: DAY, endDate: DAY, organizationId: ORG_B, enabled: true }}
        snapshot={snapshot}
      />,
    );
    await waitFor(() => expect(queries).toHaveLength(2));

    // A responde DEPOIS, já sob o escopo B.
    await act(async () => queries[0].resolve(ok([viewRow(UNIT)])));
    expect(snapshot.at(-1)).toEqual({ rows: 0, loading: true, error: null });

    await act(async () => queries[1].resolve(ok([viewRow(UNIT)])));
    expect(snapshot.at(-1)).toEqual({ rows: 1, loading: false, error: null });
  });

  it("A→B→A não serve o resultado do primeiro A e ignora refresh antigo (cycle identity)", async () => {
    const snapshot: Array<{ rows: number; loading: boolean; error: string | null }> = [];
    const refreshRef: { current: (() => Promise<void>) | null } = { current: null };

    function CycleProbe({ org }: { org: string }) {
      const r = useUnitOccurrenceMetrics({
        startDate: DAY,
        endDate: DAY,
        organizationId: org,
        enabled: true,
      });
      refreshRef.current = r.refresh;
      snapshot.push({ rows: r.data.length, loading: r.loading, error: r.error });
      return <div />;
    }

    const view = render(<CycleProbe org={ORG_A} />);
    await waitFor(() => expect(queries).toHaveLength(1));
    await act(async () => queries[0].resolve(ok([viewRow(UNIT)])));
    expect(snapshot.at(-1)!.rows).toBe(1);

    // Guarda o refresh do PRIMEIRO ciclo de A.
    const staleRefresh = refreshRef.current!;

    view.rerender(<CycleProbe org={ORG_B} />);
    await waitFor(() => expect(queries).toHaveLength(2));
    await act(async () => queries[1].resolve(ok([viewRow(UNIT)])));

    // Volta para A: o conteúdo do escopo é idêntico ao do primeiro A, mas é um
    // ciclo novo — nada do ciclo anterior pode ser servido como resultado atual.
    snapshot.length = 0;
    view.rerender(<CycleProbe org={ORG_A} />);
    expect(snapshot.at(-1)).toEqual({ rows: 0, loading: true, error: null });

    await waitFor(() => expect(queries).toHaveLength(3));

    // Um callback do primeiro A permanece stale para sempre.
    const before = queries.length;
    await act(async () => {
      await staleRefresh();
    });
    expect(queries).toHaveLength(before);

    await act(async () => queries[2].resolve(ok([viewRow(UNIT)])));
    expect(snapshot.at(-1)).toEqual({ rows: 1, loading: false, error: null });
  });

  it("Promise rejeitada termina em fail-closed com mensagem genérica", async () => {
    const snapshot: Array<{ rows: number; loading: boolean; error: string | null }> = [];
    render(
      <Probe
        params={{ startDate: DAY, endDate: DAY, organizationId: ORG_A, enabled: true }}
        snapshot={snapshot}
      />,
    );
    await waitFor(() => expect(queries).toHaveLength(1));

    await act(async () => queries[0].reject(new Error("network down")));

    const last = snapshot.at(-1)!;
    expect(last.loading).toBe(false);
    expect(last.rows).toBe(0);
    expect(last.error).toBe("Falha ao carregar rotinas agendadas.");
    expect(last.error).not.toMatch(
      /analytics_unit_daily_occurrences|organization_id|relation|postgres/i,
    );
  });

  it("erro do Supabase vira o mesmo fail-closed (não expõe SQL)", async () => {
    const snapshot: Array<{ rows: number; loading: boolean; error: string | null }> = [];
    render(
      <Probe
        params={{ startDate: DAY, endDate: DAY, organizationId: ORG_A, enabled: true }}
        snapshot={snapshot}
      />,
    );
    await waitFor(() => expect(queries).toHaveLength(1));

    await act(async () =>
      queries[0].resolve({
        data: null,
        error: { message: 'relation "analytics_unit_daily_occurrences" does not exist' },
      }),
    );

    const last = snapshot.at(-1)!;
    expect(last.error).toBe("Falha ao carregar rotinas agendadas.");
    expect(last.error).not.toMatch(/relation|does not exist/);
    expect(last.rows).toBe(0);
    expect(last.loading).toBe(false);
  });

  it("rejeição em A não contamina o escopo B", async () => {
    const snapshot: Array<{ rows: number; loading: boolean; error: string | null }> = [];
    const view = render(
      <Probe
        params={{ startDate: DAY, endDate: DAY, organizationId: ORG_A, enabled: true }}
        snapshot={snapshot}
      />,
    );
    await waitFor(() => expect(queries).toHaveLength(1));

    view.rerender(
      <Probe
        params={{ startDate: DAY, endDate: DAY, organizationId: ORG_B, enabled: true }}
        snapshot={snapshot}
      />,
    );
    await waitFor(() => expect(queries).toHaveLength(2));

    // A falha depois da troca: B não pode herdar o erro de A.
    await act(async () => queries[0].reject(new Error("boom")));
    expect(snapshot.at(-1)).toEqual({ rows: 0, loading: true, error: null });

    await act(async () => queries[1].resolve(ok([viewRow(UNIT)])));
    expect(snapshot.at(-1)).toEqual({ rows: 1, loading: false, error: null });
  });

  it("unmount: resposta pendente não publica nem dispara erro", async () => {
    const snapshot: Array<{ rows: number; loading: boolean; error: string | null }> = [];
    const view = render(
      <Probe
        params={{ startDate: DAY, endDate: DAY, organizationId: ORG_A, enabled: true }}
        snapshot={snapshot}
      />,
    );
    await waitFor(() => expect(queries).toHaveLength(1));

    const rendersBefore = snapshot.length;
    view.unmount();

    await act(async () => queries[0].resolve(ok([viewRow(UNIT)])));
    expect(snapshot).toHaveLength(rendersBefore);
    expect(snapshot.at(-1)).toEqual({ rows: 0, loading: true, error: null });
  });
});
