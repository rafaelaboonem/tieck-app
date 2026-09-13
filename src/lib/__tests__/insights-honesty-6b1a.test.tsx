/**
 * Execution 6B.1A — /insights honesty: zero fictional data, honest empty/error
 * states, category filters working on real insights only.
 *
 * Verified in two layers:
 *  1. structural — the route source contains no demo content and queries no
 *     nonexistent view;
 *  2. behavioral — the component renders only hook-provided insights, never
 *     fabricated content.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

vi.mock("@/components/DashboardLayout", () => ({
  DashboardLayout: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ user: { id: "u1" }, loading: false }),
}));

vi.mock("@/contexts/WorkspaceContext", () => ({
  useWorkspace: () => ({
    currentWorkspace: { id: "org-1", name: "Org Um" },
    workspaceStatus: "workspace",
  }),
}));

vi.mock("@/contexts/SidebarContext", () => ({
  useSidebar: () => ({ sidebarOpen: true }),
}));

vi.mock("@/lib/useInsights", () => ({
  useInsights: vi.fn(),
}));

import { Route } from "../../routes/insights";
import { useInsights } from "@/lib/useInsights";

const ROUTE_SRC = readFileSync(resolve(__dirname, "../../routes/insights.tsx"), "utf8");

const mockUseInsights = vi.mocked(useInsights);

function mockHookState(overrides: Partial<ReturnType<typeof useInsights>> = {}) {
  mockUseInsights.mockReturnValue({
    insights: [],
    loading: false,
    isEmpty: true,
    error: false,
    refresh: vi.fn(),
    ...overrides,
  });
}

function InsightsPage() {
  const Component = Route.options.component as React.ComponentType;
  return <Component />;
}

const realInsight = {
  id: "recorrencia-tarefa",
  title: "“Tarefa A” atrasou 2x",
  detail: "Esta tarefa acumula 2 atrasos recentes.",
  category: "recorrencia" as const,
  severity: "critico" as const,
  metric: "2x",
  source: "analytics_overdue_tasks",
};

describe("6B.1A — /insights honesty (structural)", () => {
  it("contains zero references to DEMO_INSIGHTS", () => {
    expect(ROUTE_SRC).not.toContain("DEMO_INSIGHTS");
    expect(ROUTE_SRC.toLowerCase()).not.toContain("demonstra");
  });

  it("contains no fictional content (units, tasks, metrics)", () => {
    expect(ROUTE_SRC).not.toContain("Shopping");
    expect(ROUTE_SRC).not.toContain("freezer");
    expect(ROUTE_SRC).not.toContain("Fechamento tem 23% mais atrasos");
    expect(ROUTE_SRC).not.toContain("Centro melhorou conformidade");
    expect(ROUTE_SRC).not.toContain("68% das fotos rejeitadas");
    expect(ROUTE_SRC).not.toContain("Sexta 18h–21h");
    expect(ROUTE_SRC).not.toContain("3 unidades não realizaram");
  });

  it("no longer uses the isEmpty demo fallback pattern", () => {
    expect(ROUTE_SRC).not.toMatch(/isEmpty\s*\?\s*\w+\s*:/);
  });

  it("no query targets the nonexistent demo views from the preflight audit", () => {
    for (const view of [
      "analytics_recurring_failures",
      "analytics_shift_compliance",
      "analytics_evidence_approval",
    ]) {
      expect(ROUTE_SRC).not.toContain(view);
    }
  });

  it("reuses the exported Insight contract from useInsights instead of a local duplicate", () => {
    expect(ROUTE_SRC).toMatch(/import\s*\{[^}]*type\s+Insight\b[^}]*\}\s*from\s*"@\/lib\/useInsights"/);
    expect(ROUTE_SRC).not.toMatch(/interface\s+Insight\s*\{/);
  });

  it("renders real insights exclusively from the hook, scoped to the workspace", () => {
    expect(ROUTE_SRC).toMatch(
      /const\s*\{\s*insights,\s*loading,\s*error,\s*refresh\s*\}\s*=\s*useInsights\(\{/,    );
    // O escopo vem do WorkspaceContext e é passado como organizationId.
    expect(ROUTE_SRC).toContain("organizationId: currentWorkspace?.id");
    expect(ROUTE_SRC).toContain("useWorkspace()");
  });
});

describe("6B.1A — /insights honesty (behavioral)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("loading state shows skeletons, not the empty state or error", () => {
    mockHookState({ loading: true });
    render(<InsightsPage />);
    expect(screen.queryByText(/Nenhum insight/i)).toBeNull();
    expect(screen.queryByText(/Não foi possível carregar os insights/i)).toBeNull();
    expect(document.querySelectorAll(".animate-pulse").length).toBeGreaterThan(0);
  });

  it("real data renders hook-provided insights with category filtering", () => {
    mockHookState({
      insights: [realInsight],
      loading: false,
      isEmpty: false,
    });
    render(<InsightsPage />);

    expect(screen.getByText("“Tarefa A” atrasou 2x")).toBeTruthy();
    expect(screen.queryByText(/Nenhum insight no momento/i)).toBeNull();
    expect(screen.queryByText(/demonstração/i)).toBeNull();

    fireEvent.click(screen.getByText("Evidências"));
    expect(screen.getByText(/Nenhum insight nessa categoria/i)).toBeTruthy();

    fireEvent.click(screen.getByText("Reincidência"));
    expect(screen.getByText("“Tarefa A” atrasou 2x")).toBeTruthy();
  });

  it("real-empty state: professional empty message, zero counters, no demo badge", () => {
    mockHookState({ insights: [], loading: false, isEmpty: true, error: false });
    render(<InsightsPage />);

    expect(screen.getByText("Nenhum insight no momento")).toBeTruthy();
    expect(screen.getByText(/Nenhum padrão operacional foi detectado no momento/i)).toBeTruthy();
    expect(screen.queryByText(/demonstração/i)).toBeNull();
    // Todos os MiniStats (total, críticos, atenção, melhorias) permanecem em zero.
    const zeros = screen.getAllByText("0");
    expect(zeros.length).toBeGreaterThanOrEqual(4);
  });

  it("error state: generic message + retry button calling refresh, no technical detail", () => {
    const refresh = vi.fn();
    mockHookState({ insights: [], loading: false, isEmpty: false, error: true, refresh });
    render(<InsightsPage />);

    expect(screen.getByText(/Não foi possível carregar os insights\. Tente novamente\./i)).toBeTruthy();
    // Nenhum detalhe técnico do erro no corpo da mensagem de erro (o rodapé
    // educacional lista as fontes e é legítimo).
    const errorCard = screen.getByText(/Não foi possível carregar os insights/i).closest("div")
      ?.parentElement?.parentElement;
    expect(errorCard?.textContent).not.toMatch(/relation|permission denied|postgres|PGRST|schema/i);

    fireEvent.click(screen.getByText("Tentar novamente"));
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("failed refresh keeps the error state visible for retry again", async () => {
    const refresh = vi.fn().mockRejectedValueOnce(new Error("network down"));
    mockHookState({ insights: [], loading: false, isEmpty: false, error: true, refresh });
    render(<InsightsPage />);

    fireEvent.click(screen.getByText("Tentar novamente"));
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
    expect(screen.getByText(/Não foi possível carregar os insights/i)).toBeTruthy();
    expect(screen.queryByText(/network down/i)).toBeNull();
  });
});
