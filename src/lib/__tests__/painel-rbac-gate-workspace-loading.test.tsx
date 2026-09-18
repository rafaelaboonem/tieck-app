/**
 * Gate de acesso do `/painel` enquanto o workspace ainda está resolvendo.
 *
 * Comportamento coberto (regressão real observada em uso):
 *   admin autenticado + workspaceStatus === "loading"
 *   → NÃO pode navegar para /inicio nem exibir toast de acesso restrito,
 *     porque nesse instante `currentWorkspace` é null e o RBAC responde
 *     "não é admin" antes de o workspace existir.
 *
 *   depois do workspace resolver com isAdmin === true
 *   → o painel permanece.
 *
 * E, como contraprova, um não-admin com workspace resolvido continua sendo
 * redirecionado (a proteção de acesso não foi enfraquecida).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render } from "@testing-library/react";

const navigateSpy = vi.fn();
const toastErrorSpy = vi.fn();

vi.mock("@tanstack/react-router", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-router")>();
  return {
    ...actual,
    useNavigate: () => navigateSpy,
    Link: ({ children }: { children?: React.ReactNode }) => <a>{children}</a>,
  };
});

const workspaceState = {
  currentWorkspace: { id: "org-1", name: "Org Um" } as { id: string; name: string } | null,
  workspaceStatus: "loading" as "loading" | "personal" | "workspace",
};

const rbacState = { isAdmin: true, loading: false };

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ user: { id: "u1" }, loading: false }),
}));

vi.mock("@/contexts/WorkspaceContext", () => ({
  useWorkspace: () => workspaceState,
}));

vi.mock("@/hooks/useWorkspaceRBAC", () => ({
  useWorkspaceRBAC: () => rbacState,
}));

vi.mock("sonner", () => ({ toast: { error: (msg: string) => toastErrorSpy(msg) } }));

vi.mock("@/components/DashboardLayout", () => ({
  DashboardLayout: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock("@/components/dashboard/OperationalDashboardFilters", () => ({
  OperationalDashboardFilters: () => <div data-testid="filters" />,
  sanitizeFilters: (v: Record<string, unknown>) => v,
}));

// Componentes visuais: stubs neutros (a apresentação não é o objeto deste teste).
// A composição oficial usa `RealMetricCard` (um card por indicador); o stub
// mantém o `data-testid` que este teste usa para saber que o painel montou.
vi.mock("@/components/dashboard/real/RealMetricsOverview", () => ({
  RealMetricsOverview: () => <div data-testid="metrics" />,
  RealMetricCard: () => <div data-testid="metric-card" />,
}));

// Unidades do filtro: nenhuma consulta real nesta suíte.
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
vi.mock("@/components/dashboard/ScheduledOccurrencesSection", () => ({
  ScheduledOccurrencesSection: () => <div data-testid="occurrences" />,
}));

// Hooks de dados: nenhuma consulta real é executada nesta suíte.
vi.mock("@/hooks/useUnitCompliance", () => ({
  useUnitCompliance: vi.fn(() => ({ data: [], loading: false, error: null, refresh: vi.fn() })),
}));
vi.mock("@/hooks/useUnitOccurrenceMetrics", () => ({
  useUnitOccurrenceMetrics: vi.fn(() => ({
    data: [],
    kpis: {},
    loading: false,
    error: null,
    refresh: vi.fn(),
  })),
}));
vi.mock("@/hooks/useShiftOptions", () => ({
  useShiftOptions: vi.fn(() => ({ shifts: [], resolved: true, loading: false })),
}));
// Série diária de atividade: neutra e JÁ carregada — este teste olha o gate de
// acesso, e o esqueleto do card não pode ficar pendurado no recorte resolvido.
vi.mock("@/hooks/useChecklistActivity", () => ({
  useChecklistActivity: vi.fn(() => ({ data: [], loading: false, error: null, refresh: vi.fn() })),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: vi.fn(() => ({})),
    channel: vi.fn(() => ({ on: vi.fn().mockReturnThis(), subscribe: vi.fn().mockReturnThis() })),
    removeChannel: vi.fn(),
  },
}));

import { Route as PainelRoute } from "../../routes/painel";
import { useUnitCompliance } from "@/hooks/useUnitCompliance";

function stubRouteHooks() {
  const r = PainelRoute as unknown as Record<string, unknown>;
  r.useParams = () => ({});
  r.useSearch = () => ({});
}

function painelComponent() {
  return PainelRoute.options.component as React.ComponentType;
}

function renderPainel() {
  stubRouteHooks();
  const Component = painelComponent();
  return render(<Component />);
}

describe("Painel — gate de acesso durante o carregamento do workspace", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    workspaceState.currentWorkspace = { id: "org-1", name: "Org Um" };
    workspaceState.workspaceStatus = "loading";
    rbacState.isAdmin = true;
    rbacState.loading = false;
  });

  it("admin + workspaceStatus 'loading': não navega para /inicio e não mostra erro de acesso", () => {
    const { container } = renderPainel();

    expect(navigateSpy).not.toHaveBeenCalled();
    expect(toastErrorSpy).not.toHaveBeenCalled();
    // Estado de carregamento honesto (skeleton), não expulsão da rota.
    expect(container.querySelectorAll(".animate-pulse").length).toBeGreaterThan(0);
    expect(container.querySelector("[data-testid='metric-cards']")).toBeNull();
  });

  it("workspace resolve com isAdmin true: o painel permanece (sem redirect)", () => {
    stubRouteHooks();
    const Component = painelComponent();
    const { rerender, container } = render(<Component />);

    expect(navigateSpy).not.toHaveBeenCalled();

    workspaceState.workspaceStatus = "workspace";
    rerender(<Component />);

    expect(navigateSpy).not.toHaveBeenCalled();
    expect(toastErrorSpy).not.toHaveBeenCalled();
    expect(container.querySelector("[data-testid='metric-cards']")).not.toBeNull();
    expect(container.querySelectorAll(".animate-pulse").length).toBe(0);
  });

  it("não-admin com workspace resolvido continua sendo redirecionado", () => {
    workspaceState.workspaceStatus = "workspace";
    rbacState.isAdmin = false;

    renderPainel();

    expect(toastErrorSpy).toHaveBeenCalledWith("Acesso restrito a administradores");
    expect(navigateSpy).toHaveBeenCalledWith({ to: "/inicio" });
    // Nenhuma consulta de dados habilitada para quem não administra o workspace.
    expect(vi.mocked(useUnitCompliance).mock.calls[0][0].enabled).toBe(false);
  });
});
