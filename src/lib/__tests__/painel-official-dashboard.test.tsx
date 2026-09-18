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
// `useUnitCompliance` alimenta DUAS seções (KPIs/tabela e Insights por turno): o
// mock expõe as duas visões da mesma resposta.
const complianceState = {
  data: [] as Array<Record<string, unknown>>,
  shiftData: [] as Array<Record<string, unknown>>,
  loading: false,
  error: null as string | null,
  refresh: vi.fn(),
};
vi.mock("@/hooks/useUnitCompliance", () => ({
  useUnitCompliance: vi.fn(() => complianceState),
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
// As unidades são REAIS na forma, injetadas aqui — e o hook registra o ESCOPO
// com que a rota o chamou (workspace + elegibilidade), que é justamente o que a
// 6B.2F tornou explícito.
const accessibleUnitsState = {
  units: [
    { id: "u-1", name: "Unidade Norte", is_active: true, workspace_id: "org-1" },
    { id: "u-2", name: "Unidade Centro", is_active: true, workspace_id: "org-1" },
  ],
  loading: false,
  error: null as string | null,
  refresh: vi.fn(),
};
vi.mock("@/hooks/useAccessibleUnits", () => ({
  useAccessibleUnits: vi.fn(() => accessibleUnitsState),
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
// O card é stub, mas expõe o que RECEBEU da rota: é assim que esta suíte prova
// que ele está ligado ao hook real (e não a `items={[]}` hardcoded).
vi.mock("@/components/dashboard/real/RealRecentExecutions", () => ({
  RealRecentExecutions: (props: { items?: unknown[]; error?: boolean; loading?: boolean }) => (
    <div
      data-testid="recent-executions"
      data-items={String(props.items?.length ?? 0)}
      data-error={String(!!props.error)}
      data-loading={String(!!props.loading)}
    />
  ),
}));

// "Últimas execuções": o estado vem de fora para que a suíte controle o que a
// rota recebe, sem rede.
const recentExecutionsState = {
  data: [] as Array<Record<string, unknown>>,
  loading: false,
  error: null as string | null,
  refresh: vi.fn(),
};
vi.mock("@/hooks/useRecentChecklistExecutions", () => ({
  useRecentChecklistExecutions: vi.fn(() => recentExecutionsState),
}));
// "Atividade dos checklists": o card é stub, mas registra o que recebeu da rota
// (série real, loading e erro) — é assim que a promoção da fonte fica amarrada.
vi.mock("@/components/dashboard/real/RealChecklistActivity", () => ({
  RealChecklistActivity: (props: { data?: unknown[]; error?: boolean; loading?: boolean }) => (
    <div
      data-testid="checklist-activity"
      data-points={String(props.data?.length ?? 0)}
      data-error={String(!!props.error)}
      data-loading={String(!!props.loading)}
    />
  ),
}));

const activityState = {
  data: [] as Array<Record<string, unknown>>,
  loading: false,
  error: null as string | null,
  refresh: vi.fn(),
};
vi.mock("@/hooks/useChecklistActivity", () => ({
  useChecklistActivity: vi.fn(() => activityState),
}));
vi.mock("@/components/dashboard/real/RealUnitDataTable", () => ({
  RealUnitDataTable: () => <div data-testid="units-table" />,
}));
// "Insights da operação": stub que registra o que a rota entregou (linhas por
// turno, meta, loading e erro) — a promoção da fonte fica amarrada por aqui.
vi.mock("@/components/dashboard/real/RealOperationalInsights", () => ({
  RealOperationalInsights: (props: {
    rows?: unknown[];
    target?: number;
    loading?: boolean;
    error?: boolean;
  }) => (
    <div
      data-testid="operational-insights"
      data-rows={String(props.rows?.length ?? 0)}
      data-target={String(props.target ?? "")}
      data-loading={String(!!props.loading)}
      data-error={String(!!props.error)}
    />
  ),
}));
vi.mock("@/components/dashboard/ScheduledOccurrencesSection", () => ({
  ScheduledOccurrencesSection: () => <div data-testid="occurrences" />,
}));

import { Route as PainelRoute } from "../../routes/painel";
import { useRecentChecklistExecutions } from "@/hooks/useRecentChecklistExecutions";
import { useChecklistActivity } from "@/hooks/useChecklistActivity";
import { useUnitCompliance } from "@/hooks/useUnitCompliance";
import { useAccessibleUnits } from "@/hooks/useAccessibleUnits";

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
  recentExecutionsState.data = [];
  recentExecutionsState.loading = false;
  recentExecutionsState.error = null;
  activityState.data = [];
  activityState.loading = false;
  activityState.error = null;
  complianceState.data = [];
  complianceState.shiftData = [];
  complianceState.loading = false;
  complianceState.error = null;
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

  it("as unidades são pedidas no ESCOPO do workspace atual (6B.2F)", () => {
    renderPainel();

    expect(useAccessibleUnits).toHaveBeenCalledWith({ workspaceId: "org-1", enabled: true });
  });

  it("sem workspace resolvido, nem unidades nem dados são pedidos", () => {
    workspaceState.currentWorkspace = null;
    renderPainel();

    expect(useAccessibleUnits).toHaveBeenCalledWith({ workspaceId: null, enabled: false });
  });

  it("o rótulo do recorte usa o NOME real da unidade selecionada", () => {
    const { container } = renderPainel({ unitId: "u-1" });

    expect(container.textContent).toContain("Unidade Norte · Todos os turnos");
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

describe("últimas execuções — dados reais ligados na rota (6B.2E)", () => {
  const item = {
    id: "occ-1",
    checklist: "Checklist de abertura",
    executor: "Juliana Prado",
    context: "Unidade Norte",
    statusLabel: "Concluída no prazo",
    statusTone: "done" as const,
    occurredAt: "hoje · 08:12",
    relative: "há 3 h",
  };

  it("o card recebe as execuções do hook — nunca `items=[]` fixo", () => {
    recentExecutionsState.data = [item];
    const { container } = renderPainel();
    const card = container.querySelector("[data-testid='recent-executions']");
    expect(card?.getAttribute("data-items")).toBe("1");
    expect(card?.getAttribute("data-error")).toBe("false");
  });

  it("a rota consulta o recorte REAL do painel (período + unidade + turno)", () => {
    renderPainel({ startDate: "2026-09-01", endDate: "2026-09-10", unitId: "u-1" });

    expect(vi.mocked(useRecentChecklistExecutions)).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: "org-1",
        startDate: "2026-09-01",
        endDate: "2026-09-10",
        unitId: "u-1",
      }),
    );
  });

  it("sem execuções no recorte, o card fica vazio — mas NÃO em erro", () => {
    const { container } = renderPainel();
    const card = container.querySelector("[data-testid='recent-executions']");
    expect(card?.getAttribute("data-items")).toBe("0");
    expect(card?.getAttribute("data-error")).toBe("false");
  });

  it("falha de leitura chega ao card como ERRO (não como vazio)", () => {
    recentExecutionsState.error = "Falha ao carregar as últimas execuções.";
    const { container } = renderPainel();
    const card = container.querySelector("[data-testid='recent-executions']");
    expect(card?.getAttribute("data-error")).toBe("true");
  });

  it("enquanto carrega, o card sabe que está carregando", () => {
    recentExecutionsState.loading = true;
    const { container } = renderPainel();
    const card = container.querySelector("[data-testid='recent-executions']");
    expect(card?.getAttribute("data-loading")).toBe("true");
  });
});

describe("atividade dos checklists — série diária real ligada na rota (6B.2H)", () => {
  const day = { date: "2026-09-17", scheduled: 12, completed: 9 };

  it("o card recebe a série do hook (nunca um array fixo)", () => {
    activityState.data = [day];
    const { container } = renderPainel();

    const card = container.querySelector("[data-testid='checklist-activity']");
    expect(card?.getAttribute("data-points")).toBe("1");
    expect(card?.getAttribute("data-error")).toBe("false");
  });

  it("a série é pedida no MESMO recorte do painel (período + unidade + turno)", () => {
    renderPainel({ startDate: "2026-09-01", endDate: "2026-09-10", unitId: "u-1", shiftId: "sh-1" });

    expect(vi.mocked(useChecklistActivity)).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: "org-1",
        startDate: "2026-09-01",
        endDate: "2026-09-10",
        unitId: "u-1",
        shiftId: "sh-1",
        enabled: true,
      }),
    );
  });

  it("sem workspace resolvido, a série também não é pedida", () => {
    workspaceState.currentWorkspace = null;
    renderPainel();

    expect(vi.mocked(useChecklistActivity)).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: null, enabled: false }),
    );
  });

  it("falha vira ERRO no card (não um gráfico vazio)", () => {
    activityState.error = "Não foi possível carregar a atividade.";
    const { container } = renderPainel();

    expect(container.querySelector("[data-testid='checklist-activity']")?.getAttribute("data-error")).toBe("true");
  });

  it("enquanto carrega, o card sabe que está carregando", () => {
    activityState.loading = true;
    const { container } = renderPainel();

    expect(container.querySelector("[data-testid='checklist-activity']")?.getAttribute("data-loading")).toBe("true");
  });
});

describe("insights da operação — por turno, da MESMA resposta (6B.2I)", () => {
  const shiftRow = {
    shiftId: "s-manha",
    shiftName: "Manhã",
    totalScheduledTasks: 20,
    completedTasks: 18,
    completedOnTime: 16,
    completedLate: 2,
    overdueOpenTasks: 0,
    criticalFailures: 0,
    pendingEvidences: 0,
    dueWeightTotal: 40,
    dueWeightDone: 37,
    dueCompliancePercentage: 92.4,
    completionPercentage: 90,
  };

  it("o card recebe as linhas por turno e a meta operacional do painel", () => {
    complianceState.shiftData = [shiftRow];
    const { container } = renderPainel();

    const card = container.querySelector("[data-testid='operational-insights']");
    expect(card?.getAttribute("data-rows")).toBe("1");
    expect(card?.getAttribute("data-target")).toBe("90");
    expect(card?.getAttribute("data-error")).toBe("false");
  });

  it("NENHUMA consulta própria: os insights saem do MESMO hook de conformidade", () => {
    renderPainel();

    // O hook é chamado uma única vez por render, e o card é alimentado por ele.
    expect(vi.mocked(useUnitCompliance).mock.calls.length).toBe(1);
    const card = document.querySelector("[data-testid='operational-insights']");
    expect(card?.getAttribute("data-rows")).toBe("0");
  });

  it("loading e erro dos insights são os MESMOS da conformidade (um só estado)", () => {
    complianceState.loading = true;
    const loadingRender = renderPainel();
    expect(
      loadingRender.container
        .querySelector("[data-testid='operational-insights']")
        ?.getAttribute("data-loading"),
    ).toBe("true");

    complianceState.loading = false;
    complianceState.error = "Falha ao carregar dados de conformidade.";
    const errorRender = renderPainel();
    expect(
      errorRender.container
        .querySelector("[data-testid='operational-insights']")
        ?.getAttribute("data-error"),
    ).toBe("true");
  });

  it("o último módulo SEM FONTE saiu do painel (nenhum estado 'em breve')", () => {
    renderPainel();

    const text = document.body.textContent ?? "";
    expect(text).not.toContain("ainda não têm fonte conectada");
    expect(text).not.toContain("A série diária de atividade ainda não tem fonte");
    expect(container_has_no_section_without_data()).toBe(true);
  });

  function container_has_no_section_without_data(): boolean {
    const src = readFileSync(resolve(__dirname, "../../components/dashboard/panel/PanelDashboard.tsx"), "utf8");
    return !src.includes("SectionWithoutData");
  }
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
