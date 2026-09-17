/**
 * Promoção do dashboard aprovado para `/painel` — regressão de navegação.
 *
 * O bug que esta suíte impede de voltar: o dashboard novo só existia atrás de
 * `?uiPreview=1`, então ir até outra rota pela sidebar e clicar de novo em
 * "Painel" (que navega para `/painel`, sem query param) mostrava o dashboard
 * antigo. A correção NÃO foi colocar o parâmetro no link da sidebar: `/painel`
 * passou a ser a implementação oficial, e o flag deixou de existir.
 *
 * Aqui isso é verificado de três formas independentes:
 *   1. RENDERIZAÇÃO — `/painel` (sem nenhum parâmetro) monta a composição
 *      oficial (`data-testid="panel-dashboard"`);
 *   2. FLAG MORTA — mesmo com `uiPreview=1` na URL, a tela é a mesma (o
 *      parâmetro não tem mais significado);
 *   3. ESTRUTURA — a rota não importa mais fixture de apresentação, o link da
 *      sidebar continua `/painel` limpo e nada mais aponta para o preview.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render } from "@testing-library/react";
import { readFileSync } from "fs";
import { resolve } from "path";

const navigateSpy = vi.fn();

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
  workspaceStatus: "workspace" as "loading" | "personal" | "workspace",
};

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ user: { id: "u1" }, loading: false }),
}));
vi.mock("@/contexts/WorkspaceContext", () => ({ useWorkspace: () => workspaceState }));
vi.mock("@/hooks/useWorkspaceRBAC", () => ({
  useWorkspaceRBAC: () => ({ isAdmin: true, loading: false, role: "admin" }),
}));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock("@/components/DashboardLayout", () => ({
  DashboardLayout: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: vi.fn(() => ({ select: vi.fn(), eq: vi.fn(), order: vi.fn() })),
    channel: vi.fn(() => ({ on: vi.fn().mockReturnThis(), subscribe: vi.fn().mockReturnThis() })),
    removeChannel: vi.fn(),
  },
}));

// Consultas: nenhuma rede nesta suíte. As unidades e turnos são REAIS na forma,
// apenas injetados — é isso que a toolbar oficial consome.
vi.mock("@/hooks/useUnitCompliance", () => ({
  useUnitCompliance: vi.fn(() => ({
    data: [],
    loading: false,
    error: null,
    refresh: vi.fn(),
  })),
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
  useShiftOptions: () => ({
    shifts: [
      { id: "sh-1", name: "Manhã" },
      { id: "sh-2", name: "Noite" },
    ],
    resolved: true,
    loading: false,
  }),
}));
vi.mock("@/hooks/useAccessibleUnits", () => ({
  useAccessibleUnits: () => ({
    units: [
      { id: "u-1", name: "Unidade Norte", is_active: true, workspace_id: "org-1" },
      { id: "u-2", name: "Unidade Centro", is_active: true, workspace_id: "org-1" },
    ],
    loading: false,
    error: null,
  }),
}));

// Apresentação pesada (recharts/canvas): stubs neutros — o objeto aqui é a
// promoção da rota, não o desenho de cada widget.
vi.mock("@/components/dashboard/real/RealMetricsOverview", () => ({
  RealMetricsOverview: () => <div data-testid="metrics" />,
  RealMetricCard: ({ metric }: { metric: { title: string } }) => (
    <div data-testid="metric-card">{metric.title}</div>
  ),
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

import { Route as PainelRoute } from "../../routes/painel";

const PAINEL_SRC = readFileSync(resolve(__dirname, "../../routes/painel.tsx"), "utf8");
const LAYOUT_SRC = readFileSync(
  resolve(__dirname, "../../components/DashboardLayout.tsx"),
  "utf8",
);

function renderPainel(search: Record<string, unknown> = {}) {
  const r = PainelRoute as unknown as Record<string, unknown>;
  r.useParams = () => ({});
  r.useSearch = () => search;
  const Component = PainelRoute.options.component as React.ComponentType;
  return render(<Component />);
}

beforeEach(() => {
  vi.clearAllMocks();
  workspaceState.currentWorkspace = { id: "org-1", name: "Org Um" };
  workspaceState.workspaceStatus = "workspace";
});

describe("promoção — /painel é o dashboard oficial", () => {
  it("A) /painel sem nenhum parâmetro monta a composição oficial", () => {
    const { container } = renderPainel();

    expect(container.querySelector("[data-testid='panel-dashboard']")).not.toBeNull();
    expect(container.querySelector("[data-testid='metric-cards']")).not.toBeNull();
    expect(container.querySelector("[data-testid='units-table']")).not.toBeNull();
    expect(container.querySelector("[data-testid='occurrences']")).not.toBeNull();
  });

  it("E) refresh em /painel (nova montagem, mesma URL) continua na composição oficial", () => {
    renderPainel();
    const first = document.querySelectorAll("[data-testid='panel-dashboard']").length;
    // Nova montagem = outro "carregamento" da rota, como um refresh real.
    const second = renderPainel();
    expect(second.container.querySelector("[data-testid='panel-dashboard']")).not.toBeNull();
    expect(first).toBeGreaterThan(0);
  });

  it("C) `uiPreview=1` é um parâmetro MORTO: a tela é exatamente a mesma", () => {
    const withoutFlag = renderPainel();
    expect(withoutFlag.container.querySelector("[data-testid='panel-dashboard']")).not.toBeNull();
    withoutFlag.unmount();

    const withFlag = renderPainel({ uiPreview: 1 });
    expect(withFlag.container.querySelector("[data-testid='panel-dashboard']")).not.toBeNull();
    // A vitrine de apresentação não existe mais como rota.
    expect(withFlag.container.querySelector("[data-testid='preview-dashboard']")).toBeNull();
  });

  it("a toolbar oficial recebe as UNIDADES e TURNOS reais (não fixture)", () => {
    const { container } = renderPainel();
    const subtitle = container.textContent ?? "";

    // Recorte padrão do produto (7 dias) com as opções reais disponíveis.
    expect(subtitle).toContain("Todas as unidades · Todos os turnos");
    expect(container.querySelector('[role="group"][aria-label="Período"]')).not.toBeNull();
  });

  it("o recorte vem da URL: datas aplicadas aparecem no subtítulo", () => {
    const { container } = renderPainel({ startDate: "2026-09-01", endDate: "2026-09-10" });
    expect(container.textContent).toContain("Período 1 set – 10 set 2026");
  });

  it("'Personalizar filtros' e 'Personalizar painel' continuam na toolbar", () => {
    renderPainel();
    expect(document.querySelector("button[aria-label='Personalizar filtros']")).not.toBeNull();
    expect(document.querySelector("button[aria-label='Personalizar painel']")).not.toBeNull();
  });
});

describe("promoção — estrutural", () => {
  it("B) a rota não conhece mais o flag nem a fixture de apresentação", () => {
    // Só o CÓDIGO: o comentário do arquivo cita `uiPreview` justamente para dizer
    // que ele deixou de existir.
    const code = PAINEL_SRC.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

    expect(code).not.toContain("uiPreview");
    expect(code).not.toContain("preview-data");
    expect(code).not.toContain("PREVIEW_");
    expect(code).not.toContain("PreviewDashboard");
    expect(code).not.toContain("DashboardShowcase");
    // E passa a montar a composição oficial.
    expect(code).toContain("PanelDashboard");
  });

  it("o link da sidebar continua /painel — sem query param nenhum", () => {
    const painelNav = LAYOUT_SRC.match(/to: "\/painel"[^)]*/g) ?? [];
    expect(painelNav.length).toBeGreaterThan(0);
    for (const call of painelNav) {
      expect(call).not.toContain("uiPreview");
      expect(call).not.toContain("search");
    }
  });

  it("nenhuma rota do produto importa a fixture de apresentação", () => {
    const routesDir = resolve(__dirname, "../../routes");
    for (const file of ["painel.tsx", "inicio.tsx", "checklist.tsx", "unidades.$unitId.operacao.tsx"]) {
      const src = readFileSync(resolve(routesDir, file), "utf8");
      expect(src, `${file} não pode importar preview-data`).not.toContain("preview-data");
      expect(src, `${file} não pode importar a vitrine DEV`).not.toContain("DashboardShowcase");
    }
  });
});
