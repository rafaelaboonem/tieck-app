/**
 * Execution 6B.2C — useMyExecutionOccurrences.
 *
 * Prova comportamento real (RPC observada, valores capturados DURANTE o render):
 *   - o gate: pessoal / sem workspace / não autenticado nunca consulta;
 *   - a RPC recebe exatamente o workspace do escopo;
 *   - falha é fail-closed com error=true (nunca um zero silencioso);
 *   - A→B: no PRIMEIRO render de B nada de A é devolvido, e a resposta tardia de
 *     A é descartada;
 *   - A→B→A: a resposta do primeiro ciclo A não é revalidada ao voltar para A;
 *   - unmount impede qualquer publicação posterior;
 *   - refresh refaz a leitura do mesmo workspace.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";

const mocks = vi.hoisted(() => ({ rpc: vi.fn() }));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { rpc: mocks.rpc },
}));

import { useMyExecutionOccurrences } from "@/hooks/useMyExecutionOccurrences";
import type { HomeExecutionOccurrence } from "@/lib/home-execution-occurrences";

const WS_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const WS_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const CHK = "55555555-5555-4555-8555-555555555555";
const SCHED = "44444444-4444-4444-8444-444444444444";
const WM = "77777777-7777-4777-8777-777777777777";
const OCC_A1 = "11111111-1111-4111-8111-111111111111";
const OCC_A2 = "22222222-2222-4222-8222-222222222222";
const OCC_B1 = "33333333-3333-4333-8333-333333333333";

const row = (occurrenceId: string, over: Record<string, unknown> = {}) => ({
  occurrence_id: occurrenceId,
  schedule_id: SCHED,
  checklist_id: CHK,
  checklist_title: "Rotina",
  workspace_member_id: WM,
  occurrence_date: "2026-09-13",
  due_at: "2026-09-13T09:00:00Z",
  started_at: null,
  completed_at: null,
  response_id: null,
  unit_id: null,
  shift_id: null,
  ...over,
});

type Deferred = { resolve: (v: { data: unknown; error: unknown }) => void; args: unknown };

let pending: Deferred[] = [];

const deferredRpc = () => {
  mocks.rpc.mockImplementation(
    (_name: string, args: unknown) =>
      new Promise<{ data: unknown; error: unknown }>((resolve) => {
        pending.push({ resolve, args });
      }),
  );
};

const immediate = (data: unknown, error: unknown = null) => {
  mocks.rpc.mockResolvedValue({ data, error });
};

const ids = (occurrences: HomeExecutionOccurrence[]) => occurrences.map((o) => o.occurrenceId);

beforeEach(() => {
  pending = [];
  mocks.rpc.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("6B.2C — gate de consulta", () => {
  it("consulta exatamente uma vez com o workspace do escopo", async () => {
    immediate([row(OCC_A1)]);
    const { result } = renderHook(() =>
      useMyExecutionOccurrences({ workspaceId: WS_A, enabled: true }),
    );

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
    expect(mocks.rpc).toHaveBeenCalledWith("list_my_checklist_execution_occurrences", {
      p_workspace_id: WS_A,
    });
    expect(ids(result.current.occurrences)).toEqual([OCC_A1]);
    expect(result.current.error).toBe(false);
  });

  it("contexto pessoal (enabled=false) nunca consulta e não reporta vazio como sucesso", async () => {
    const { result } = renderHook(() =>
      useMyExecutionOccurrences({ workspaceId: null, enabled: false }),
    );

    await act(async () => {});
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(result.current.occurrences).toEqual([]);
    expect(result.current.error).toBe(false);
    expect(result.current.loading).toBe(false);
  });

  it("enabled=true sem workspace resolvido continua sem consultar", async () => {
    const { result } = renderHook(() =>
      useMyExecutionOccurrences({ workspaceId: null, enabled: true }),
    );

    await act(async () => {});
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(result.current.loading).toBe(false);
  });

  it("falha da RPC é fail-closed com error=true", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    immediate(null, { message: "permission denied for function" });

    const { result } = renderHook(() =>
      useMyExecutionOccurrences({ workspaceId: WS_A, enabled: true }),
    );

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.occurrences).toEqual([]);
    expect(result.current.error).toBe(true);
    errorSpy.mockRestore();
  });
});

describe("6B.2C — troca de escopo A → B", () => {
  it("no primeiro render de B nada de A é devolvido, e a resposta tardia de A é descartada", async () => {
    deferredRpc();

    const renders: { occurrences: HomeExecutionOccurrence[]; loading: boolean }[] = [];
    const { rerender } = renderHook(
      (props: { workspaceId: string; enabled: boolean }) => {
        const value = useMyExecutionOccurrences(props);
        renders.push({ occurrences: value.occurrences, loading: value.loading });
        return value;
      },
      { initialProps: { workspaceId: WS_A, enabled: true } },
    );

    await waitFor(() => expect(pending).toHaveLength(1));
    expect(ids(renders[renders.length - 1].occurrences)).toEqual([]);

    // B começa: captura o valor do PRIMEIRO render de B (antes do efeito).
    const before = renders.length;
    rerender({ workspaceId: WS_B, enabled: true });
    const firstRenderOfB = renders[before];
    expect(firstRenderOfB.occurrences).toEqual([]);
    expect(firstRenderOfB.loading).toBe(true);

    await waitFor(() => expect(pending).toHaveLength(2));

    // B resolve primeiro com os dados de B.
    await act(async () => {
      pending[1].resolve({ data: [row(OCC_B1)], error: null });
    });

    // A resolve DEPOIS, com os dados de A: deve ser ignorado.
    await act(async () => {
      pending[0].resolve({ data: [row(OCC_A1)], error: null });
    });

    const last = renders[renders.length - 1];
    expect(ids(last.occurrences)).toEqual([OCC_B1]);
    expect(renders.every((r) => !ids(r.occurrences).includes(OCC_A1))).toBe(true);
    expect(pending[0].args).toEqual({ p_workspace_id: WS_A });
    expect(pending[1].args).toEqual({ p_workspace_id: WS_B });
  });
});

describe("6B.2C — A → B → A", () => {
  it("a resposta do primeiro ciclo A não é revalidada ao voltar para A", async () => {
    deferredRpc();

    const renders: HomeExecutionOccurrence[][] = [];
    const { rerender } = renderHook(
      (props: { workspaceId: string; enabled: boolean }) => {
        const value = useMyExecutionOccurrences(props);
        renders.push(value.occurrences);
        return value;
      },
      { initialProps: { workspaceId: WS_A, enabled: true } },
    );

    await waitFor(() => expect(pending).toHaveLength(1)); // A1 em voo

    rerender({ workspaceId: WS_B, enabled: true });
    await waitFor(() => expect(pending).toHaveLength(2)); // B em voo

    rerender({ workspaceId: WS_A, enabled: true });
    await waitFor(() => expect(pending).toHaveLength(3)); // A2 em voo

    // B e o A antigo resolvem: nenhum pode publicar no ciclo A2.
    await act(async () => {
      pending[1].resolve({ data: [row(OCC_B1)], error: null });
    });
    await act(async () => {
      pending[0].resolve({ data: [row(OCC_A1)], error: null });
    });

    expect(renders.every((r) => !ids(r).includes(OCC_B1))).toBe(true);
    expect(renders.every((r) => !ids(r).includes(OCC_A1))).toBe(true);

    // Só a requisição do ciclo atual (A2) publica.
    await act(async () => {
      pending[2].resolve({ data: [row(OCC_A2)], error: null });
    });
    expect(ids(renders[renders.length - 1])).toEqual([OCC_A2]);
  });

  it("voltar para A não reapresenta os dados do ciclo anterior como escopo atual", async () => {
    deferredRpc();

    const renders: { occurrences: HomeExecutionOccurrence[]; loading: boolean }[] = [];
    const { rerender } = renderHook(
      (props: { workspaceId: string; enabled: boolean }) => {
        const value = useMyExecutionOccurrences(props);
        renders.push({ occurrences: value.occurrences, loading: value.loading });
        return value;
      },
      { initialProps: { workspaceId: WS_A, enabled: true } },
    );

    // Ciclo A1 publica dados reais.
    await waitFor(() => expect(pending).toHaveLength(1));
    await act(async () => {
      pending[0].resolve({ data: [row(OCC_A1)], error: null });
    });
    await waitFor(() => expect(ids(renders[renders.length - 1].occurrences)).toEqual([OCC_A1]));

    rerender({ workspaceId: WS_B, enabled: true });
    await waitFor(() => expect(pending).toHaveLength(2));

    // Volta para A: a MESMA string de escopo de dados, mas outro ciclo.
    const before = renders.length;
    rerender({ workspaceId: WS_A, enabled: true });

    // O primeiro render de A2 não pode re-servir os dados do ciclo A1.
    expect(renders[before].occurrences).toEqual([]);
    expect(renders[before].loading).toBe(true);

    await waitFor(() => expect(pending).toHaveLength(3));
    expect(mocks.rpc).toHaveBeenCalledTimes(3);
    expect(pending[2].args).toEqual({ p_workspace_id: WS_A });

    // E o resultado do ciclo atual substitui o anterior.
    await act(async () => {
      pending[2].resolve({ data: [row(OCC_A2)], error: null });
    });
    await waitFor(() => expect(ids(renders[renders.length - 1].occurrences)).toEqual([OCC_A2]));
  });
});

describe("6B.2C — desabilitar durante a leitura", () => {
  it("ao desabilitar, o resultado em voo não é publicado", async () => {
    deferredRpc();

    const renders: HomeExecutionOccurrence[][] = [];
    const { rerender } = renderHook(
      (props: { workspaceId: string | null; enabled: boolean }) => {
        const value = useMyExecutionOccurrences(props);
        renders.push(value.occurrences);
        return value;
      },
      { initialProps: { workspaceId: WS_A as string | null, enabled: true } },
    );

    await waitFor(() => expect(pending).toHaveLength(1));

    rerender({ workspaceId: null, enabled: false });

    await act(async () => {
      pending[0].resolve({ data: [row(OCC_A1)], error: null });
    });

    expect(renders.every((r) => !ids(r).includes(OCC_A1))).toBe(true);
    expect(renders[renders.length - 1]).toEqual([]);
  });
});

describe("6B.2C — unmount", () => {
  it("não publica nada depois do unmount", async () => {
    deferredRpc();

    const renders: HomeExecutionOccurrence[][] = [];
    const { unmount } = renderHook(
      (props: { workspaceId: string; enabled: boolean }) => {
        const value = useMyExecutionOccurrences(props);
        renders.push(value.occurrences);
        return value;
      },
      { initialProps: { workspaceId: WS_A, enabled: true } },
    );

    await waitFor(() => expect(pending).toHaveLength(1));

    unmount();
    const afterUnmount = renders.length;

    await act(async () => {
      pending[0].resolve({ data: [row(OCC_A1)], error: null });
    });

    expect(renders.length).toBe(afterUnmount);
    expect(renders.every((r) => !ids(r).includes(OCC_A1))).toBe(true);
  });
});

describe("6B.2C — refresh", () => {
  it("refaz a leitura do mesmo workspace e publica o novo resultado", async () => {
    deferredRpc();

    const { result } = renderHook(() =>
      useMyExecutionOccurrences({ workspaceId: WS_A, enabled: true }),
    );

    await waitFor(() => expect(pending).toHaveLength(1));
    await act(async () => {
      pending[0].resolve({ data: [row(OCC_A1)], error: null });
    });
    await waitFor(() => expect(ids(result.current.occurrences)).toEqual([OCC_A1]));

    await act(async () => {
      result.current.refresh();
    });

    await waitFor(() => expect(pending).toHaveLength(2));
    expect(pending[1].args).toEqual({ p_workspace_id: WS_A });

    await act(async () => {
      pending[1].resolve({ data: [row(OCC_A2)], error: null });
    });

    await waitFor(() => expect(ids(result.current.occurrences)).toEqual([OCC_A2]));
    expect(mocks.rpc).toHaveBeenCalledTimes(2);
  });
});
