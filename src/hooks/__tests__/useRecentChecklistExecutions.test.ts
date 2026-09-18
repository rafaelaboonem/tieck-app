/**
 * useRecentChecklistExecutions — "Últimas execuções" REAL do /painel (6B.2E).
 *
 * O que esta suíte protege:
 *   • sem workspace válido NENHUMA consulta sai (nem promessa, nem estado sujo);
 *   • a RPC é chamada com o recorte exato do painel e SEM filtros quando o
 *     usuário escolhe "todas as unidades"/"todos os turnos";
 *   • resposta de um escopo antigo (unidade/turno/período anterior) NÃO
 *     sobrescreve o escopo atual — nem vaza linha da unidade anterior;
 *   • trocar de escopo devolve estado neutro (não publica o resultado antigo);
 *   • falha é canal separado e nunca aparece como "sem execuções";
 *   • depois do unmount nada é publicado;
 *   • o limite é saneado (default 6, teto 20).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";

const rpc = vi.fn();

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { rpc: (...args: unknown[]) => rpc(...args) },
}));

import {
  normalizeRecentExecutionsLimit,
  useRecentChecklistExecutions,
} from "../useRecentChecklistExecutions";

const OCCURRENCE_A = "11111111-1111-4111-8111-111111111111";
const OCCURRENCE_B = "22222222-2222-4222-8222-222222222222";
const CHECKLIST_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const RESPONSE_A = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

function payload(occurrenceId: string, unitName: string) {
  return [
    {
      occurrence_id: occurrenceId,
      checklist_id: CHECKLIST_A,
      checklist_title: "Checklist de abertura",
      response_id: RESPONSE_A,
      occurrence_date: "2026-09-17",
      due_at: "2026-09-17T08:00:00.000Z",
      completed_at: "2026-09-17T08:12:00.000Z",
      unit_id: null,
      unit_name: unitName,
      shift_id: null,
      shift_name: null,
      workspace_member_id: null,
      user_id: null,
      responsible_name: "Juliana Prado",
      role: "editor",
      avatar_url: null,
      avatar_display_mode: null,
      illustrated_avatar_id: null,
    },
  ];
}

const BASE = {
  organizationId: "org-1",
  startDate: "2026-09-01",
  endDate: "2026-09-30",
};

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
  vi.clearAllMocks();
});

describe("gate de escopo", () => {
  it("sem workspace não consulta nada e devolve estado neutro", async () => {
    const { result } = renderHook(() =>
      useRecentChecklistExecutions({ ...BASE, organizationId: null }),
    );

    expect(rpc).not.toHaveBeenCalled();
    expect(result.current.data).toEqual([]);
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it("desabilitado (RBAC/workspace ainda resolvendo) também não consulta", async () => {
    renderHook(() => useRecentChecklistExecutions({ ...BASE, enabled: false }));
    await waitFor(() => expect(rpc).not.toHaveBeenCalled());
  });
});

describe("chamada da RPC", () => {
  it("envia o recorte completo e mapeia a resposta para a linha do card", async () => {
    rpc.mockResolvedValue({ data: payload(OCCURRENCE_A, "Unidade Norte"), error: null });

    const { result } = renderHook(() =>
      useRecentChecklistExecutions({
        ...BASE,
        unitId: "unit-1",
        shiftId: "shift-1",
        limit: 6,
      }),
    );

    await waitFor(() => expect(result.current.data).toHaveLength(1));
    expect(rpc).toHaveBeenCalledWith("list_workspace_recent_checklist_executions", {
      p_workspace_id: "org-1",
      p_start_date: "2026-09-01",
      p_end_date: "2026-09-30",
      p_unit_id: "unit-1",
      p_shift_id: "shift-1",
      p_limit: 6,
    });

    const item = result.current.data[0];
    expect(item.id).toBe(OCCURRENCE_A);
    expect(item.checklistId).toBe(CHECKLIST_A);
    expect(item.executorName).toBe("Juliana Prado");
    expect(item.context).toBe("Unidade Norte");
    expect(result.current.error).toBeNull();
    expect(result.current.loading).toBe(false);
  });

  it("sem unidade e sem turno NÃO envia filtro (todas as unidades/turnos)", async () => {
    rpc.mockResolvedValue({ data: [], error: null });

    renderHook(() => useRecentChecklistExecutions({ ...BASE, unitId: null, shiftId: null }));

    await waitFor(() => expect(rpc).toHaveBeenCalledTimes(1));
    const args = rpc.mock.calls[0][1] as Record<string, unknown>;
    expect(args).not.toHaveProperty("p_unit_id");
    expect(args).not.toHaveProperty("p_shift_id");
    expect(args.p_limit).toBe(6);
  });

  it("schema/política indisponível vira ERRO genérico, nunca lista vazia silenciosa", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "PGRST202 function not found" } });

    const { result } = renderHook(() => useRecentChecklistExecutions(BASE));

    await waitFor(() => expect(result.current.error).toBe("Falha ao carregar as últimas execuções."));
    expect(result.current.data).toEqual([]);
    expect(result.current.loading).toBe(false);
    // O detalhe técnico não vaza para a UI.
    expect(result.current.error).not.toContain("PGRST");
  });

  it("promessa rejeitada (rede) também fecha em erro, sem dado antigo", async () => {
    rpc.mockRejectedValue(new Error("offline"));

    const { result } = renderHook(() => useRecentChecklistExecutions(BASE));

    await waitFor(() => expect(result.current.error).toBe("Falha ao carregar as últimas execuções."));
    expect(result.current.data).toEqual([]);
  });

  it("refresh republica com o mesmo recorte", async () => {
    rpc.mockResolvedValue({ data: payload(OCCURRENCE_A, "Unidade Norte"), error: null });

    const { result } = renderHook(() => useRecentChecklistExecutions(BASE));
    await waitFor(() => expect(result.current.data).toHaveLength(1));

    await act(async () => {
      await result.current.refresh();
    });

    expect(rpc).toHaveBeenCalledTimes(2);
    const [first, second] = rpc.mock.calls.map((c) => JSON.stringify(c[1]));
    expect(second).toBe(first);
  });
});

describe("troca de escopo (não vaza dado do recorte anterior)", () => {
  it("trocar de UNIDADE descarta a resposta antiga e não deixa linha da unidade anterior", async () => {
    const first = deferred<{ data: unknown; error: unknown }>();
    const second = deferred<{ data: unknown; error: unknown }>();
    rpc.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);

    const { result, rerender } = renderHook(
      (props: { unitId: string }) =>
        useRecentChecklistExecutions({ ...BASE, unitId: props.unitId }),
      { initialProps: { unitId: "unit-1" } },
    );

    await waitFor(() => expect(rpc).toHaveBeenCalledTimes(1));

    // Troca de unidade: o escopo antigo é abandonado e o estado fica neutro.
    rerender({ unitId: "unit-2" });
    expect(result.current.data).toEqual([]);
    expect(result.current.loading).toBe(true);

    await waitFor(() => expect(rpc).toHaveBeenCalledTimes(2));

    // A resposta da unidade 1 (antiga) chega DEPOIS: precisa ser ignorada.
    await act(async () => {
      first.resolve({ data: payload(OCCURRENCE_A, "Unidade 1"), error: null });
      await first.promise;
    });
    expect(result.current.data).toEqual([]);

    await act(async () => {
      second.resolve({ data: payload(OCCURRENCE_B, "Unidade 2"), error: null });
      await second.promise;
    });

    await waitFor(() => expect(result.current.data).toHaveLength(1));
    expect(result.current.data[0].id).toBe(OCCURRENCE_B);
    expect(result.current.data[0].context).toBe("Unidade 2");
    expect(result.current.data.some((i) => i.context === "Unidade 1")).toBe(false);
  });

  it("trocar de TURNO e de PERÍODO reconsulta com o novo recorte", async () => {
    rpc.mockResolvedValue({ data: [], error: null });

    const { rerender } = renderHook(
      (props: { shiftId: string | null; endDate: string }) =>
        useRecentChecklistExecutions({ ...BASE, shiftId: props.shiftId, endDate: props.endDate }),
      { initialProps: { shiftId: null as string | null, endDate: BASE.endDate } },
    );
    await waitFor(() => expect(rpc).toHaveBeenCalledTimes(1));

    rerender({ shiftId: "shift-9", endDate: BASE.endDate });
    await waitFor(() => expect(rpc).toHaveBeenCalledTimes(2));
    expect(rpc.mock.calls[1][1]).toMatchObject({ p_shift_id: "shift-9" });

    rerender({ shiftId: "shift-9", endDate: "2026-09-15" });
    await waitFor(() => expect(rpc).toHaveBeenCalledTimes(3));
    expect(rpc.mock.calls[2][1]).toMatchObject({ p_end_date: "2026-09-15" });
  });

  it("erro de um escopo anterior não contamina o escopo novo", async () => {
    rpc
      .mockRejectedValueOnce(new Error("boom"))
      .mockResolvedValueOnce({ data: payload(OCCURRENCE_A, "Unidade Norte"), error: null });

    const { result, rerender } = renderHook(
      (props: { unitId: string }) =>
        useRecentChecklistExecutions({ ...BASE, unitId: props.unitId }),
      { initialProps: { unitId: "unit-1" } },
    );

    await waitFor(() => expect(result.current.error).not.toBeNull());

    rerender({ unitId: "unit-2" });
    expect(result.current.error).toBeNull();

    await waitFor(() => expect(result.current.data).toHaveLength(1));
    expect(result.current.error).toBeNull();
  });

  it("depois do unmount nenhuma resposta publica estado", async () => {
    const pending = deferred<{ data: unknown; error: unknown }>();
    rpc.mockReturnValueOnce(pending.promise);

    const { unmount } = renderHook(() => useRecentChecklistExecutions(BASE));
    await waitFor(() => expect(rpc).toHaveBeenCalledTimes(1));

    unmount();
    await act(async () => {
      pending.resolve({ data: payload(OCCURRENCE_A, "Unidade Norte"), error: null });
      await pending.promise;
    });

    // Nenhum aviso de setState após unmount (o console.error está espionado).
    expect(console.error).not.toHaveBeenCalled();
  });
});

describe("limite saneado", () => {
  it("default 6 quando ausente, inválido ou não finito", () => {
    expect(normalizeRecentExecutionsLimit(undefined)).toBe(6);
    expect(normalizeRecentExecutionsLimit(null)).toBe(6);
    expect(normalizeRecentExecutionsLimit(Number.NaN)).toBe(6);
    expect(normalizeRecentExecutionsLimit(Number.POSITIVE_INFINITY)).toBe(6);
  });

  it("nunca zero/negativo e nunca acima do teto de 20", () => {
    expect(normalizeRecentExecutionsLimit(0)).toBe(1);
    expect(normalizeRecentExecutionsLimit(-5)).toBe(1);
    expect(normalizeRecentExecutionsLimit(8)).toBe(8);
    expect(normalizeRecentExecutionsLimit(20)).toBe(20);
    expect(normalizeRecentExecutionsLimit(500)).toBe(20);
  });

  it("o limite enviado à RPC respeita o teto", async () => {
    rpc.mockResolvedValue({ data: [], error: null });
    renderHook(() => useRecentChecklistExecutions({ ...BASE, limit: 999 }));
    await waitFor(() => expect(rpc).toHaveBeenCalledTimes(1));
    expect(rpc.mock.calls[0][1]).toMatchObject({ p_limit: 20 });
  });
});
