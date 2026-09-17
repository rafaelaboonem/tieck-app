/**
 * Execution 6B.2D — interface: seção de rotinas no /painel e aba Rotinas no
 * detalhe da unidade.
 *
 * Provas centrais:
 *   §18 — 3 tarefas programadas + 2 rotinas NÃO pode virar "Tarefas
 *         programadas = 5": os dois domínios têm contadores, fontes e seções
 *         distintos, e nenhum número de rotina aparece nos cards de tarefa.
 *   §19 — /painel → unidade → aba Rotinas mostra as occurrences corretas, com
 *         período respeitado, turno aplicável, histórico concluído preservado e
 *         os quatro estados de status.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// jsdom não implementa as APIs de ponteiro que o Radix Select usa. Sem isso o
// dropdown nem abre, e o teste de filtro não poderia ser comportamental.
Element.prototype.hasPointerCapture = () => false;
Element.prototype.setPointerCapture = () => {};
Element.prototype.releasePointerCapture = () => {};
Element.prototype.scrollIntoView = () => {};
if (!("ResizeObserver" in globalThis)) {
  (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}

const ORG = "11111111-1111-4111-8111-111111111111";
const ORG_B = "22222222-2222-4222-8222-222222222222";
const UNIT_A = "aaaaaaaa-1111-4111-8111-111111111111";
const UNIT_B = "bbbbbbbb-2222-4222-8222-222222222222";
const DAY = "2026-09-13";

type Row = Record<string, unknown>;

const h = vi.hoisted(() => ({
  navigate: vi.fn(),
  rpc: vi.fn(),
  workspace: {
    currentWorkspace: { id: "11111111-1111-4111-8111-111111111111", name: "Org A" } as {
      id: string;
      name: string;
    } | null,
    workspaceStatus: "workspace" as "loading" | "personal" | "workspace",
  },
}));

const db: Record<string, Row[]> = {};

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (table: string) => builder(table),
    rpc: (...args: unknown[]) => h.rpc(...args),
    channel: () => ({ on: () => ({ on: () => ({ on: () => ({ subscribe: () => ({}) }) }) }) }),
    removeChannel: vi.fn(),
  },
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ user: { id: "u1" }, loading: false }),
}));
vi.mock("@/contexts/WorkspaceContext", () => ({ useWorkspace: () => h.workspace }));
vi.mock("@/contexts/SidebarContext", () => ({ useSidebar: () => ({ sidebarOpen: true }) }));
vi.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => false }));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock("@/hooks/useWorkspaceRBAC", () => ({
  useWorkspaceRBAC: () => ({ isAdmin: true, loading: false, role: "admin", hasAccess: true }),
}));
vi.mock("@tanstack/react-router", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-router")>();
  return {
    ...actual,
    useNavigate: () => h.navigate,
    Link: ({ children }: { children?: React.ReactNode }) => <a>{children}</a>,
  };
});
vi.mock("@/components/DashboardLayout", () => ({
  DashboardLayout: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock("@/components/dashboard/OperationalDashboardFilters", () => ({
  OperationalDashboardFilters: () => <div data-testid="filters" />,
  sanitizeFilters: (v: Record<string, unknown>) => v,
}));
// Graph em canvas (recharts) não renderiza em jsdom; o foco desta suíte é a
// SEPARAÇÃO entre métricas de tarefa e de rotina, não o gráfico.
vi.mock("@/components/dashboard/UnitComplianceChart", () => ({
  UnitComplianceChart: () => <div data-testid="chart" />,
}));

const recorded: { table: string; filters: Record<string, unknown> }[] = [];

function matches(row: Row, key: string, value: unknown): boolean {
  const sep = key.indexOf(":");
  const op = sep === -1 ? "eq" : key.slice(0, sep);
  const col = sep === -1 ? key : key.slice(sep + 1);
  const v = row[col];
  if (op === "eq") return v === value;
  if (op === "gte") return String(v) >= String(value);
  if (op === "lte") return String(v) <= String(value);
  return true;
}

function builder(table: string) {
  const filters: Record<string, unknown> = {};
  const b: Record<string, unknown> = {};
  const chain = () => b;
  Object.assign(b, {
    select: chain,
    order: chain,
    limit: chain,
    in: (col: string, value: unknown[]) => ((filters[`in:${col}`] = value), b),
    eq: (col: string, value: unknown) => ((filters[col] = value), b),
    gte: (col: string, value: unknown) => ((filters[`gte:${col}`] = value), b),
    lte: (col: string, value: unknown) => ((filters[`lte:${col}`] = value), b),
  });

  const rows = () => {
    recorded.push({ table, filters: { ...filters } });
    return (db[table] ?? []).filter((row) =>
      Object.entries(filters).every(([key, value]) => matches(row, key, value)),
    );
  };

  Object.assign(b, {
    maybeSingle: () => Promise.resolve({ data: rows()[0] ?? null, error: null }),
    then: (onF: (v: unknown) => unknown, onR: (e: unknown) => unknown) =>
      Promise.resolve({ data: rows(), error: null }).then(onF, onR),
  });
  return b;
}

beforeEach(() => {
  for (const key of Object.keys(db)) delete db[key];
  recorded.length = 0;
  h.navigate.mockReset();
  h.rpc.mockReset();
  h.workspace.currentWorkspace = { id: ORG, name: "Org A" };
  h.workspace.workspaceStatus = "workspace";
});

/**
 * Lê o valor diretamente associado ao label da métrica, sem depender de
 * classes Tailwind ou de a métrica estar dentro de um card.
 */
function metricValue(label: string, scope: HTMLElement = document.body): string {
  for (const el of within(scope).getAllByText(label, { exact: true })) {
    const container = el.parentElement;
    if (!container) continue;
    const value = Array.from(container.children)
      .map((child) => child.textContent?.trim() ?? "")
      .find((text) => /^\d+(?:\.\d+)?%?$/.test(text));
    if (value) return value;
  }
  throw new Error(`métrica não encontrada: ${label}`);
}

async function expectMetricValue(
  label: string,
  expected: string,
  scope: HTMLElement = document.body,
) {
  await waitFor(() => expect(metricValue(label, scope)).toBe(expected));
}

/**
 * Célula da tabela REAL por unidade: encontra a coluna pelo título do header e
 * lê o valor da linha da unidade. Sem depender de classes Tailwind nem de
 * estrutura interna — a hierarquia mudou (cards → widgets + tabela), a
 * SEMÂNTICA (números de task_executions por unidade) é a mesma.
 */
function unitCell(unitName: string, columnLabel: string): string {
  const table = Array.from(document.querySelectorAll("table")).find((candidate) =>
    Array.from(candidate.querySelectorAll("thead th")).some(
      (th) => (th.textContent ?? "").trim() === columnLabel,
    ),
  );
  if (!table) throw new Error(`tabela com a coluna não encontrada: ${columnLabel}`);
  const headers = Array.from(table.querySelectorAll("thead th")).map((th) =>
    (th.textContent ?? "").trim(),
  );
  const index = headers.indexOf(columnLabel);
  const row = Array.from(table.querySelectorAll("tbody tr")).find((tr) =>
    (tr.textContent ?? "").includes(unitName),
  );
  if (!row) throw new Error(`linha não encontrada: ${unitName}`);
  return ((row.children[index] as HTMLElement | undefined)?.textContent ?? "").trim();
}

/** Linha da view de conformidade de TAREFAS. */
function taskRow(over: Row = {}) {
  return {
    organization_id: ORG,
    unit_id: UNIT_A,
    unit_name: "Unidade A",
    reference_date: DAY,
    total_scheduled_tasks: 3,
    completed_tasks: 1,
    completed_on_time: 1,
    completed_late: 0,
    overdue_open_tasks: 1,
    delayed_tasks: 1,
    critical_failures: 0,
    pending_evidences: 0,
    weight_total: 3,
    weight_done: 1,
    compliance_percentage: 33.3,
    total_due_tasks: 2,
    due_completed_tasks: 1,
    due_weight_total: 2,
    due_weight_done: 1,
    due_compliance_percentage: 50,
    ...over,
  };
}

/** Linha da view de ROTINAS: 2 previstas, 1 concluída no prazo, 1 em atraso. */
function routineRow(over: Row = {}) {
  return {
    organization_id: ORG,
    unit_id: UNIT_A,
    unit_name: "Unidade A",
    reference_date: DAY,
    total_occurrences: 2,
    completed_occurrences: 1,
    completed_on_time: 1,
    completed_late: 0,
    overdue_open_occurrences: 1,
    pending_open_occurrences: 0,
    due_occurrences: 2,
    ...over,
  };
}

/** Occurrence crua devolvida pela RPC de detalhe. */
function occurrenceRow(over: Row = {}) {
  return {
    occurrence_id: "11111111-1111-4111-8111-111111111111",
    schedule_id: "22222222-2222-4222-8222-222222222222",
    checklist_id: "33333333-3333-4333-8333-333333333333",
    checklist_title: "Abertura de loja",
    occurrence_date: DAY,
    due_at: `${DAY}T23:00:00Z`,
    started_at: null,
    completed_at: null,
    response_id: null,
    unit_id: UNIT_A,
    shift_id: null,
    shift_name: null,
    workspace_member_id: "44444444-4444-4444-8444-444444444444",
    responsible_name: "Ana",
    ...over,
  };
}

async function renderPainel() {
  const { Route } = await import("../../routes/painel");
  const r = Route as unknown as Record<string, unknown>;
  r.useSearch = () => ({ startDate: DAY, endDate: DAY });
  const Component = Route.options.component as React.ComponentType;
  return render(<Component />);
}

async function renderDetail(unitId = UNIT_A) {
  const { Route } = await import("../../routes/unidades.$unitId.operacao");
  const r = Route as unknown as Record<string, unknown>;
  r.useParams = () => ({ unitId });
  r.useSearch = () => ({ startDate: DAY, endDate: DAY });
  const Component = Route.options.component as React.ComponentType;
  return render(<Component />);
}

describe("6B.2D /painel — §18 separação entre tarefas e rotinas", () => {
  beforeEach(() => {
    db.analytics_unit_daily_compliance = [taskRow()];
    db.analytics_unit_daily_occurrences = [routineRow()];
    db.units = [
      { id: UNIT_A, name: "Unidade A", timezone: "America/Sao_Paulo", workspace_id: ORG },
    ];
  });

  it("consulta as duas views separadamente, cada uma com o escopo explícito", { timeout: 30000 }, async () => {
    await renderPainel();

    await waitFor(() => expect(screen.getByTestId("scheduled-occurrences-section")).toBeTruthy());

    const taskQuery = recorded.find((r) => r.table === "analytics_unit_daily_compliance");
    const routineQuery = recorded.find((r) => r.table === "analytics_unit_daily_occurrences");
    expect(taskQuery?.filters.organization_id).toBe(ORG);
    expect(routineQuery?.filters.organization_id).toBe(ORG);
    expect(routineQuery?.filters["gte:reference_date"]).toBe(DAY);
  });

  it("3 tarefas + 2 rotinas NÃO produz Tarefas programadas = 5", { timeout: 30000 }, async () => {
    await renderPainel();
    await waitFor(() => expect(screen.getByTestId("scheduled-occurrences-section")).toBeTruthy());

    const section = screen.getByTestId("scheduled-occurrences-section");

    // Métricas de tarefa: exatamente os números de task_executions, agora na
    // tabela real por unidade (mesmo dado, nova composição).
    await waitFor(() => expect(unitCell("Unidade A", "Programadas")).toBe("3"));
    expect(unitCell("Unidade A", "Vencidas")).toBe("2");
    expect(unitCell("Unidade A", "Abertas em atraso")).toBe("1");
    // A prova do §18: 3 tarefas + 2 rotinas NUNCA viram 5 no domínio de tarefas.
    expect(unitCell("Unidade A", "Programadas")).not.toBe("5");

    // KPIs de rotina: exatamente os números das occurrences.
    await expectMetricValue("Previstas", "2", section);
    await expectMetricValue("Concluídas", "1", section);
    await expectMetricValue("Abertas em atraso", "1", section);
    await expectMetricValue("Deveriam ter ocorrido", "2", section);
  });

  it("quando as exceções são zero, mostra o estado positivo compacto", { timeout: 30000 }, async () => {
    db.analytics_unit_daily_compliance = [
      taskRow({
        completed_tasks: 3,
        completed_on_time: 3,
        completed_late: 0,
        overdue_open_tasks: 0,
        critical_failures: 0,
        pending_evidences: 0,
        weight_total: 3,
        weight_done: 3,
        compliance_percentage: 100,
        due_weight_total: 3,
        due_weight_done: 3,
        due_compliance_percentage: 100,
      }),
    ];
    await renderPainel();
    await waitFor(() => expect(screen.getByTestId("scheduled-occurrences-section")).toBeTruthy());

    expect(screen.getByRole("status")).toHaveTextContent("Nenhuma pendência crítica no período");
    expect(screen.getByText(/Sem falhas críticas, atrasos abertos ou evidências aguardando/)).toBeTruthy();
  });

  it("rotinas aparecem SOMENTE na seção própria", { timeout: 30000 }, async () => {
    await renderPainel();
    await waitFor(() => expect(screen.getByTestId("scheduled-occurrences-section")).toBeTruthy());

    // O título da seção é único e explícito sobre a separação.
    expect(screen.getAllByText("Rotinas agendadas")).toHaveLength(1);
    expect(screen.getByText(/Contadas à parte das tarefas programadas/)).toBeTruthy();
  });

  it("a tabela por unidade mostra as rotinas e navega para o detalhe no período", { timeout: 30000 }, async () => {
    await renderPainel();
    await waitFor(() => expect(screen.getByTestId("scheduled-occurrences-section")).toBeTruthy());

    const row = screen.getByTestId(`occurrence-unit-row-${UNIT_A}`);
    expect(within(row).getByText("Unidade A")).toBeTruthy();

    await userEvent.click(row);
    expect(h.navigate).toHaveBeenCalledWith({
      to: "/unidades/$unitId/operacao",
      params: { unitId: UNIT_A },
      search: { startDate: DAY, endDate: DAY },
    });
  });

  it("sem rotinas no período mostra estado vazio honesto (não um erro)", { timeout: 30000 }, async () => {
    db.analytics_unit_daily_occurrences = [];
    await renderPainel();
    await waitFor(() => expect(screen.getByTestId("scheduled-occurrences-section")).toBeTruthy());

    expect(screen.getByText("Sem rotinas agendadas no período")).toBeTruthy();
    await expectMetricValue("Previstas", "0", screen.getByTestId("scheduled-occurrences-section"));
  });
});

describe("6B.2D detalhe da unidade — §19 aba Rotinas", () => {
  beforeEach(() => {
    db.units = [
      { id: UNIT_A, name: "Unidade A", timezone: "America/Sao_Paulo", workspace_id: ORG },
    ];
    db.analytics_unit_daily_compliance = [taskRow()];
    db.task_executions = [];
    db.evidences = [];
    db.profiles = [];
    h.rpc.mockResolvedValue({
      data: [
        // Concluída no prazo (ficou no histórico do período).
        occurrenceRow({
          occurrence_id: "11111111-1111-4111-8111-111111111111",
          checklist_title: "Rotina concluída",
          due_at: `${DAY}T10:00:00Z`,
          completed_at: `${DAY}T09:30:00Z`,
        }),
        // Aberta em atraso.
        occurrenceRow({
          occurrence_id: "22222222-2222-4222-8222-222222222222",
          checklist_title: "Rotina atrasada",
          due_at: `${DAY}T08:00:00Z`,
        }),
        // Concluída com atraso, no turno da noite.
        occurrenceRow({
          occurrence_id: "33333333-3333-4333-8333-333333333333",
          checklist_title: "Rotina atrasada concluída",
          due_at: `${DAY}T12:00:00Z`,
          started_at: `${DAY}T13:00:00Z`,
          completed_at: `${DAY}T14:00:00Z`,
          shift_id: "55555555-5555-4555-8555-555555555555",
          shift_name: "Noite",
        }),
      ],
      error: null,
    });
  });

  it("consulta a RPC com workspace, unidade e período correntes", { timeout: 30000 }, async () => {
    await renderDetail();
    await waitFor(() => expect(h.rpc).toHaveBeenCalled());
    expect(h.rpc).toHaveBeenCalledWith("list_workspace_execution_occurrences", {
      p_workspace_id: ORG,
      p_unit_id: UNIT_A,
      p_start_date: DAY,
      p_end_date: DAY,
    });
  });

  it("lista as occurrences com o status correto em cada uma das quatro categorias", { timeout: 30000 }, async () => {
    await renderDetail();
    await waitFor(() => expect(h.rpc).toHaveBeenCalled());

    await userEvent.click(screen.getByRole("tab", { name: /Rotinas/ }));

    const list = await screen.findByTestId("occurrence-list");
    expect(within(list).getByText("Rotina concluída")).toBeTruthy();
    expect(within(list).getByText("Rotina atrasada")).toBeTruthy();

    expect(
      screen
        .getByTestId("occurrence-item-11111111-1111-4111-8111-111111111111")
        .getAttribute("data-occurrence-status"),
    ).toBe("concluida_no_prazo");
    expect(
      screen
        .getByTestId("occurrence-item-22222222-2222-4222-8222-222222222222")
        .getAttribute("data-occurrence-status"),
    ).toBe("atrasada");
    expect(
      screen
        .getByTestId("occurrence-item-33333333-3333-4333-8333-333333333333")
        .getAttribute("data-occurrence-status"),
    ).toBe("concluida_com_atraso");
  });

  it("concluída dentro do período NÃO desaparece do histórico", { timeout: 30000 }, async () => {
    await renderDetail();
    await waitFor(() => expect(h.rpc).toHaveBeenCalled());
    await userEvent.click(screen.getByRole("tab", { name: /Rotinas/ }));

    const list = await screen.findByTestId("occurrence-list");
    expect(within(list).getByText("Rotina concluída")).toBeTruthy();
    expect(within(list).getAllByText(/Concluída no prazo/).length).toBeGreaterThan(0);
  });

  it("o filtro de status da rotina é próprio e não usa os filtros de tarefa", { timeout: 30000 }, async () => {
    await renderDetail();
    await waitFor(() => expect(h.rpc).toHaveBeenCalled());
    await userEvent.click(screen.getByRole("tab", { name: /Rotinas/ }));
    await screen.findByTestId("occurrence-list");

    // Os filtros de tarefa (criticidade/evidência/canceladas) não existem dentro
    // da aba Rotinas: ela tem o seu próprio seletor de status.
    expect(screen.getByText("Status da rotina")).toBeTruthy();

    const select = screen.getByText("Status da rotina").closest("div")!.querySelector("button")!;
    await userEvent.click(select);
    await userEvent.click(await screen.findByRole("option", { name: "Atrasada" }));

    await waitFor(() => {
      expect(
        screen.queryByTestId("occurrence-item-11111111-1111-4111-8111-111111111111"),
      ).toBeNull();
    });
    expect(screen.getByTestId("occurrence-item-22222222-2222-4222-8222-222222222222")).toBeTruthy();
  });

  it("o turno selecionado filtra as rotinas", { timeout: 30000 }, async () => {
    await renderDetail();
    await waitFor(() => expect(h.rpc).toHaveBeenCalled());
    await userEvent.click(screen.getByRole("tab", { name: /Rotinas/ }));
    await screen.findByTestId("occurrence-list");

    // O turno "Noite" só aparece nas rotinas (nenhuma tarefa no período).
    const shiftSelect = screen.getByText("Turno").closest("div")!.querySelector("button")!;
    await userEvent.click(shiftSelect);
    await userEvent.click(await screen.findByRole("option", { name: "Noite" }));

    await waitFor(() => {
      expect(
        screen.getByTestId("occurrence-item-33333333-3333-4333-8333-333333333333"),
      ).toBeTruthy();
    });
    expect(screen.queryByTestId("occurrence-item-22222222-2222-4222-8222-222222222222")).toBeNull();
  });

  it("erro da RPC é explícito e não vira 'sem rotinas'", { timeout: 30000 }, async () => {
    h.rpc.mockResolvedValue({ data: null, error: { message: "permission denied for function" } });
    await renderDetail();
    await waitFor(() => expect(h.rpc).toHaveBeenCalled());
    await userEvent.click(screen.getByRole("tab", { name: /Rotinas/ }));

    expect(await screen.findByText("Falha ao carregar as rotinas da unidade.")).toBeTruthy();
    expect(screen.queryByText(/permission denied/)).toBeNull();
  });

  it("unidade de outro workspace não recebe occurrence (denied honesto)", { timeout: 30000 }, async () => {
    h.workspace.currentWorkspace = { id: ORG_B, name: "Org B" };
    await renderDetail();
    await waitFor(() =>
      expect(screen.getByText("Unidade não encontrada ou sem permissão de acesso")).toBeTruthy(),
    );
    expect(h.rpc).not.toHaveBeenCalled();
  });

  it("unidade sem ocorrência mostra o vazio honesto da aba", { timeout: 30000 }, async () => {
    h.rpc.mockResolvedValue({ data: [], error: null });
    await renderDetail();
    await waitFor(() => expect(h.rpc).toHaveBeenCalled());
    await userEvent.click(screen.getByRole("tab", { name: /Rotinas/ }));

    expect(await screen.findByTestId("occurrences-empty")).toBeTruthy();
  });
});
