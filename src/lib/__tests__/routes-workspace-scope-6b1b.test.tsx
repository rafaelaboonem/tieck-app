/**
 * Execution 6B.1B — route-level workspace scoping.
 *
 * §D requirements: /painel passes currentWorkspace.id to useUnitCompliance;
 * /insights gates the hook on workspace resolution and shows an honest
 * no-workspace state; the operational detail validates the unit with
 * id + workspace_id and only mounts content hooks after validation.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// Router fora de escopo: navegação e Link stubados; useParams/useSearch são
// substituídos nos objetos Route exportados por cada rota.
vi.mock("@tanstack/react-router", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-router")>();
  return {
    ...actual,
    useNavigate: () => vi.fn(),
    Link: ({ children }: { children?: React.ReactNode }) => <a>{children}</a>,
  };
});

// ---------------------------------------------------------------------------
// Mocks de contexto (os três consumidores reais do WorkspaceContext).
// ---------------------------------------------------------------------------

const workspaceState = {
  currentWorkspace: { id: "org-1", name: "Org Um" } as { id: string; name: string } | null,
  workspaceStatus: "workspace" as "loading" | "personal" | "workspace",
};

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ user: { id: "u1" }, loading: false }),
}));

vi.mock("@/contexts/WorkspaceContext", () => ({
  useWorkspace: () => workspaceState,
}));

vi.mock("@/contexts/SidebarContext", () => ({
  useSidebar: () => ({ sidebarOpen: true }),
}));

vi.mock("@/hooks/use-mobile", () => ({
  useIsMobile: () => false,
}));

// Toast fora do escopo desta suíte.
vi.mock("sonner", () => ({ toast: { error: vi.fn() } }));

// Hooks de dados: apenas observamos os argumentos com que são chamados.
vi.mock("@/hooks/useUnitCompliance", () => ({
  useUnitCompliance: vi.fn(() => ({
    data: [],
    loading: false,
    error: null,
    refresh: vi.fn(),
  })),
}));

vi.mock("@/hooks/useUnitOperationalDetails", () => ({
  useUnitOperationalDetails: vi.fn(() => ({
    data: [],
    loading: false,
    error: null,
    refresh: vi.fn(),
  })),
}));

vi.mock("@/lib/useInsights", () => ({
  useInsights: vi.fn(() => ({
    insights: [],
    loading: false,
    isEmpty: true,
    error: false,
    refresh: vi.fn(),
  })),
}));

// useWorkspaceRBAC: admin por padrão (o /painel já valida admin — fora do escopo).
vi.mock("@/hooks/useWorkspaceRBAC", () => ({
  useWorkspaceRBAC: vi.fn(() => ({ isAdmin: true, loading: false })),
}));

// Supabase para a verificação de unidade no detalhe operacional.
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: vi.fn(() => {
      const b: any = Promise.resolve({
        data: { id: "unit-1", name: "Unidade Um" },
        error: null,
      });
      b.select = vi.fn().mockReturnValue(b);
      b.eq = vi.fn().mockReturnValue(b);
      b.maybeSingle = vi.fn().mockReturnValue(b);
      return b;
    }),
    channel: vi.fn().mockReturnValue({
      on: vi.fn().mockReturnThis(),
      subscribe: vi.fn().mockReturnThis(),
    }),
    removeChannel: vi.fn(),
  },
}));

// Componentes de layout/visual pesados: stubs neutros.
vi.mock("@/components/DashboardLayout", () => ({
  DashboardLayout: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock("@/components/dashboard/OperationalDashboardFilters", () => ({
  OperationalDashboardFilters: () => <div data-testid="filters" />,
  sanitizeFilters: (v: Record<string, unknown>) => v,
}));
vi.mock("@/components/dashboard/UnitComplianceChart", () => ({
  UnitComplianceChart: () => <div data-testid="chart" />,
}));
vi.mock("@/components/dashboard/UnitPerformanceTable", () => ({
  UnitPerformanceTable: () => <div data-testid="table" />,
}));
// Componentes visuais reais do /painel (kit transplantado): stubs neutros —
// esta suíte verifica apenas o escopo de workspace, não a apresentação.
vi.mock("@/components/dashboard/real/RealMetricsOverview", () => ({
  RealMetricsOverview: () => <div data-testid="metrics" />,
  RealMetricCard: ({ metric }: { metric: { title: string } }) => (
    <div data-testid="metric-card">{metric.title}</div>
  ),
}));

// Unidades do filtro: nenhuma consulta real é executada nesta suíte (o escopo
// verificado é o do workspace, não o da lista de unidades).
vi.mock("@/hooks/useAccessibleUnits", () => ({
  useAccessibleUnits: () => ({ units: [], loading: false, error: null }),
}));
vi.mock("@/components/dashboard/real/RealComplianceChart", () => ({
  RealComplianceChart: () => <div data-testid="compliance-chart" />,
}));
vi.mock("@/components/dashboard/real/RealExecutionBreakdown", () => ({
  RealExecutionBreakdown: () => <div data-testid="execution" />,
}));
vi.mock("@/components/dashboard/real/RealAttentionRanking", () => ({
  RealAttentionRanking: () => <div data-testid="attention" />,
}));
vi.mock("@/components/dashboard/real/RealRecentExecutions", () => ({
  RealRecentExecutions: () => <div data-testid="recent-executions" />,
}));
vi.mock("@/components/dashboard/real/RealUnitDataTable", () => ({
  RealUnitDataTable: () => <div data-testid="units-table" />,
}));
vi.mock("@/components/operations/OperationalTaskItem", () => ({
  OperationalTaskItem: () => <div />,
}));
vi.mock("@/components/operations/TaskExecutionDetailDrawer", () => ({
  TaskExecutionDetailDrawer: () => <div />,
}));

import { Route as PainelRoute } from "../../routes/painel";
import { Route as InsightsRoute } from "../../routes/insights";
import { Route as UnitOperacaoRoute } from "../../routes/unidades.$unitId.operacao";
import { useUnitCompliance } from "@/hooks/useUnitCompliance";
import { useUnitOperationalDetails } from "@/hooks/useUnitOperationalDetails";
import { useInsights } from "@/lib/useInsights";
import { supabase } from "@/integrations/supabase/client";

const mockUseUnitCompliance = vi.mocked(useUnitCompliance);
const mockUseUnitOperationalDetails = vi.mocked(useUnitOperationalDetails);
const mockUseInsights = vi.mocked(useInsights);

/** Substitui useParams/useSearch nos objetos Route (sem router provider). */
function stubRouteHooks(
  route: object,
  params: Record<string, string>,
  search: Record<string, unknown>,
) {
  const r = route as unknown as Record<string, unknown>;
  r.useParams = () => params;
  r.useSearch = () => search;
}

function renderRouteComponent(route: { options: { component?: React.ComponentType } }) {
  const Component = route.options.component as React.ComponentType;
  expect(Component).toBeTruthy();
  return render(<Component />);
}

const PAINEL_SRC = readFileSync(resolve(__dirname, "../../routes/painel.tsx"), "utf8");
const INSIGHTS_SRC = readFileSync(resolve(__dirname, "../../routes/insights.tsx"), "utf8");
const OPERACAO_SRC = readFileSync(
  resolve(__dirname, "../../routes/unidades.$unitId.operacao.tsx"),
  "utf8",
);

describe("6B.1B — /painel workspace scoping", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    workspaceState.currentWorkspace = { id: "org-1", name: "Org Um" };
    workspaceState.workspaceStatus = "workspace";
    stubRouteHooks(PainelRoute, {}, {});
  });

  it("passes currentWorkspace.id as organizationId to useUnitCompliance", () => {
    renderRouteComponent(PainelRoute);

    expect(mockUseUnitCompliance).toHaveBeenCalled();
    const args = mockUseUnitCompliance.mock.calls[0][0];
    expect(args.organizationId).toBe("org-1");
    // enabled permanece condicionado a autenticação + RBAC.
    expect(typeof args.enabled).toBe("boolean");
    expect(args.enabled).toBe(true);
  });

  it("does not enable queries without a selected workspace", () => {
    workspaceState.currentWorkspace = null;
    renderRouteComponent(PainelRoute);

    const args = mockUseUnitCompliance.mock.calls[0][0];
    expect(args.organizationId).toBeNull();
    expect(args.enabled).toBe(false);
  });

  it("structural: organizationId flows from WorkspaceContext into the hook", () => {
    // O painel também lê `workspaceStatus` para só decidir acesso depois que o
    // workspace resolveu; o vínculo com o hook continua obrigatório.
    expect(PAINEL_SRC).toMatch(/const \{[^}]*currentWorkspace[^}]*\} = useWorkspace\(\)/);
    expect(PAINEL_SRC).toContain("organizationId: currentWorkspace?.id");
  });
});

describe("6B.1B — /insights workspace gating", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    workspaceState.currentWorkspace = { id: "org-1", name: "Org Um" };
    workspaceState.workspaceStatus = "workspace";
    stubRouteHooks(InsightsRoute, {}, {});
  });

  it("enables the hook only with a resolved workspace", () => {
    renderRouteComponent(InsightsRoute);

    expect(mockUseInsights).toHaveBeenCalled();
    const args = mockUseInsights.mock.calls[0][0];
    expect(args?.organizationId).toBe("org-1");
    expect(args?.enabled).toBe(true);
  });

  it("no workspace: honest selection prompt, never the empty-insights message", () => {
    workspaceState.currentWorkspace = null;
    workspaceState.workspaceStatus = "personal";
    renderRouteComponent(InsightsRoute);

    expect(
      screen.getByText(/Selecione um workspace para ver os insights/i),
    ).toBeTruthy();
    // Estado vazio honesto da 6B.1A NÃO pode aparecer sem consulta real.
    expect(screen.queryByText(/Nenhum insight no momento/i)).toBeNull();
    // Nenhuma consulta habilitada.
    expect(mockUseInsights.mock.calls[0][0]?.enabled).toBe(false);
  });

  it("workspace still loading: skeletons, not empty and not error", () => {
    workspaceState.workspaceStatus = "loading";
    renderRouteComponent(InsightsRoute);

    expect(screen.queryByText(/Nenhum insight no momento/i)).toBeNull();
    expect(screen.queryByText(/Não foi possível carregar os insights/i)).toBeNull();
    expect(document.querySelectorAll(".animate-pulse").length).toBeGreaterThan(0);
    expect(mockUseInsights.mock.calls[0][0]?.enabled).toBe(false);
  });
});

describe("6B.1B — /unidades/$unitId/operacao unit validation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    workspaceState.currentWorkspace = { id: "org-1", name: "Org Um" };
    workspaceState.workspaceStatus = "workspace";
    stubRouteHooks(UnitOperacaoRoute, { unitId: "unit-1" }, {});
  });

  function mockUnitQuery(result: { data: unknown; error: unknown }) {
    vi.mocked(supabase.from).mockImplementation(((() => {
      const b: any = Promise.resolve(result);
      b.select = vi.fn().mockReturnValue(b);
      b.eq = vi.fn().mockReturnValue(b);
      b.maybeSingle = vi.fn().mockReturnValue(b);
      return b;
    })) as never);
  }

  it("validates the unit with id + workspace_id", async () => {
    mockUnitQuery({ data: { id: "unit-1", name: "Unidade Um" }, error: null });
    renderRouteComponent(UnitOperacaoRoute);

    await waitFor(() => expect(mockUseUnitCompliance).toHaveBeenCalled());

    // A primeira consulta emitida pela rota é a da unidade ("units").
    const eqMock = vi
      .mocked(supabase.from)
      .mock.results[0].value as unknown as { eq: ReturnType<typeof vi.fn> };
    const eqCalls = (eqMock.eq as any).mock.calls as Array<[string, unknown]>;
    expect(eqCalls).toContainEqual(["id", "unit-1"]);
    expect(eqCalls).toContainEqual(["workspace_id", "org-1"]);
  });

  it("does not mount content hooks before the unit is validated", async () => {
    mockUnitQuery({ data: { id: "unit-1", name: "Unidade Um" }, error: null });
    renderRouteComponent(UnitOperacaoRoute);

    // Antes da validação concluir, nenhum hook operacional roda.
    expect(mockUseUnitCompliance).not.toHaveBeenCalled();
    expect(mockUseUnitOperationalDetails).not.toHaveBeenCalled();

    await waitFor(() => expect(mockUseUnitCompliance).toHaveBeenCalled());
    expect(mockUseUnitOperationalDetails).toHaveBeenCalled();
  });

  it("unit from another workspace: generic denied state, no data hooks", async () => {
    mockUnitQuery({ data: null, error: null });
    renderRouteComponent(UnitOperacaoRoute);

    await waitFor(() =>
      expect(screen.getByText(/Unidade não encontrada ou sem permissão/i)).toBeTruthy(),
    );
    expect(mockUseUnitCompliance).not.toHaveBeenCalled();
    expect(mockUseUnitOperationalDetails).not.toHaveBeenCalled();
  });

  it("content hooks receive the current workspace id as organizationId", async () => {
    mockUnitQuery({ data: { id: "unit-1", name: "Unidade Um" }, error: null });
    renderRouteComponent(UnitOperacaoRoute);

    await waitFor(() => expect(mockUseUnitOperationalDetails).toHaveBeenCalled());
    const detailsArgs = mockUseUnitOperationalDetails.mock.calls[0][0];
    expect(detailsArgs.organizationId).toBe("org-1");
    expect(detailsArgs.unitId).toBe("unit-1");
    const complianceArgs = mockUseUnitCompliance.mock.calls[0][0];
    expect(complianceArgs.organizationId).toBe("org-1");
  });

  it("structural: unit query uses workspace_id and hooks wait for validation", () => {
    expect(OPERACAO_SRC).toContain('.eq("workspace_id", currentWorkspace!.id)');
    expect(OPERACAO_SRC).toContain("scopeResolved");
  });
});
