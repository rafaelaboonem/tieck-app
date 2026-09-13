/**
 * Execution 6B.2A — aceitação: card agregado × drill-down operacional.
 *
 * Este é o acceptance principal da 6B.2A. Com a MESMA organização, unidade,
 * período e timezone, o número mostrado no card precisa ser reproduzível na aba
 * correspondente do detalhe:
 *
 *   Abertas em atraso     row.overdueOpenTasks  === itens da seção "Abertas em atraso"
 *   Falhas críticas       row.criticalFailures  === itens da seção "Falhas críticas vencidas"
 *   Evidências pendentes  row.pendingEvidences  === itens de "Evidências pendentes de análise"
 *
 * A suíte usa as implementações REAIS de `useUnitCompliance`,
 * `useUnitOperationalDetails` e do componente de rota; apenas o cliente Supabase
 * é substituído por um banco de fixtures que registra os filtros aplicados.
 *
 * O card vem da view SQL. Sua definição canônica é verificada estruturalmente em
 * `dashboard-metric-alignment-migration-6b2a.test.ts`; aqui as linhas da view são
 * construídas a partir das MESMAS regras documentadas e conferidas contra
 * números fixos (3/1/2 e 2/1/2), para que a igualdade card × detalhe não seja
 * tautológica.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { unitDayRange } from "../unit-day-range";
import { deriveTaskStatus, isCriticalFailure } from "../task-execution-status";

type Row = Record<string, unknown>;

// ───────────────────────────── fixtures ─────────────────────────────────────

const ORG = "org-A";
const UNIT = "unit-1";
const DAY = "2026-09-10";

interface ExecFixture {
  id: string;
  task_id: string;
  status: "pending" | "done" | "late" | "skipped" | "cancelled";
  scheduled_at: string;
  executed_at?: string | null;
  weight: "comum" | "importante" | "critica";
  title: string;
}

const EXECUTIONS: ExecFixture[] = [
  // crítica vencida e aberta -> falha crítica + atraso + evidência pendente (2 arquivos)
  {
    id: "E1",
    task_id: "T1",
    status: "pending",
    scheduled_at: `${DAY}T12:00:00.000Z`,
    weight: "critica",
    title: "T-critica-vencida",
  },
  // concluída no prazo
  {
    id: "E2",
    task_id: "T2",
    status: "done",
    scheduled_at: `${DAY}T13:00:00.000Z`,
    executed_at: `${DAY}T12:55:00.000Z`,
    weight: "comum",
    title: "T-done",
  },
  // vencida sem criticidade -> atraso + evidência pendente
  {
    id: "E3",
    task_id: "T3",
    status: "pending",
    scheduled_at: `${DAY}T14:00:00.000Z`,
    weight: "comum",
    title: "T-comum-vencida",
  },
  // crítica IGNORADA -> não é falha crítica
  {
    id: "E4",
    task_id: "T4",
    status: "skipped",
    scheduled_at: `${DAY}T15:00:00.000Z`,
    weight: "critica",
    title: "T-critica-skipped",
  },
  // borda UTC: 2026-09-10 22:30 em America/Sao_Paulo
  {
    id: "E5",
    task_id: "T5",
    status: "pending",
    scheduled_at: "2026-09-11T01:30:00.000Z",
    weight: "comum",
    title: "T-borda-utc",
  },
  // cancelada: some do card e do drill-down por padrão
  {
    id: "E6",
    task_id: "T6",
    status: "cancelled",
    scheduled_at: `${DAY}T16:00:00.000Z`,
    weight: "comum",
    title: "T-cancelada",
  },
];

const EVIDENCES: Row[] = [
  {
    id: "ev1",
    task_execution_id: "E1",
    storage_path: "a.jpg",
    reference_path: null,
    status: "pending",
    submitted_at: `${DAY}T12:30:00.000Z`,
    submitted_by: null,
  },
  {
    id: "ev2",
    task_execution_id: "E1",
    storage_path: "b.jpg",
    reference_path: null,
    status: "pending",
    submitted_at: `${DAY}T12:35:00.000Z`,
    submitted_by: null,
  },
  {
    id: "ev3",
    task_execution_id: "E2",
    storage_path: "c.jpg",
    reference_path: null,
    status: "approved",
    submitted_at: `${DAY}T12:56:00.000Z`,
    submitted_by: null,
  },
  {
    id: "ev4",
    task_execution_id: "E3",
    storage_path: "d.jpg",
    reference_path: null,
    status: "pending",
    submitted_at: `${DAY}T14:10:00.000Z`,
    submitted_by: null,
  },
  {
    id: "ev5",
    task_execution_id: "E6",
    storage_path: "e.jpg",
    reference_path: null,
    status: "pending",
    submitted_at: `${DAY}T16:05:00.000Z`,
    submitted_by: null,
  },
].map((e) => ({ ...e, organization_id: ORG, unit_id: UNIT }));

function executionRows(): Row[] {
  return EXECUTIONS.map((e) => ({
    id: e.id,
    organization_id: ORG,
    unit_id: UNIT,
    task_id: e.task_id,
    shift_id: null,
    scheduled_at: e.scheduled_at,
    executed_at: e.executed_at ?? null,
    status: e.status,
    notes: null,
    executed_by: null,
    cancelled_at: e.status === "cancelled" ? `${DAY}T17:00:00.000Z` : null,
    cancellation_reason: e.status === "cancelled" ? "unit_deactivated" : null,
    tasks: { id: e.task_id, title: e.title, description: null, code: null, weight: e.weight },
    shifts: null,
  }));
}

/**
 * Regra canônica do card (declarada explicitamente, igual à view corrigida):
 *   overdue_open   = vencidas e abertas (pending/late)
 *   critical       = crítica + vencida + não concluída + não cancelada + NÃO ignorada
 *   pending (evid) = execuções distintas com >= 1 evidência pendente, não canceladas
 */
function expectedViewRow(timezone: string): Row {
  const { start, end } = unitDayRange(DAY, timezone);
  const now = Date.now();
  const inRange = EXECUTIONS.filter((e) => e.scheduled_at >= start && e.scheduled_at <= end);
  const overdue = inRange.filter(
    (e) => (e.status === "pending" || e.status === "late") && Date.parse(e.scheduled_at) < now,
  ).length;
  const critical = inRange.filter(
    (e) =>
      e.weight === "critica" &&
      !["done", "cancelled", "skipped"].includes(e.status) &&
      Date.parse(e.scheduled_at) < now,
  ).length;
  const pendingExecIds = new Set(
    EVIDENCES.filter((v) => v.status === "pending")
      .map((v) => String(v.task_execution_id))
      .filter((id) => {
        const exec = EXECUTIONS.find((e) => e.id === id);
        return !!exec && exec.status !== "cancelled" && inRange.some((e) => e.id === id);
      }),
  );
  return {
    organization_id: ORG,
    unit_id: UNIT,
    unit_name: "Unidade Um",
    reference_date: DAY,
    total_scheduled_tasks: inRange.length,
    completed_tasks: inRange.filter((e) => e.status === "done").length,
    completed_on_time: inRange.filter((e) => e.status === "done").length,
    completed_late: 0,
    overdue_open_tasks: overdue,
    delayed_tasks: overdue,
    critical_failures: critical,
    pending_evidences: pendingExecIds.size,
    weight_total: 5,
    weight_done: 1,
    compliance_percentage: 20,
    total_due_tasks: inRange.length,
    due_completed_tasks: inRange.filter((e) => e.status === "done").length,
    due_weight_total: 5,
    due_weight_done: 1,
    due_compliance_percentage: 20,
  };
}

// ───────────────────────── query-aware supabase mock ────────────────────────

const db: Record<string, Row[]> = {};
const recorded: { table: string; filters: Record<string, unknown> }[] = [];

function matches(row: Row, key: string, value: unknown): boolean {
  const sep = key.indexOf(":");
  const op = sep === -1 ? "eq" : key.slice(0, sep);
  const col = sep === -1 ? key : key.slice(sep + 1);
  const v = row[col];
  if (op === "eq") return v === value;
  if (op === "in") return Array.isArray(value) && value.includes(v as never);
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
    eq: (col: string, value: unknown) => ((filters[col] = value), b),
    in: (col: string, value: unknown[]) => ((filters[`in:${col}`] = value), b),
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
    maybeSingle: () => {
      const found = rows();
      return Promise.resolve({ data: found[0] ?? null, error: null });
    },
    then: (onFulfilled: (v: unknown) => unknown, onRejected: (e: unknown) => unknown) =>
      Promise.resolve({ data: rows(), error: null }).then(onFulfilled, onRejected),
  });
  return b;
}

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: vi.fn(),
    channel: vi.fn(() => ({ on: vi.fn().mockReturnThis(), subscribe: vi.fn().mockReturnThis() })),
    removeChannel: vi.fn(),
  },
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ user: { id: "u1" }, loading: false }),
}));

const workspaceState = {
  currentWorkspace: { id: ORG, name: "Org A" } as { id: string; name: string } | null,
  workspaceStatus: "workspace" as "loading" | "personal" | "workspace",
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

vi.mock("@/components/DashboardLayout", () => ({
  DashboardLayout: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock("@/components/dashboard/OperationalDashboardFilters", () => ({
  OperationalDashboardFilters: () => <div data-testid="filters" />,
  sanitizeFilters: (v: Record<string, unknown>) => v,
}));

vi.mock("@/components/operations/OperationalTaskItem", () => ({
  OperationalTaskItem: ({ execution }: { execution: { taskTitle: string } }) => (
    <span data-testid="op-item">{execution.taskTitle}</span>
  ),
}));

vi.mock("@/components/operations/TaskExecutionDetailDrawer", () => ({
  TaskExecutionDetailDrawer: () => <div data-testid="drawer" />,
}));

import { Route as UnitOperacaoRoute } from "../../routes/unidades.$unitId.operacao";
import { supabase } from "@/integrations/supabase/client";

const mockFrom = vi.mocked(supabase.from);

function stubRoute() {
  const r = UnitOperacaoRoute as unknown as Record<string, unknown>;
  r.useParams = () => ({ unitId: UNIT });
  r.useSearch = () => ({ startDate: DAY, endDate: DAY });
}

async function renderDetail(timezone: string, viewRow: Row) {
  db.analytics_unit_daily_compliance = [viewRow];
  db.task_executions = executionRows();
  db.evidences = EVIDENCES;
  db.profiles = [];
  // A rota valida a unidade por id + workspace_id (6B.1B) e lê units.timezone.
  db.units = [{ id: UNIT, name: "Unidade Um", timezone, workspace_id: ORG }];
  recorded.length = 0;
  mockFrom.mockImplementation(((table: string) => builder(table)) as never);
  stubRoute();
  const Component = UnitOperacaoRoute.options.component as React.ComponentType;
  const view = render(<Component />);
  await waitFor(() => expect(screen.getByText("T-done")).toBeTruthy(), { timeout: 4000 });
  return view;
}

/**
 * Valor do MetricCard do cabeçalho. O rótulo também aparece em gatilhos de
 * aba/seção, então o card é identificado pela sua estrutura (div.mt-1).
 */
function metricValue(label: string): string {
  for (const el of screen.getAllByText(label)) {
    const value = el.parentElement?.parentElement?.querySelector("div.mt-1");
    if (value) return value.textContent!.trim();
  }
  throw new Error(`MetricCard não encontrado: ${label}`);
}

/**
 * Itens da Seção de detalhe identificada pelo título. O título pode coincidir
 * com o rótulo de um MetricCard, então usamos a ocorrência que realmente
 * contém itens listados.
 */
function sectionItems(title: string): HTMLElement[] {
  const headings = screen.getAllByText(title);
  expect(headings.length, `seção não encontrada: ${title}`).toBeGreaterThan(0);
  for (const heading of headings) {
    const container = heading.closest("div");
    if (!container) continue;
    const items = within(container).queryAllByTestId("op-item");
    if (items.length > 0) return items;
  }
  return [];
}

/** Troca de aba (Radix ativa no foco/clique) e espera o conteúdo montar. */
async function openTab(tabName: RegExp, uniqueHeading: string) {
  const user = userEvent.setup();
  await user.click(screen.getByRole("tab", { name: tabName }));
  await waitFor(() => expect(screen.getByText(uniqueHeading)).toBeTruthy(), { timeout: 3000 });
}

function taskExecutionsQuery() {
  return recorded.filter((r) => r.table === "task_executions").at(-1)!;
}

// ───────────────────────────────── testes ───────────────────────────────────

describe("6B.2A — fronteira do período usa o dia civil da unidade", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    workspaceState.currentWorkspace = { id: ORG, name: "Org A" };
    workspaceState.workspaceStatus = "workspace";
  });

  it("consulta task_executions com o intervalo UTC derivado da timezone da unidade", async () => {
    await renderDetail("America/Sao_Paulo", expectedViewRow("America/Sao_Paulo"));

    const filters = taskExecutionsQuery().filters;
    expect(filters["organization_id"]).toBe(ORG);
    expect(filters["unit_id"]).toBe(UNIT);
    // 2026-09-10 00:00 → 2026-09-11 02:59:59.999 (fim do dia civil em SP).
    expect(filters["gte:scheduled_at"]).toBe("2026-09-10T03:00:00.000Z");
    expect(filters["lte:scheduled_at"]).toBe("2026-09-11T02:59:59.999Z");
  });

  it("em UTC o mesmo período produz outro intervalo", async () => {
    await renderDetail("UTC", expectedViewRow("UTC"));

    const filters = taskExecutionsQuery().filters;
    expect(filters["organization_id"]).toBe(ORG);
    expect(filters["gte:scheduled_at"]).toBe("2026-09-10T00:00:00.000Z");
    expect(filters["lte:scheduled_at"]).toBe("2026-09-10T23:59:59.999Z");
  });

  it("a execução da borda (2026-09-11T01:30Z) entra no dia 10 em SP e sai em UTC", async () => {
    await renderDetail("America/Sao_Paulo", expectedViewRow("America/Sao_Paulo"));
    await openTab(/Atrasadas/, "Concluídas com atraso");
    const titles = sectionItems("Abertas em atraso").map((n) => n.textContent);
    expect(titles).toContain("T-borda-utc");
    expect(titles).toHaveLength(3);
  });
});

describe("6B.2A — card × aba: Abertas em atraso", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    workspaceState.currentWorkspace = { id: ORG, name: "Org A" };
    workspaceState.workspaceStatus = "workspace";
  });

  it("SP: card 3 === itens da seção (a view e o detalhe concordam)", async () => {
    await renderDetail("America/Sao_Paulo", expectedViewRow("America/Sao_Paulo"));
    const card = metricValue("Abertas em atraso");
    expect(card).toBe("3");

    await openTab(/Atrasadas/, "Concluídas com atraso");
    const items = sectionItems("Abertas em atraso");
    expect(items).toHaveLength(3);
    expect(items.map((n) => n.textContent).sort()).toEqual(
      ["T-borda-utc", "T-comum-vencida", "T-critica-vencida"].sort(),
    );
    expect(card).toBe(String(items.length));
  });

  it("UTC: card 2 === itens da seção (a borda sai do período)", async () => {
    await renderDetail("UTC", expectedViewRow("UTC"));
    const card = metricValue("Abertas em atraso");
    expect(card).toBe("2");

    await openTab(/Atrasadas/, "Concluídas com atraso");
    const items = sectionItems("Abertas em atraso");
    expect(items.map((n) => n.textContent)).not.toContain("T-borda-utc");
    expect(card).toBe(String(items.length));
  });
});

describe("6B.2A — card × aba: Falhas críticas (skipped não conta)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    workspaceState.currentWorkspace = { id: ORG, name: "Org A" };
    workspaceState.workspaceStatus = "workspace";
  });

  it("card 1 === seção, e a execução crítica IGNORADA fica fora", async () => {
    await renderDetail("America/Sao_Paulo", expectedViewRow("America/Sao_Paulo"));
    const card = metricValue("Falhas críticas");
    expect(card).toBe("1");

    await openTab(/Falhas críticas/, "Falhas críticas vencidas");
    const items = sectionItems("Falhas críticas vencidas");
    expect(items).toHaveLength(1);
    expect(items[0].textContent).toBe("T-critica-vencida");
    expect(items.map((n) => n.textContent)).not.toContain("T-critica-skipped");
    expect(card).toBe(String(items.length));
  });

  it("controle direto da regra: skipped é ignorada e não é falha crítica", () => {
    expect(deriveTaskStatus({ status: "skipped", scheduledAt: "2026-09-10T15:00:00.000Z" })).toBe(
      "ignorada",
    );
    expect(isCriticalFailure("critica", "ignorada")).toBe(false);
    // Controle: a mesma tarefa vencida e aberta É falha crítica.
    const derived = deriveTaskStatus({
      status: "pending",
      scheduledAt: "2026-09-10T12:00:00.000Z",
      now: new Date("2026-09-13T00:00:00.000Z"),
    });
    expect(derived).toBe("atrasada");
    expect(isCriticalFailure("critica", derived)).toBe(true);
  });
});

describe("6B.2A — card × aba: Evidências pendentes (execuções, não arquivos)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    workspaceState.currentWorkspace = { id: ORG, name: "Org A" };
    workspaceState.workspaceStatus = "workspace";
  });

  it("card 2 === seção com 2 execuções, mesmo com 3 arquivos pendentes", async () => {
    await renderDetail("America/Sao_Paulo", expectedViewRow("America/Sao_Paulo"));
    const card = metricValue("Evidências pendentes");
    expect(card).toBe("2");

    await openTab(/Evidências/, "Evidências pendentes de análise");
    const items = sectionItems("Evidências pendentes de análise");
    expect(items).toHaveLength(2);
    expect(items.map((n) => n.textContent).sort()).toEqual(
      ["T-comum-vencida", "T-critica-vencida"].sort(),
    );
    // A execução cancelada (ev5 pendente) não aparece nem no card nem na seção.
    expect(items.map((n) => n.textContent)).not.toContain("T-cancelada");
    expect(card).toBe(String(items.length));
  });

  it("uma execução com DUAS evidências pendentes é UMA ocorrência", async () => {
    const view = await renderDetail("America/Sao_Paulo", expectedViewRow("America/Sao_Paulo"));
    // A execução E1 tem ev1 + ev2 pendentes.
    await openTab(/Evidências/, "Evidências pendentes de análise");
    const titles = sectionItems("Evidências pendentes de análise").map((n) => n.textContent);
    expect(titles.filter((t) => t === "T-critica-vencida")).toHaveLength(1);

    // O número de ARQUIVOS continua visível dentro da própria execução.
    const criticalOnly = EVIDENCES.filter(
      (v) => v.task_execution_id === "E1" && v.status === "pending",
    );
    expect(criticalOnly).toHaveLength(2);
    expect(titles).toHaveLength(2); // 2 execuções, não 3 arquivos
    view.unmount();
  });
});

describe("6B.2A — três indicadores simultaneamente consistentes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    workspaceState.currentWorkspace = { id: ORG, name: "Org A" };
    workspaceState.workspaceStatus = "workspace";
  });

  it("SP: 3 / 1 / 2 no card e nos detalhes correspondentes", async () => {
    await renderDetail("America/Sao_Paulo", expectedViewRow("America/Sao_Paulo"));

    const overdue = metricValue("Abertas em atraso");
    const critical = metricValue("Falhas críticas");
    const pending = metricValue("Evidências pendentes");
    expect([overdue, critical, pending]).toEqual(["3", "1", "2"]);

    await openTab(/Atrasadas/, "Concluídas com atraso");
    expect(sectionItems("Abertas em atraso")).toHaveLength(Number(overdue));

    await openTab(/Falhas críticas/, "Falhas críticas vencidas");
    expect(sectionItems("Falhas críticas vencidas")).toHaveLength(Number(critical));

    await openTab(/Evidências/, "Evidências pendentes de análise");
    expect(sectionItems("Evidências pendentes de análise")).toHaveLength(Number(pending));
  });
});
