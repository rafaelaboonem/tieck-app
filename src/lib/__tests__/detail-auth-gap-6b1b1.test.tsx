/**
 * Execution 6B.1B.1 — operational detail route: honest no-workspace state and
 * scope-bound unit authorization (stale validation cannot authorize a new
 * workspace scope).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, act, waitFor, screen } from "@testing-library/react";
import { supabase } from "@/integrations/supabase/client";

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: vi.fn(),
    channel: vi.fn().mockReturnValue({
      on: vi.fn().mockReturnThis(),
      subscribe: vi.fn().mockReturnThis(),
    }),
    removeChannel: vi.fn(),
  },
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ user: { id: "u1" }, loading: false }),
}));

const workspaceState = {
  currentWorkspace: null as { id: string; name: string } | null,
  workspaceStatus: "personal" as "loading" | "personal" | "workspace",
};

vi.mock("@/contexts/WorkspaceContext", () => ({
  useWorkspace: () => workspaceState,
}));

vi.mock("@/contexts/SidebarContext", () => ({
  useSidebar: () => ({ sidebarOpen: true }),
}));

vi.mock("@tanstack/react-router", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-router")>();
  return {
    ...actual,
    useNavigate: () => vi.fn(),
    Link: ({ children }: { children?: React.ReactNode }) => <a>{children}</a>,
  };
});

vi.mock("@/hooks/useUnitCompliance", () => ({
  useUnitCompliance: vi.fn(() => ({ data: [], loading: false, error: null, refresh: vi.fn() })),
}));
vi.mock("@/hooks/useUnitOperationalDetails", () => ({
  useUnitOperationalDetails: vi.fn(() => ({ data: [], loading: false, error: null, refresh: vi.fn() })),
}));
vi.mock("@/components/DashboardLayout", () => ({
  DashboardLayout: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock("@/components/dashboard/OperationalDashboardFilters", () => ({
  OperationalDashboardFilters: () => <div />,
  sanitizeFilters: (v: Record<string, unknown>) => v,
}));
vi.mock("@/components/operations/OperationalTaskItem", () => ({
  OperationalTaskItem: () => <div />,
}));
vi.mock("@/components/operations/TaskExecutionDetailDrawer", () => ({
  TaskExecutionDetailDrawer: () => <div />,
}));

import { Route as UnitOperacaoRoute } from "../../routes/unidades.$unitId.operacao";
import { useUnitCompliance as mockedUseUnitCompliance } from "@/hooks/useUnitCompliance";
import { useUnitOperationalDetails as mockedUseUnitOperationalDetails } from "@/hooks/useUnitOperationalDetails";

const mockCompliance = vi.mocked(mockedUseUnitCompliance);
const mockDetails = vi.mocked(mockedUseUnitOperationalDetails);

const drain = async () => {
  for (let i = 0; i < 12; i++) await Promise.resolve();
};

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

interface QResult {
  data: unknown;
  error: unknown;
}

function gatedBuilder(gate?: Deferred<QResult>) {
  const b: any = {};
  const outcome = gate ? gate.promise : Promise.resolve({ data: null, error: null });
  b.then = (onF: any, onR: any) => outcome.then(onF, onR);
  b.catch = (onR: any) => outcome.catch(onR);
  b.finally = (cb: any) => outcome.finally(cb);
  const chain = () => vi.fn(() => b);
  b.select = chain();
  b.eq = chain();
  b.maybeSingle = chain();
  return b;
}

function stubRoute(params: Record<string, string>) {
  const r = UnitOperacaoRoute as unknown as Record<string, unknown>;
  r.useParams = () => params;
  r.useSearch = () => ({});
}

function DetailPage() {
  const Component = UnitOperacaoRoute.options.component as React.ComponentType;
  return <Component />;
}

describe("6B.1B.1 — operational detail: honest no-workspace state", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    workspaceState.currentWorkspace = null;
    workspaceState.workspaceStatus = "personal";
    stubRoute({ unitId: "unit-1" });
  });

  it("personal mode: selection prompt, no endless 'Verificando permissão', zero queries, zero hook mounts", async () => {
    render(<DetailPage />);
    await act(async () => {
      await drain();
    });

    expect(screen.getByText(/Selecione um workspace para ver a operação/i)).toBeTruthy();
    expect(screen.queryByText(/Verificando permissão/i)).toBeNull();
    expect(supabase.from).not.toHaveBeenCalled();
    expect(mockCompliance).not.toHaveBeenCalled();
    expect(mockDetails).not.toHaveBeenCalled();
  });

  it("workspace loading: 'Verificando' may persist, but no queries yet", async () => {
    workspaceState.workspaceStatus = "loading";
    render(<DetailPage />);
    await act(async () => {
      await drain();
    });

    expect(screen.queryByText(/Selecione um workspace/i)).toBeNull();
    expect(supabase.from).not.toHaveBeenCalled();
  });
});

describe("6B.1B.1 — operational detail: scope-bound authorization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    workspaceState.workspaceStatus = "workspace";
    stubRoute({ unitId: "unit-1" });
  });

  it("stale unit validation of A cannot authorize B; only B's own check mounts content", { timeout: 20000 }, async () => {
    workspaceState.currentWorkspace = { id: "org-A", name: "A" };
    const gateA = deferred<QResult>();
    const gateB = deferred<QResult>();
    const queue = [gateA, gateB];
    vi.mocked(supabase.from).mockImplementation((() => {
      const gate = queue.shift() ?? gateB;
      return gatedBuilder(gate) as never;
    }) as never);

    const { rerender } = render(<DetailPage />);
    // Validação de A em voo (unidade do workspace A).
    await act(async () => {
      await drain();
    });
    expect(mockCompliance).not.toHaveBeenCalled();
    expect(mockDetails).not.toHaveBeenCalled();

    // Troca para B ANTES de A resolver.
    workspaceState.currentWorkspace = { id: "org-B", name: "B" };
    rerender(<DetailPage />);
    await act(async () => {
      await drain();
    });

    // Autorização antiga de A chega tarde: não pode autorizar B.
    gateA.resolve({ data: { id: "unit-1", name: "UNIT-A" }, error: null });
    await act(async () => {
      await drain();
    });
    expect(screen.queryByText("UNIT-A")).toBeNull();
    expect(mockCompliance).not.toHaveBeenCalled();
    expect(mockDetails).not.toHaveBeenCalled();

    // Validação própria de B (id + workspace_id de B) autoriza o conteúdo.
    gateB.resolve({ data: { id: "unit-1", name: "UNIT-B" }, error: null });
    await waitFor(() => expect(mockCompliance).toHaveBeenCalled());
    expect(mockDetails).toHaveBeenCalled();
    // O nome aparece no breadcrumb e no h1.
    expect(screen.getAllByText("UNIT-B").length).toBeGreaterThanOrEqual(1);
    // O escopo passado aos hooks é o de B.
    expect(
      mockCompliance.mock.calls[mockCompliance.mock.calls.length - 1][0].organizationId,
    ).toBe("org-B");
    expect(
      mockDetails.mock.calls[mockDetails.mock.calls.length - 1][0].organizationId,
    ).toBe("org-B");
  });

  it("unit of another workspace: generic denied state, no data hooks", async () => {
    workspaceState.currentWorkspace = { id: "org-1", name: "Org" };
    vi.mocked(supabase.from).mockImplementation(
      (() => gatedBuilder()) as never, // units -> { data: null }
    );
    render(<DetailPage />);
    await waitFor(() =>
      expect(screen.getByText(/Unidade não encontrada ou sem permissão/i)).toBeTruthy(),
    );
    expect(mockCompliance).not.toHaveBeenCalled();
    expect(mockDetails).not.toHaveBeenCalled();
  });
});
