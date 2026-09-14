/**
 * Execution 6B.2B — comportamento real da rota /executar/$id.
 *
 * Prova, com chamadas observadas e render real (não leitura de fonte):
 *   - sem occurrenceId o comportamento legado é idêntico e nenhuma RPC de
 *     occurrence é chamada;
 *   - search param malformado é descartado pelo validateSearch (fail-closed);
 *   - occurrence válida abre o checklist certo, uma única chamada, e entrega o
 *     contexto + callback de conclusão ao engine;
 *   - checklist errado, usuário errado e cross-workspace são recusados com a
 *     MESMA resposta genérica, sem montar o engine;
 *   - occurrence já concluída não monta o engine (nenhuma nova resposta).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, waitFor, screen, fireEvent, act } from "@testing-library/react";
import { supabase } from "@/integrations/supabase/client";

const CHK = "22222222-2222-4222-8222-222222222222";
const OCC = "11111111-1111-4111-8111-111111111111";
const OTHER_OCC = "99999999-9999-4999-8999-999999999999";
const SCHED = "44444444-4444-4444-8444-444444444444";
const WS = "55555555-5555-4555-8555-555555555555";
const WM = "66666666-6666-4666-8666-666666666666";
const RESP = "77777777-7777-4777-8777-777777777777";

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  engineProps: null as Record<string, unknown> | null,
  engineMounts: 0,
}));

vi.mock("@/integrations/supabase/client", () => {
  const builder: Record<string, unknown> = {};
  builder.select = vi.fn(() => builder);
  builder.eq = vi.fn(() => builder);
  builder.maybeSingle = vi.fn(async () => ({
    data: {
      id: "22222222-2222-4222-8222-222222222222",
      user_id: "u1",
      workspace_id: "55555555-5555-4555-8555-555555555555",
      published_content: { blocks: [] },
      checklist_assignments: [],
      settings: {},
    },
    error: null,
  }));
  return {
    supabase: { from: vi.fn(() => builder), rpc: mocks.rpc },
  };
});

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ user: { id: "u1" }, loading: false }),
}));

vi.mock("@/contexts/WorkspaceContext", () => ({
  useWorkspace: () => ({
    workspaces: [],
    currentWorkspace: { id: "55555555-5555-4555-8555-555555555555", name: "WS" },
    workspaceStatus: "workspace",
  }),
}));

vi.mock("@/hooks/useWorkspaceRBAC", () => ({
  useWorkspaceRBAC: () => ({
    role: "editor",
    workspaceMemberId: "66666666-6666-4666-8666-666666666666",
    hasAccess: true,
    canManage: true,
    isAdmin: false,
    isViewer: false,
    loading: false,
    isFetching: false,
  }),
}));

vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

vi.mock("@/components/DashboardLayout", () => ({
  DashboardLayout: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock("@/components/ExecutionEngine", () => ({
  ExecutionEngine: (props: Record<string, unknown>) => {
    mocks.engineProps = props;
    mocks.engineMounts += 1;
    return <div data-testid="execution-engine" />;
  },
}));

vi.mock("@tanstack/react-router", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-router")>();
  return {
    ...actual,
    useNavigate: () => vi.fn(),
    Link: ({ children }: { children?: React.ReactNode }) => <a>{children}</a>,
  };
});

import { Route as ExecutarRoute } from "../../routes/executar.$id";

/** Stubs dos hooks de rota do TanStack Router (sem RouterProvider real). */
type RouteStub = {
  useParams: () => Record<string, string>;
  useSearch: () => { occurrenceId?: string };
};

const route = ExecutarRoute as unknown as RouteStub;
const rpcMock = supabase.rpc as unknown as ReturnType<typeof vi.fn>;

const openCalls = () =>
  rpcMock.mock.calls.filter((c) => c[0] === "open_checklist_execution_occurrence");
const completeCalls = () =>
  rpcMock.mock.calls.filter((c) => c[0] === "complete_checklist_execution_occurrence");

const contextPayload = (over: Record<string, unknown> = {}) => ({
  occurrence_id: OCC,
  checklist_id: CHK,
  schedule_id: SCHED,
  workspace_id: WS,
  workspace_member_id: WM,
  occurrence_date: "2026-09-13",
  due_at: "2026-09-13T21:00:00+00:00",
  started_at: "2026-09-13T10:00:00+00:00",
  completed_at: null,
  response_id: null,
  ...over,
});

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function renderRoute(search: { occurrenceId?: string } = {}) {
  route.useParams = () => ({ id: CHK });
  route.useSearch = () => search;
  const Component = ExecutarRoute.options.component as React.ComponentType;
  return render(<Component />);
}

beforeEach(() => {
  rpcMock.mockReset();
  mocks.engineProps = null;
  mocks.engineMounts = 0;
  rpcMock.mockImplementation(async (name: string) => {
    if (name === "open_checklist_execution_occurrence") {
      return { data: contextPayload(), error: null };
    }
    if (name === "complete_checklist_execution_occurrence") {
      return {
        data: contextPayload({ completed_at: "2026-09-13T12:00:00+00:00", response_id: RESP }),
        error: null,
      };
    }
    return { data: null, error: null };
  });
});

describe("6B.2B — validateSearch fail-closed", () => {
  it("descarta qualquer occurrenceId que não seja uuid", () => {
    const validate = ExecutarRoute.options.validateSearch as (raw: Record<string, unknown>) => {
      occurrenceId?: string;
    };
    expect(validate({ occurrenceId: OCC })).toEqual({ occurrenceId: OCC });
    expect(validate({})).toEqual({ occurrenceId: undefined });
    expect(validate({ occurrenceId: "chk-1" })).toEqual({ occurrenceId: undefined });
    expect(validate({ occurrenceId: OTHER_OCC.slice(0, 12) })).toEqual({ occurrenceId: undefined });
    expect(validate({ occurrenceId: 123 })).toEqual({ occurrenceId: undefined });
    expect(validate({ occurrenceId: [OCC] })).toEqual({ occurrenceId: undefined });
    // Nunca aceita data/turno/parametros do navegador.
    expect(validate({ occurrenceId: OCC, startDate: "2026-01-01" })).toEqual({
      occurrenceId: OCC,
    });
  });
});

describe("6B.2B — compatibilidade total sem occurrenceId", () => {
  it("monta o engine e não chama nenhuma RPC de occurrence", async () => {
    renderRoute({});
    await waitFor(() => expect(screen.getByTestId("execution-engine")).toBeInTheDocument());

    expect(openCalls()).toHaveLength(0);
    expect(completeCalls()).toHaveLength(0);
    expect(mocks.engineProps?.occurrenceId).toBeUndefined();
    expect(mocks.engineProps?.onOccurrenceComplete).toBeUndefined();
  });

  it("search malformado cai no caminho legado (validateSearch já o removeu)", async () => {
    renderRoute({ occurrenceId: undefined });
    await waitFor(() => expect(screen.getByTestId("execution-engine")).toBeInTheDocument());
    expect(openCalls()).toHaveLength(0);
  });
});

describe("6B.2B — occurrence válida", () => {
  it("abre a occurrence exata, uma única vez, e entrega contexto + callback ao engine", async () => {
    renderRoute({ occurrenceId: OCC });
    await waitFor(() => expect(screen.getByTestId("execution-engine")).toBeInTheDocument());

    expect(openCalls()).toHaveLength(1);
    expect(openCalls()[0][1]).toEqual({ p_occurrence_id: OCC, p_checklist_id: CHK });
    expect(mocks.engineProps?.occurrenceId).toBe(OCC);
    expect(typeof mocks.engineProps?.onOccurrenceComplete).toBe("function");
  });

  it("não monta o engine enquanto a validação está pendente (nem vazio nem negado)", async () => {
    const gate = deferred<{ data: unknown; error: unknown }>();
    rpcMock.mockImplementationOnce(() => gate.promise);

    renderRoute({ occurrenceId: OCC });

    await waitFor(() => expect(openCalls()).toHaveLength(1));
    expect(screen.queryByTestId("execution-engine")).toBeNull();
    expect(screen.queryByText("Acesso Negado")).toBeNull();
    expect(screen.queryByText(/Nenhum insight/i)).toBeNull();

    await act(async () => {
      gate.resolve({ data: contextPayload(), error: null });
    });

    await waitFor(() => expect(screen.getByTestId("execution-engine")).toBeInTheDocument());
  });

  it("o callback de conclusão usa a RPC canônica com argumentos exatos e propaga falha", async () => {
    renderRoute({ occurrenceId: OCC });
    await waitFor(() => expect(screen.getByTestId("execution-engine")).toBeInTheDocument());

    const complete = mocks.engineProps!.onOccurrenceComplete as (
      id: string | null,
    ) => Promise<boolean>;

    let ok = false;
    await act(async () => {
      ok = await complete(RESP);
    });
    expect(ok).toBe(true);
    expect(completeCalls()).toHaveLength(1);
    expect(completeCalls()[0][1]).toEqual({
      p_occurrence_id: OCC,
      p_checklist_id: CHK,
      p_response_id: RESP,
    });

    rpcMock.mockResolvedValueOnce({
      data: null,
      error: { message: "occurrence_response_not_submitted" },
    });
    let okAfterFailure = true;
    await act(async () => {
      okAfterFailure = await complete(RESP);
    });
    expect(okAfterFailure).toBe(false);

    // Sem response id o vínculo não é silenciosamente ignorado.
    let okWithoutResponse = true;
    await act(async () => {
      okWithoutResponse = await complete(null);
    });
    expect(okWithoutResponse).toBe(false);
    expect(completeCalls()).toHaveLength(2);
  });
});

describe("6B.2B — negativas indistinguíveis e sem montar o engine", () => {
  const denials: Array<[string, string]> = [
    ["occurrence de outro checklist", "occurrence_checklist_mismatch"],
    ["occurrence de outro responsável", "occurrence_not_assignee"],
    ["occurrence inexistente (outro workspace)", "occurrence_not_found"],
  ];

  it.each(denials)("recusa %s com resposta genérica", async (_label, message) => {
    rpcMock.mockResolvedValueOnce({ data: null, error: { message } });

    renderRoute({ occurrenceId: OCC });

    await waitFor(() => expect(screen.getByText("Acesso Negado")).toBeInTheDocument());
    expect(screen.queryByTestId("execution-engine")).toBeNull();
    expect(openCalls()).toHaveLength(1);
    // A mensagem genérica não revela qual das três condições falhou.
    expect(screen.getByText(/não tem permissão para executar este checklist/i)).toBeInTheDocument();
    expect(screen.queryByText(message)).toBeNull();
  });

  it("nunca chama complete_assignment nem escreve occurrence a partir da negação", async () => {
    rpcMock.mockResolvedValueOnce({ data: null, error: { message: "occurrence_not_assignee" } });
    renderRoute({ occurrenceId: OCC });

    await waitFor(() => expect(screen.getByText("Acesso Negado")).toBeInTheDocument());
    expect(rpcMock).toHaveBeenCalledTimes(1);
    expect(completeCalls()).toHaveLength(0);
  });
});

describe("6B.2B — occurrence já concluída", () => {
  it("mostra estado honesto e NÃO monta o engine (nenhuma nova resposta)", async () => {
    rpcMock.mockResolvedValueOnce({
      data: contextPayload({ completed_at: "2026-09-13T12:00:00+00:00", response_id: RESP }),
      error: null,
    });

    renderRoute({ occurrenceId: OCC });

    await waitFor(() => expect(screen.getByText(/já foi concluída/i)).toBeInTheDocument());
    expect(screen.queryByTestId("execution-engine")).toBeNull();
    expect(mocks.engineMounts).toBe(0);
    expect(openCalls()).toHaveLength(1);
    expect(screen.queryByText("Acesso Negado")).toBeNull();
  });
});

describe("6B.2B — falha técnica sanitizada", () => {
  it("mostra mensagem genérica sem SQL e permite tentar novamente", async () => {
    rpcMock.mockResolvedValueOnce({
      data: null,
      error: { message: 'relation "public.checklist_execution_occurrences" does not exist' },
    });

    renderRoute({ occurrenceId: OCC });

    await waitFor(() =>
      expect(screen.getByText(/não foi possível abrir esta execução/i)).toBeInTheDocument(),
    );
    expect(screen.queryByTestId("execution-engine")).toBeNull();
    expect(screen.queryByText(/relation|public\.|does not exist/i)).toBeNull();
    expect(screen.queryByText("Acesso Negado")).toBeNull();

    // Retry reabre a validação; a segunda tentativa pode concluir normalmente.
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /tentar novamente/i }));
    });

    await waitFor(() => expect(screen.getByTestId("execution-engine")).toBeInTheDocument());
    expect(openCalls()).toHaveLength(2);
    expect(openCalls()[1][1]).toEqual({ p_occurrence_id: OCC, p_checklist_id: CHK });
  });
});

describe("6B.2B — a rota não escreve em tabela", () => {
  it("nenhum acesso direto a checklist_execution_occurrences no código da rota/engine", async () => {
    const { readFileSync } = await import("node:fs");
    const { resolve } = await import("node:path");
    for (const file of ["src/routes/executar.$id.tsx", "src/components/ExecutionEngine.tsx"]) {
      const src = readFileSync(resolve(process.cwd(), file), "utf8");
      expect(src).not.toMatch(/checklist_execution_occurrences/);
      expect(src).not.toMatch(/from\(\s*["']checklist_execution_schedules["']/);
    }
  });
});
