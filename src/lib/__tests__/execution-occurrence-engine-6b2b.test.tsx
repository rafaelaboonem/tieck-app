/**
 * Execution 6B.2B — comportamento real do submit no ExecutionEngine.
 *
 * Prova, por ORDEM DE CHAMADAS observada (não por leitura de fonte):
 *   1. finalize_public_response primeiro;
 *   2. somente depois a conclusão da occurrence (com o response_id finalizado);
 *   3. falha da conclusão NÃO finaliza a execução (sem redirect/onSubmitted) e
 *      NÃO cria segunda resposta — o retry repete apenas a conclusão;
 *   4. execução sem occurrenceId continua exatamente como antes.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, fireEvent, waitFor, screen, act } from "@testing-library/react";
import type { ResponseSession } from "@/lib/execution-response-session";

const CHK = "22222222-2222-4222-8222-222222222222";
const OCC = "11111111-1111-4111-8111-111111111111";
const FINALIZED_RESP = "77777777-7777-4777-8777-777777777777";
const SESSION_RESP = "88888888-8888-4888-8888-888888888888";

const mocks = vi.hoisted(() => {
  const events: string[] = [];
  return {
    events,
    rpc: vi.fn(),
    from: vi.fn(),
    invoke: vi.fn(),
    session: {
      responseId: "88888888-8888-4888-8888-888888888888",
      responseToken: "tok",
      checklistId: "22222222-2222-4222-8222-222222222222",
      createdAt: 0,
    },
  };
});

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: mocks.rpc,
    from: mocks.from,
    functions: { invoke: mocks.invoke },
    storage: {
      from: () => ({
        upload: vi.fn(async () => ({ error: null })),
        getPublicUrl: () => ({ data: { publicUrl: "https://example.test/f" } }),
      }),
    },
  },
}));

vi.mock("@/lib/execution-response-session", () => ({
  ensureCanonicalResponseSession: vi.fn(async () => mocks.session),
}));

vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

vi.mock("@/components/BlockRenderer", () => ({ BlockRenderer: () => <div /> }));
vi.mock("@/components/PublicCameraBlock", () => ({ PublicCameraBlock: () => <div /> }));
vi.mock("@/contexts/CameraSessionContext", () => ({
  CameraSessionProvider: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
}));

import { ExecutionEngine } from "@/components/ExecutionEngine";

const checklist = { id: CHK, title: "Checklist", blocks: [], settings: {} };

function submitForm(container: HTMLElement) {
  const form = container.querySelector("form");
  expect(form).not.toBeNull();
  fireEvent.submit(form!);
}

beforeEach(() => {
  mocks.events.length = 0;
  mocks.rpc.mockReset();
  mocks.invoke.mockReset();
  mocks.session.responseId = SESSION_RESP;

  const builder: Record<string, unknown> = {
    update: vi.fn(() => builder),
    eq: vi.fn(async () => ({ data: null, error: null })),
  };
  mocks.from.mockReset();
  mocks.from.mockReturnValue(builder);

  mocks.rpc.mockImplementation(async (name: string) => {
    mocks.events.push(`rpc:${name}`);
    if (name === "finalize_public_response") {
      return { data: [{ response_id: FINALIZED_RESP, status: "submitted" }], error: null };
    }
    if (name === "complete_assignment") return { data: null, error: null };
    return { data: null, error: null };
  });
});

describe("6B.2B — ordem do vínculo no submit", () => {
  it("sem occurrenceId o fluxo legado é preservado: nenhuma chamada de bridge", async () => {
    const onSubmitted = vi.fn();
    const onOccurrenceComplete = vi.fn(async () => true);

    const { container } = render(
      <ExecutionEngine
        checklist={checklist}
        mode="authenticated"
        onSubmitted={onSubmitted}
        onOccurrenceComplete={onOccurrenceComplete}
      />,
    );

    submitForm(container);

    await waitFor(() => expect(onSubmitted).toHaveBeenCalledTimes(1));
    expect(onOccurrenceComplete).not.toHaveBeenCalled();
    expect(mocks.events).toEqual(["rpc:finalize_public_response", "rpc:complete_assignment"]);
  });

  it("com occurrenceId conclui a occurrence APÓS o finalize e só então encerra a execução", async () => {
    const onSubmitted = vi.fn();
    const onOccurrenceComplete = vi.fn(async () => {
      mocks.events.push("bridge");
      return true;
    });

    const { container } = render(
      <ExecutionEngine
        checklist={checklist}
        mode="authenticated"
        occurrenceId={OCC}
        onOccurrenceComplete={onOccurrenceComplete}
        onSubmitted={onSubmitted}
      />,
    );

    submitForm(container);

    await waitFor(() => expect(onSubmitted).toHaveBeenCalledTimes(1));
    expect(mocks.events).toEqual([
      "rpc:finalize_public_response",
      "bridge",
      "rpc:complete_assignment",
    ]);
    expect(onOccurrenceComplete).toHaveBeenCalledTimes(1);
    expect(onOccurrenceComplete).toHaveBeenCalledWith(FINALIZED_RESP);
  });

  it("fallback canônico: sem response_id no retorno do finalize usa o id da sessão", async () => {
    mocks.rpc.mockImplementation(async (name: string) => {
      if (name === "finalize_public_response") {
        return { data: [{ status: "submitted" }], error: null };
      }
      return { data: null, error: null };
    });

    const onOccurrenceComplete = vi.fn(async () => true);
    const onSubmitted = vi.fn();

    const { container } = render(
      <ExecutionEngine
        checklist={checklist}
        mode="authenticated"
        occurrenceId={OCC}
        onOccurrenceComplete={onOccurrenceComplete}
        onSubmitted={onSubmitted}
      />,
    );

    submitForm(container);

    await waitFor(() => expect(onSubmitted).toHaveBeenCalledTimes(1));
    expect(onOccurrenceComplete).toHaveBeenCalledWith(SESSION_RESP);
  });
});

describe("6B.2B — falha de envio nunca conclui a occurrence", () => {
  it("finalize com erro não aciona o bridge nem encerra a execução", async () => {
    mocks.rpc.mockImplementation(async (name: string, args: unknown) => {
      mocks.events.push(`rpc:${name}`);
      if (name === "finalize_public_response") {
        return { data: null, error: { message: "invalid_response_token" } };
      }
      expect(args).toBeTruthy();
      return { data: null, error: null };
    });

    const onOccurrenceComplete = vi.fn(async () => true);
    const onSubmitted = vi.fn();

    const { container } = render(
      <ExecutionEngine
        checklist={checklist}
        mode="authenticated"
        occurrenceId={OCC}
        onOccurrenceComplete={onOccurrenceComplete}
        onSubmitted={onSubmitted}
      />,
    );

    submitForm(container);

    await waitFor(() => expect(mocks.rpc).toHaveBeenCalled());
    expect(onOccurrenceComplete).not.toHaveBeenCalled();
    expect(onSubmitted).not.toHaveBeenCalled();
    expect(screen.queryByTestId("occurrence-bridge-retry")).toBeNull();
  });
});

describe("6B.2B — falha da conclusão: retry sem segunda resposta", () => {
  it("mostra recuperação honesta, não encerra a execução e não roda complete_assignment", async () => {
    const onOccurrenceComplete = vi.fn(async () => false);
    const onSubmitted = vi.fn();

    const { container } = render(
      <ExecutionEngine
        checklist={checklist}
        mode="authenticated"
        occurrenceId={OCC}
        onOccurrenceComplete={onOccurrenceComplete}
        onSubmitted={onSubmitted}
      />,
    );

    submitForm(container);

    await waitFor(() => expect(screen.getByTestId("occurrence-bridge-retry")).toBeInTheDocument());
    expect(onOccurrenceComplete).toHaveBeenCalledTimes(1);
    expect(onSubmitted).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalledWith("complete_assignment", expect.anything());
    expect(mocks.events).toEqual(["rpc:finalize_public_response"]);
  });

  it("o retry repete APENAS a conclusão, reutiliza o mesmo response_id e então encerra", async () => {
    const onOccurrenceComplete = vi
      .fn<(responseId: string | null) => Promise<boolean>>()
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true);
    const onSubmitted = vi.fn();

    const { container } = render(
      <ExecutionEngine
        checklist={checklist}
        mode="authenticated"
        occurrenceId={OCC}
        onOccurrenceComplete={onOccurrenceComplete}
        onSubmitted={onSubmitted}
      />,
    );

    submitForm(container);
    await waitFor(() => expect(screen.getByTestId("occurrence-bridge-retry")).toBeInTheDocument());

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /tentar novamente/i }));
    });

    await waitFor(() => expect(onSubmitted).toHaveBeenCalledTimes(1));
    expect(onOccurrenceComplete).toHaveBeenCalledTimes(2);
    expect(onOccurrenceComplete.mock.calls[0]).toEqual([FINALIZED_RESP]);
    expect(onOccurrenceComplete.mock.calls[1]).toEqual([FINALIZED_RESP]);

    // Uma única submissão: nenhuma segunda resposta é criada para "resolver".
    const finalizeCalls = mocks.rpc.mock.calls.filter((c) => c[0] === "finalize_public_response");
    expect(finalizeCalls).toHaveLength(1);
    expect(screen.queryByTestId("occurrence-bridge-retry")).toBeNull();
  });

  it("retry que volta a falhar mantém a tela de recuperação e a execução aberta", async () => {
    const onOccurrenceComplete = vi.fn(async () => false);
    const onSubmitted = vi.fn();

    const { container } = render(
      <ExecutionEngine
        checklist={checklist}
        mode="authenticated"
        occurrenceId={OCC}
        onOccurrenceComplete={onOccurrenceComplete}
        onSubmitted={onSubmitted}
      />,
    );

    submitForm(container);
    await waitFor(() => expect(screen.getByTestId("occurrence-bridge-retry")).toBeInTheDocument());

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /tentar novamente/i }));
    });

    await waitFor(() => expect(onOccurrenceComplete).toHaveBeenCalledTimes(2));
    expect(screen.getByTestId("occurrence-bridge-retry")).toBeInTheDocument();
    expect(onSubmitted).not.toHaveBeenCalled();
  });
});

describe("6B.2B — superfície pública intacta", () => {
  it("checklist em modo público sem occurrence conclui sem bridge e sem complete_assignment", async () => {
    const onSubmitted = vi.fn();

    const { container } = render(
      <ExecutionEngine checklist={checklist} mode="public" onSubmitted={onSubmitted} />,
    );

    submitForm(container);

    await waitFor(() => expect(onSubmitted).toHaveBeenCalledTimes(1));
    expect(mocks.events).toEqual(["rpc:finalize_public_response"]);
  });

  it("a sessão tipada consumida continua sendo a de response-session", () => {
    const session: ResponseSession = mocks.session;
    expect(session.checklistId).toBe(CHK);
  });
});
