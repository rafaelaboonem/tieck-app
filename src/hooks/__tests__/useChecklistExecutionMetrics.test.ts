/**
 * useChecklistExecutionMetrics — "Execução por checklist" REAL do /painel
 * (6B.2J). O que esta suíte protege:
 *   • a RPC é chamada com workspace + período exatos do recorte;
 *   • unitId/shiftId só entram como filtro quando selecionados (nada inventado);
 *   • sem workspace / enabled=false, ZERO consulta;
 *   • resposta de escopo antigo não sobrescreve o atual; troca de escopo volta
 *     ao estado neutro (invariantes do useScopedQuery);
 *   • falha da RPC é canal de ERRO separado — nunca "sem execuções";
 *   • o parser fail-closed do contrato 6B.2J é aplicado à resposta.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";

const rpc = vi.fn();

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { rpc: (...args: unknown[]) => rpc(...args) },
}));

import { useChecklistExecutionMetrics } from "../useChecklistExecutionMetrics";

const CHECKLIST_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const UNIT_A = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const SHIFT_A = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";

const BASE = {
  organizationId: "org-1",
  startDate: "2026-09-01",
  endDate: "2026-09-30",
};

function payloadRow(overrides: Record<string, unknown> = {}) {
  return {
    checklist_id: CHECKLIST_A,
    checklist_title: "Abertura da loja",
    unit_id: UNIT_A,
    unit_name: "Unidade Norte",
    shift_id: SHIFT_A,
    shift_name: "Manhã",
    total_occurrences: "20",
    completed_occurrences: "18",
    completed_on_time: "16",
    completed_late: "2",
    overdue_open_occurrences: "1",
    pending_open_occurrences: "1",
    due_occurrences: "19",
    due_completed_occurrences: "18",
    ...overrides,
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

beforeEach(() => {
  vi.clearAllMocks();
  console.error = vi.fn();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("chamada da RPC", () => {
  it("A) chama a RPC com workspace + período e SEM filtros quando nada é selecionado", async () => {
    rpc.mockResolvedValue({ data: [payloadRow()], error: null });
    renderHook(() => useChecklistExecutionMetrics(BASE));

    await waitFor(() => expect(rpc).toHaveBeenCalledTimes(1));
    const [name, args] = rpc.mock.calls[0]!;
    expect(name).toBe("list_workspace_checklist_execution_metrics");
    expect(args).toEqual({
      p_workspace_id: "org-1",
      p_start_date: "2026-09-01",
      p_end_date: "2026-09-30",
    });
  });

  it("B) unitId é enviado quando selecionado", async () => {
    rpc.mockResolvedValue({ data: [], error: null });
    renderHook(() => useChecklistExecutionMetrics({ ...BASE, unitId: UNIT_A }));

    await waitFor(() => expect(rpc).toHaveBeenCalled());
    expect(rpc.mock.calls[0]![1]).toMatchObject({ p_unit_id: UNIT_A });
  });

  it("C) shiftId é enviado quando selecionado", async () => {
    rpc.mockResolvedValue({ data: [], error: null });
    renderHook(() => useChecklistExecutionMetrics({ ...BASE, shiftId: SHIFT_A }));

    await waitFor(() => expect(rpc).toHaveBeenCalled());
    expect(rpc.mock.calls[0]![1]).toMatchObject({ p_shift_id: SHIFT_A });
  });

  it("H) a resposta passa pelo parser fail-closed (linha sem checklist_id é descartada)", async () => {
    rpc.mockResolvedValue({
      data: [payloadRow(), { ...payloadRow(), checklist_id: null }],
      error: null,
    });
    const { result } = renderHook(() => useChecklistExecutionMetrics(BASE));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBeNull();
    expect(result.current.data).toHaveLength(1);
    expect(result.current.data[0]?.checklistId).toBe(CHECKLIST_A);
    // bigint serializado como string chega como número validado.
    expect(result.current.data[0]?.dueCompletedOccurrences).toBe(18);
  });
});

describe("elegibilidade (gate do painel)", () => {
  it("E) sem workspace NÃO consulta", async () => {
    renderHook(() => useChecklistExecutionMetrics({ ...BASE, organizationId: null }));
    await new Promise((r) => setTimeout(r, 10));
    expect(rpc).not.toHaveBeenCalled();
  });

  it("E) enabled=false NÃO consulta", async () => {
    renderHook(() => useChecklistExecutionMetrics({ ...BASE, enabled: false }));
    await new Promise((r) => setTimeout(r, 10));
    expect(rpc).not.toHaveBeenCalled();
  });
});

describe("escopo e ciclos", () => {
  it("F) trocar de UNIDADE descarta a resposta antiga e não vaza linha da unidade anterior", async () => {
    const first = deferred<{ data: unknown; error: unknown }>();
    const second = deferred<{ data: unknown; error: unknown }>();
    rpc.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);

    const { result, rerender } = renderHook(
      (props: { unitId: string | null }) =>
        useChecklistExecutionMetrics({ ...BASE, unitId: props.unitId }),
      { initialProps: { unitId: UNIT_A as string | null } },
    );

    await waitFor(() => expect(rpc).toHaveBeenCalledTimes(1));

    // Troca de unidade: o escopo antigo é abandonado e o estado fica neutro.
    rerender({ unitId: null });
    expect(result.current.data).toEqual([]);
    expect(result.current.loading).toBe(true);

    await waitFor(() => expect(rpc).toHaveBeenCalledTimes(2));

    // A resposta da unidade antiga chega DEPOIS: precisa ser ignorada.
    await act(async () => {
      first.resolve({ data: [payloadRow({ unit_name: "Unidade ANTIGA" })], error: null });
      await first.promise;
    });
    expect(result.current.data).toEqual([]);
    expect(JSON.stringify(result.current.data)).not.toContain("ANTIGA");

    await act(async () => {
      second.resolve({ data: [payloadRow({ unit_name: "Unidade NOVA" })], error: null });
      await second.promise;
    });

    await waitFor(() => expect(result.current.data).toHaveLength(1));
    expect(result.current.data[0]?.unitName).toBe("Unidade NOVA");
  });

  it("G) erro da RPC vira estado de ERRO com mensagem genérica (nunca vazio)", async () => {
    const err = new Error("Falha ao carregar execução por checklist.");
    rpc.mockRejectedValue(err);
    const { result } = renderHook(() => useChecklistExecutionMetrics(BASE));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe("Falha ao carregar execução por checklist.");
    expect(result.current.data).toEqual([]);
  });
});
