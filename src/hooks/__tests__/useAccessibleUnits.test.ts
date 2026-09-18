/**
 * useAccessibleUnits — escopo EXPLÍCITO de workspace (6B.2F).
 *
 * O que esta suíte protege:
 *   • sem workspace válido NENHUMA consulta sai (nem promessa, nem estado sujo);
 *   • `enabled=false` (RBAC/contexto ainda resolvendo) também não consulta;
 *   • a consulta carrega `.eq("workspace_id", …)` além da RLS e, por padrão,
 *     apenas unidades ativas;
 *   • `includeInactive` é outro escopo (e não um detalhe silencioso);
 *   • trocar de workspace A → B nunca publica unidade de A — inclusive quando a
 *     resposta de A chega DEPOIS da de B;
 *   • resposta antiga não sobrescreve a nova (refresh no mesmo escopo);
 *   • nada publica depois do unmount;
 *   • falha é canal separado (mensagem genérica, sem detalhe de SQL/schema).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";

type Row = { id: string; name: string; is_active: boolean; workspace_id: string };
type Res = { data: unknown; error: { message: string } | null };

const mock = vi.hoisted(() => {
  const queries: Array<{ table: string; eqs: Array<[string, unknown]>; ordered: boolean }> = [];
  const queue: Array<Res | Promise<Res>> = [];

  function from(table: string) {
    const record = { table, eqs: [] as Array<[string, unknown]>, ordered: false };
    const builder = {
      select: () => builder,
      eq: (column: string, value: unknown) => {
        record.eqs.push([column, value]);
        return builder;
      },
      order: () => {
        record.ordered = true;
        return builder;
      },
      // Thenable: `await q` resolve com a PRÓXIMA resposta enfileirada pelo
      // teste (ou um vazio se o teste não enfileirou nada).
      then: (onFulfilled: (value: Res) => unknown, onRejected?: (reason: unknown) => unknown) =>
        Promise.resolve(queue.shift() ?? { data: [], error: null }).then(onFulfilled, onRejected),
    };
    queries.push(record);
    return builder;
  }

  return {
    queries,
    from,
    respond(...responses: Array<Res | Promise<Res>>) {
      queue.push(...responses);
    },
    reset() {
      queries.length = 0;
      queue.length = 0;
    },
  };
});

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: (table: string) => mock.from(table) },
}));

import { useAccessibleUnits } from "../useAccessibleUnits";

const WS_A = "aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa";
const WS_B = "bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb";

function row(id: string, name: string, workspaceId: string, isActive = true): Row {
  return { id, name, is_active: isActive, workspace_id: workspaceId };
}

function deferred() {
  let resolve!: (value: Res) => void;
  const promise = new Promise<Res>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

function eqsOf(index: number) {
  return Object.fromEntries(mock.queries[index].eqs);
}

beforeEach(() => {
  mock.reset();
  console.error = vi.fn();
});

afterEach(() => {
  vi.clearAllMocks();
  mock.reset();
});

describe("gate de escopo", () => {
  it("sem workspace não consulta nada e devolve estado neutro", () => {
    const { result } = renderHook(() => useAccessibleUnits({ workspaceId: null }));

    expect(mock.queries).toHaveLength(0);
    expect(result.current.units).toEqual([]);
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it("enabled=false não consulta nada, mesmo com workspace selecionado", () => {
    const { result } = renderHook(() =>
      useAccessibleUnits({ workspaceId: WS_A, enabled: false }),
    );

    expect(mock.queries).toHaveLength(0);
    expect(result.current.loading).toBe(false);
  });
});

describe("escopo explícito da consulta", () => {
  it("consulta as unidades ATIVAS do workspace pedido (workspace_id na query)", async () => {
    mock.respond({ data: [row("u1", "Unidade Norte", WS_A)], error: null });

    const { result } = renderHook(() => useAccessibleUnits({ workspaceId: WS_A }));

    await waitFor(() => expect(result.current.units).toHaveLength(1));

    expect(mock.queries).toHaveLength(1);
    expect(mock.queries[0].table).toBe("units");
    expect(mock.queries[0].ordered).toBe(true);
    expect(eqsOf(0).workspace_id).toBe(WS_A);
    expect(eqsOf(0).is_active).toBe(true);
    expect(result.current.units[0].name).toBe("Unidade Norte");
  });

  it("includeInactive lista também as inativas (sem filtro de is_active)", async () => {
    mock.respond({
      data: [row("u1", "Ativa", WS_A), row("u2", "Desativada", WS_A, false)],
      error: null,
    });

    const { result } = renderHook(() =>
      useAccessibleUnits({ workspaceId: WS_A, includeInactive: true }),
    );

    await waitFor(() => expect(result.current.units).toHaveLength(2));

    expect(eqsOf(0).workspace_id).toBe(WS_A);
    expect(eqsOf(0).is_active).toBeUndefined();
  });

  it("falha vira canal de erro com mensagem genérica — nunca lista vazia silenciosa", async () => {
    mock.respond({ data: null, error: { message: 'column "workspace_id" does not exist' } });

    const { result } = renderHook(() => useAccessibleUnits({ workspaceId: WS_A }));

    await waitFor(() => expect(result.current.error).not.toBeNull());

    expect(result.current.error).toBe("Falha ao carregar as unidades.");
    expect(result.current.error).not.toContain("workspace_id");
    expect(result.current.units).toEqual([]);
  });
});

describe("troca de workspace", () => {
  it("A → B: resposta atrasada de A nunca aparece sob B", async () => {
    const slowA = deferred();
    mock.respond(slowA.promise, { data: [row("ub", "Unidade B", WS_B)], error: null });

    const { result, rerender } = renderHook(
      ({ workspaceId }: { workspaceId: string }) => useAccessibleUnits({ workspaceId }),
      { initialProps: { workspaceId: WS_A } },
    );

    // Ainda no escopo A, sem resposta: nada publicado.
    expect(result.current.units).toEqual([]);

    rerender({ workspaceId: WS_B });

    // Troca de escopo: neutro sincronamente (nunca a lista do workspace anterior).
    expect(result.current.units).toEqual([]);

    await waitFor(() => expect(result.current.units.map((u) => u.name)).toEqual(["Unidade B"]));

    // A agora responde — tarde. Não pode sobrescrever B.
    await act(async () => {
      slowA.resolve({ data: [row("ua", "Unidade A", WS_A)], error: null });
      await Promise.resolve();
    });

    expect(result.current.units.map((u) => u.name)).toEqual(["Unidade B"]);
    expect(mock.queries.map((q) => eqsOf(mock.queries.indexOf(q)).workspace_id)).toEqual([
      WS_A,
      WS_B,
    ]);
  });

  it("refresh no mesmo escopo: resposta antiga não sobrescreve a mais nova", async () => {
    const slowFirst = deferred();
    mock.respond(slowFirst.promise, { data: [row("u2", "Nome Novo", WS_A)], error: null });

    const { result } = renderHook(() => useAccessibleUnits({ workspaceId: WS_A }));

    await act(async () => {
      void result.current.refresh();
      await Promise.resolve();
    });

    await waitFor(() => expect(result.current.units.map((u) => u.name)).toEqual(["Nome Novo"]));

    await act(async () => {
      slowFirst.resolve({ data: [row("u1", "Nome Velho", WS_A)], error: null });
      await Promise.resolve();
    });

    expect(result.current.units.map((u) => u.name)).toEqual(["Nome Novo"]);
  });

  it("nada é publicado depois do unmount", async () => {
    const slow = deferred();
    mock.respond(slow.promise);

    const { unmount } = renderHook(() => useAccessibleUnits({ workspaceId: WS_A }));

    unmount();

    await act(async () => {
      slow.resolve({ data: [row("u1", "Unidade Norte", WS_A)], error: null });
      await Promise.resolve();
    });

    expect(console.error).not.toHaveBeenCalled();
  });
});
