/**
 * useChecklistActivity — série diária REAL de tarefas (atividade dos checklists).
 *
 * O que esta suíte protege:
 *   • escopo: `organization_id` obrigatório, `.eq` no cliente além da RLS, e
 *     SOMENTE as colunas usadas são pedidas (a view devolve muitas outras);
 *   • unidade/turno só entram na consulta quando selecionados — sem turno
 *     selecionado, NENHUM filtro de turno é aplicado (as partições com turno
 *     NULL continuam valendo);
 *   • sem workspace → zero consulta, estado neutro;
 *   • troca de workspace, de período, de unidade ou de turno NUNCA publica a
 *     série anterior (inclusive quando a resposta antiga chega depois);
 *   • erro é canal separado do vazio (nunca "sem atividade" quando falhou);
 *   • realtime: o canal observa `task_executions` da organização, só abre quando
 *     o recorte inclui HOJE, tem debounce e um canal de escopo abandonado não
 *     recarrega o escopo novo.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";

type Res = { data: unknown; error: { message: string } | null };
type ChangeHandler = { table: string; event: string; filter?: string; cb: () => void };
type ChannelRecord = {
  name: string;
  handlers: ChangeHandler[];
  subscribed: boolean;
  removed: boolean;
  api: unknown;
};

const mock = vi.hoisted(() => {
  const queries: Array<{ table: string; columns: string; calls: Array<[string, string]> }> = [];
  const queue: Array<Res | Promise<Res>> = [];
  const channels: ChannelRecord[] = [];

  function from(table: string) {
    const record = { table, columns: "", calls: [] as Array<[string, string]> };
    const builder = {
      select: (columns: string) => {
        record.columns = columns;
        return builder;
      },
      eq: (column: string, value: string) => {
        record.calls.push([column, value]);
        return builder;
      },
      gte: (column: string, value: string) => {
        record.calls.push([column, value]);
        return builder;
      },
      lte: (column: string, value: string) => {
        record.calls.push([column, value]);
        return builder;
      },
      then: (onFulfilled: (value: Res) => unknown, onRejected?: (reason: unknown) => unknown) =>
        Promise.resolve(queue.shift() ?? { data: [], error: null }).then(onFulfilled, onRejected),
    };
    queries.push(record);
    return builder;
  }

  function channel(name: string) {
    const record: ChannelRecord = { name, handlers: [], subscribed: false, removed: false, api: null };
    const api = {
      on: (_event: string, opts: ChangeHandler, cb: () => void) => {
        record.handlers.push({ table: opts.table, event: _event, filter: opts.filter, cb });
        return api;
      },
      subscribe: () => {
        record.subscribed = true;
        return api;
      },
    };
    record.api = api;
    channels.push(record);
    return api;
  }

  return {
    queries,
    channels,
    from,
    channel,
    removeChannel(api: unknown) {
      const record = channels.find((c) => c.api === api);
      if (record) record.removed = true;
    },
    respond(...responses: Array<Res | Promise<Res>>) {
      queue.push(...responses);
    },
    reset() {
      queries.length = 0;
      queue.length = 0;
      channels.length = 0;
    },
  };
});

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (table: string) => mock.from(table),
    channel: (name: string) => mock.channel(name),
    removeChannel: (api: unknown) => mock.removeChannel(api),
  },
}));

import { useChecklistActivity } from "../useChecklistActivity";
import { todayISO } from "@/lib/dashboard-filters";

const ORG_A = "aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa";
const ORG_B = "bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb";

/** Payload no shape da view (só as três colunas selecionadas contam). */
function row(date: string, scheduled: number, completed: number) {
  return { reference_date: date, total_scheduled_tasks: scheduled, completed_tasks: completed };
}

function deferred() {
  let resolve!: (value: Res) => void;
  const promise = new Promise<Res>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

const drain = async () => {
  for (let i = 0; i < 10; i++) await Promise.resolve();
};

function callsOf(index: number): Record<string, string> {
  return Object.fromEntries(mock.queries[index].calls);
}

/** Recorte de um dia qualquer NO PASSADO: nenhum canal de realtime abre. */
const PAST = { startDate: "2026-09-01", endDate: "2026-09-03" };

function renderActivity(props: Record<string, unknown>) {
  return renderHook(
    (p: Parameters<typeof useChecklistActivity>[0]) => useChecklistActivity(p),
    {
      initialProps: {
        organizationId: ORG_A,
        ...PAST,
        ...props,
      } as Parameters<typeof useChecklistActivity>[0],
    },
  );
}

beforeEach(() => {
  mock.reset();
  console.error = vi.fn();
});

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
  mock.reset();
});

describe("escopo e consulta", () => {
  it("K) sem workspace não consulta nada e devolve estado neutro", () => {
    const { result } = renderActivity({ organizationId: null });

    expect(mock.queries).toHaveLength(0);
    expect(result.current.data).toEqual([]);
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it("enabled=false também não consulta (gate de RBAC/contexto)", () => {
    const { result } = renderActivity({ enabled: false });

    expect(mock.queries).toHaveLength(0);
    expect(result.current.data).toEqual([]);
  });

  it("consulta a view no escopo da organização, pelo período pedido e só as colunas usadas", async () => {
    mock.respond({
      data: [row("2026-09-02", 4, 3)],
      error: null,
    });

    const { result } = renderActivity({});

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(mock.queries).toHaveLength(1);
    expect(mock.queries[0].table).toBe("analytics_unit_daily_compliance");
    expect(mock.queries[0].columns).toBe("reference_date,total_scheduled_tasks,completed_tasks");
    expect(callsOf(0).organization_id).toBe(ORG_A);
    // Período é aplicado nas duas pontas, na data CIVIL da view.
    expect(mock.queries[0].calls).toContainEqual(["reference_date", PAST.startDate]);
    expect(mock.queries[0].calls).toContainEqual(["reference_date", PAST.endDate]);
    // Sem unidade/turno selecionados, nenhum filtro extra (o turno NULL entra).
    expect(mock.queries[0].calls.some(([column]) => column === "unit_id")).toBe(false);
    expect(mock.queries[0].calls.some(([column]) => column === "shift_id")).toBe(false);
  });

  it("unidade e turno selecionados recortam a consulta (as outras partições saem)", async () => {
    mock.respond({ data: [], error: null });

    renderActivity({ unitId: "u-1", shiftId: "sh-1" });

    await waitFor(() => expect(mock.queries).toHaveLength(1));
    expect(callsOf(0).unit_id).toBe("u-1");
    expect(callsOf(0).shift_id).toBe("sh-1");
  });

  it("a série é a soma por dia civil, com dias sem linha em zero", async () => {
    mock.respond({
      data: [
        row("2026-09-01", 4, 3), // Unidade A / Manhã
        row("2026-09-01", 2, 2), // Unidade A / Noite
        row("2026-09-01", 6, 4), // Unidade B / Manhã (sem turno na view)
        row("2026-09-03", 5, 5),
      ],
      error: null,
    });

    const { result } = renderActivity({});

    await waitFor(() => expect(result.current.data).toHaveLength(3));

    expect(result.current.data).toEqual([
      { date: "2026-09-01", scheduled: 12, completed: 9 },
      { date: "2026-09-02", scheduled: 0, completed: 0 },
      { date: "2026-09-03", scheduled: 5, completed: 5 },
    ]);
  });
});

describe("trocas de escopo (nenhuma série antiga pode vazar)", () => {
  it("L) workspace A → B: resposta atrasada de A nunca aparece sob B", async () => {
    const slowA = deferred();
    const slowB = deferred();
    mock.respond(slowA.promise, slowB.promise);

    const { result, rerender } = renderActivity({ organizationId: ORG_A });

    expect(result.current.data).toEqual([]);

    await act(async () => {
      rerender({ organizationId: ORG_B, ...PAST });
      await drain();
    });

    // Troca de escopo: neutro sincronamente — nem a série de A, nem meia série de B.
    expect(result.current.data).toEqual([]);

    await act(async () => {
      slowB.resolve({ data: [row("2026-09-01", 1, 1)], error: null });
      await drain();
    });

    await waitFor(() => expect(result.current.data[0]?.scheduled).toBe(1));

    await act(async () => {
      slowA.resolve({ data: [row("2026-09-01", 99, 99)], error: null });
      await drain();
    });

    expect(result.current.data.map((d) => d.scheduled)).toEqual([1, 0, 0]);
    expect(JSON.stringify(result.current.data)).not.toContain("99");
    expect(mock.queries.map((_, i) => callsOf(i).organization_id)).toEqual([ORG_A, ORG_B]);
  });

  it("M) troca de período descarta a série anterior", async () => {
    const slow = deferred();
    mock.respond(slow.promise, { data: [row("2026-08-01", 7, 7)], error: null });

    const { result, rerender } = renderActivity({});

    await act(async () => {
      rerender({ organizationId: ORG_A, startDate: "2026-08-01", endDate: "2026-08-01" });
      await drain();
    });

    await waitFor(() => expect(result.current.data.length).toBe(1));

    await act(async () => {
      slow.resolve({ data: [row("2026-09-01", 42, 42)], error: null });
      await drain();
    });

    expect(result.current.data).toEqual([{ date: "2026-08-01", scheduled: 7, completed: 7 }]);
    expect(JSON.stringify(result.current.data)).not.toContain("42");
  });

  it("N) troca de unidade descarta a série anterior (e a consulta leva a nova unidade)", async () => {
    const slowU1 = deferred();
    const slowU2 = deferred();
    mock.respond(slowU1.promise, slowU2.promise);

    const { result, rerender } = renderActivity({ unitId: "u-1" });

    await act(async () => {
      rerender({ organizationId: ORG_A, ...PAST, unitId: "u-2" });
      await drain();
    });

    // Nenhuma das duas respondeu ainda: a série publicada é NEUTRA, nunca a de u-1.
    expect(result.current.data).toEqual([]);

    await act(async () => {
      slowU2.resolve({ data: [row("2026-09-01", 3, 3)], error: null });
      await drain();
    });
    expect(result.current.data[0].scheduled).toBe(3);

    await act(async () => {
      slowU1.resolve({ data: [row("2026-09-01", 11, 11)], error: null });
      await drain();
    });

    expect(result.current.data[0].scheduled).toBe(3);
    expect(callsOf(1).unit_id).toBe("u-2");
  });

  it("O) troca de turno descarta a série anterior", async () => {
    const slow = deferred();
    mock.respond(slow.promise, { data: [row("2026-09-01", 8, 6)], error: null });

    const { result, rerender } = renderActivity({ shiftId: "sh-manha" });

    await act(async () => {
      rerender({ organizationId: ORG_A, ...PAST, shiftId: "sh-noite" });
      await drain();
    });

    await waitFor(() => expect(result.current.data[0]?.completed).toBe(6));

    await act(async () => {
      slow.resolve({ data: [row("2026-09-01", 50, 50)], error: null });
      await drain();
    });

    expect(result.current.data[0].completed).toBe(6);
    expect(callsOf(1).shift_id).toBe("sh-noite");
  });
});

describe("erro, vazio e refresh", () => {
  it("P) erro é estado separado do vazio (mensagem genérica, sem detalhe de schema)", async () => {
    mock.respond({ data: null, error: { message: 'relation "analytics_unit_daily_compliance" does not exist' } });

    const { result } = renderActivity({});

    await waitFor(() => expect(result.current.error).not.toBeNull());

    expect(result.current.error).toBe("Não foi possível carregar a atividade.");
    expect(result.current.error).not.toContain("analytics_unit_daily_compliance");
    expect(result.current.data).toEqual([]);
    expect(result.current.loading).toBe(false);
  });

  it("sucesso sem linhas é sucesso: recorte integral preenchido com zero", async () => {
    mock.respond({ data: [], error: null });

    const { result } = renderActivity({});

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.error).toBeNull();
    expect(result.current.data).toEqual([
      { date: "2026-09-01", scheduled: 0, completed: 0 },
      { date: "2026-09-02", scheduled: 0, completed: 0 },
      { date: "2026-09-03", scheduled: 0, completed: 0 },
    ]);
  });

  it("Q) refresh relê o mesmo escopo e publica o resultado novo", async () => {
    mock.respond({ data: [row("2026-09-01", 1, 0)], error: null });
    mock.respond({ data: [row("2026-09-01", 1, 1)], error: null });

    const { result } = renderActivity({});

    await waitFor(() => expect(result.current.data[0]?.completed).toBe(0));

    await act(async () => {
      await result.current.refresh();
      await drain();
    });

    expect(result.current.data[0].completed).toBe(1);
    expect(mock.queries).toHaveLength(2);
  });
});

describe("realtime", () => {
  it("não abre canal quando o recorte inteiro é passado (nada muda hoje)", () => {
    renderActivity({});

    expect(mock.channels).toHaveLength(0);
  });

  it("abre canal observando task_executions da organização quando o recorte inclui hoje", () => {
    const today = todayISO();
    renderActivity({ startDate: today, endDate: today });

    expect(mock.channels).toHaveLength(1);
    expect(mock.channels[0].name).toBe(
      `checklist-activity-${ORG_A}-${today}-${today}-all-all`,
    );
    expect(mock.channels[0].subscribed).toBe(true);
    // SÓ task_executions: `tasks`/`evidences` não mudam estes dois contadores.
    expect(mock.channels[0].handlers.map((h) => h.table)).toEqual(["task_executions"]);
    expect(mock.channels[0].handlers[0].filter).toBe(`organization_id=eq.${ORG_A}`);
  });

  it("R) uma tarefa concluída recarrega a série (com debounce)", async () => {
    vi.useFakeTimers();
    const today = todayISO();
    mock.respond({ data: [row(today, 3, 1)], error: null });
    mock.respond({ data: [row(today, 3, 2)], error: null });

    const { result } = renderActivity({ startDate: today, endDate: today });

    await act(async () => {
      await drain();
    });
    expect(result.current.data[0].completed).toBe(1);

    const handler = mock.channels[0].handlers[0];
    await act(async () => {
      handler.cb(); // primeiro evento
      handler.cb(); // segundo evento 100ms depois: o debounce agrupa
      vi.advanceTimersByTime(100);
      handler.cb();
      vi.advanceTimersByTime(900);
      await drain();
    });

    expect(result.current.data[0].completed).toBe(2);
    // Um único reload para os três eventos.
    expect(mock.queries).toHaveLength(2);
  });

  it("S) canal de um escopo abandonado não recarrega o escopo novo", async () => {
    vi.useFakeTimers();
    const today = todayISO();
    mock.respond({ data: [row(today, 5, 5)], error: null });
    mock.respond({ data: [row(today, 4, 4)], error: null });

    const { result, rerender } = renderActivity({ startDate: today, endDate: today });

    await act(async () => {
      rerender({ organizationId: ORG_A, startDate: today, endDate: today, unitId: "u-1" });
      await drain();
    });

    expect(mock.channels).toHaveLength(2);
    expect(mock.channels[0].removed).toBe(true);
    const staleHandler = mock.channels[0].handlers[0];
    const queriesAfterSwitch = mock.queries.length;

    await act(async () => {
      staleHandler.cb();
      vi.advanceTimersByTime(900);
      await drain();
    });

    expect(mock.queries).toHaveLength(queriesAfterSwitch);
    // A série publicada continua sendo a do escopo NOVO (u-1), não a do antigo.
    expect(result.current.data[0].scheduled).toBe(4);
    expect(callsOf(queriesAfterSwitch - 1).unit_id).toBe("u-1");
  });
});
