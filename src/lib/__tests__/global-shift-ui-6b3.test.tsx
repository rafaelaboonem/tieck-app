/**
 * Execution 6B.3 — filtro global de turno na interface.
 *
 * Prova, com dados reais no builder (sem inspecionar strings do código-fonte):
 *
 *   §13 — "Todos os turnos" é a SOMA dos turnos: 3 tarefas de manhã + 2 da noite
 *         = 5 previstas, e o mesmo para rotinas (2 + 3 = 5). As demais métricas
 *         (concluídas, atrasadas, pendentes, conformidade) recortam igual.
 *   §15 — filtro de turno recorta os KPIs de tarefa (manhã 3, noite 2).
 *   §16 — filtro de turno recorta as rotinas (manhã 2, noite 3).
 *   §18 — o turno sobrevive à navegação para a unidade.
 *   §19 — trocar para uma unidade que não possui o turno selecionado limpa a
 *         combinação impossível, e NENHUMA consulta de dados chega a usar essa
 *         combinação.
 *   §11 — o detalhe inicializa o seletor a partir do `shiftId` da URL e cai em
 *         "Todos" quando o turno não pertence à unidade.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

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
const UNIT_A = "aaaaaaaa-1111-4111-8111-111111111111";
const UNIT_B = "bbbbbbbb-2222-4222-8222-222222222222";
const SHIFT_M = "55555555-5555-4555-8555-555555555555";
const SHIFT_N = "66666666-6666-4666-8666-666666666666";
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

function cardValue(label: string, scope: HTMLElement = document.body): string {
  for (const el of within(scope).getAllByText(label)) {
    const value = el.parentElement?.parentElement?.querySelector("div.mt-2, div.mt-1");
    if (value) return value.textContent!.trim();
  }
  throw new Error(`card não encontrado: ${label}`);
}

async function expectCardValue(label: string, expected: string, scope?: HTMLElement) {
  await waitFor(() => expect(cardValue(label, scope)).toBe(expected));
}

function taskRow(over: Row = {}) {
  return {
    organization_id: ORG,
    unit_id: UNIT_A,
    unit_name: "Unidade A",
    reference_date: DAY,
    shift_id: SHIFT_M,
    shift_name: "Manhã",
    total_scheduled_tasks: 3,
    completed_tasks: 2,
    completed_on_time: 1,
    completed_late: 1,
    overdue_open_tasks: 1,
    delayed_tasks: 2,
    critical_failures: 0,
    pending_evidences: 0,
    weight_total: 3,
    weight_done: 2,
    compliance_percentage: 66.7,
    total_due_tasks: 2,
    due_completed_tasks: 1,
    due_weight_total: 2,
    due_weight_done: 1,
    due_compliance_percentage: 50,
    ...over,
  };
}

function routineRow(over: Row = {}) {
  return {
    organization_id: ORG,
    unit_id: UNIT_A,
    unit_name: "Unidade A",
    reference_date: DAY,
    shift_id: SHIFT_M,
    shift_name: "Manhã",
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

/** Duas linhas (manhã + noite) por domínio: 3+2 tarefas e 2+3 rotinas. */
function seedTwoShifts(unitId = UNIT_A) {
  db.analytics_unit_daily_compliance = [
    taskRow({
      unit_id: unitId,
      total_scheduled_tasks: 3,
      weight_total: 3,
      weight_done: 3,
      total_due_tasks: 3,
      due_weight_total: 3,
      due_weight_done: 3,
      completed_tasks: 2,
      completed_on_time: 1,
      completed_late: 1,
      overdue_open_tasks: 1,
      due_completed_tasks: 2,
      due_compliance_percentage: 100,
    }),
    taskRow({
      unit_id: unitId,
      shift_id: SHIFT_N,
      shift_name: "Noite",
      total_scheduled_tasks: 2,
      completed_tasks: 1,
      completed_on_time: 1,
      completed_late: 0,
      overdue_open_tasks: 1,
      delayed_tasks: 1,
      weight_total: 2,
      weight_done: 1,
      total_due_tasks: 1,
      due_completed_tasks: 2,
      due_weight_total: 1,
      due_weight_done: 2,
      due_compliance_percentage: 100,
    }),
  ];
  db.analytics_unit_daily_occurrences = [
    routineRow({
      unit_id: unitId,
      shift_id: SHIFT_M,
      shift_name: "Manhã",
      total_occurrences: 2,
      completed_occurrences: 1,
      completed_on_time: 1,
      completed_late: 0,
      overdue_open_occurrences: 1,
      pending_open_occurrences: 0,
      due_occurrences: 2,
    }),
    routineRow({
      unit_id: unitId,
      shift_id: SHIFT_N,
      shift_name: "Noite",
      total_occurrences: 3,
      completed_occurrences: 1,
      completed_on_time: 1,
      completed_late: 0,
      overdue_open_occurrences: 0,
      pending_open_occurrences: 2,
      due_occurrences: 1,
    }),
  ];
}

async function renderPainel(search: Row) {
  const { Route } = await import("../../routes/painel");
  const r = Route as unknown as Record<string, unknown>;
  r.useSearch = () => search;
  const Component = Route.options.component as React.ComponentType;
  return render(<Component />);
}

async function renderDetail(unitId: string, search: Row) {
  const { Route } = await import("../../routes/unidades.$unitId.operacao");
  const r = Route as unknown as Record<string, unknown>;
  r.useParams = () => ({ unitId });
  r.useSearch = () => search;
  const Component = Route.options.component as React.ComponentType;
  return render(<Component />);
}

describe("6B.3 /painel — §13/§15/§16 turno recorta os dois domínios", () => {
  beforeEach(() => {
    seedTwoShifts();
    db.shifts = [
      { id: SHIFT_M, name: "Manhã", workspace_id: ORG },
      { id: SHIFT_N, name: "Noite", workspace_id: ORG },
    ];
    db.units = [
      { id: UNIT_A, name: "Unidade A", timezone: "America/Sao_Paulo", workspace_id: ORG },
    ];
  });

  it(
    "'Todos os turnos' é a soma dos turnos (tarefas 5, rotinas 5)",
    { timeout: 60000 },
    async () => {
      await renderPainel({ startDate: DAY, endDate: DAY });
      await screen.findByTestId("scheduled-occurrences-section", {}, { timeout: 20000 });

      await expectCardValue("Tarefas programadas", "5");
      await expectCardValue("Concluídas", "3");

      const section = screen.getByTestId("scheduled-occurrences-section");
      await expectCardValue("Previstas", "5", section);
      await expectCardValue("Concluídas", "2", section);
      await expectCardValue("Pendentes", "2", section);
      await expectCardValue("Abertas em atraso", "1", section);
    },
  );

  it("turno manhã recorta tarefas (3) e rotinas (2)", { timeout: 60000 }, async () => {
    await renderPainel({ startDate: DAY, endDate: DAY, shiftId: SHIFT_M });
    await screen.findByTestId("scheduled-occurrences-section", {}, { timeout: 20000 });

    await expectCardValue("Tarefas programadas", "3");
    const section = screen.getByTestId("scheduled-occurrences-section");
    await expectCardValue("Previstas", "2", section);
  });

  it("turno noite recorta tarefas (2) e rotinas (3)", { timeout: 60000 }, async () => {
    await renderPainel({ startDate: DAY, endDate: DAY, shiftId: SHIFT_N });
    await screen.findByTestId("scheduled-occurrences-section", {}, { timeout: 20000 });

    await expectCardValue("Tarefas programadas", "2");
    const section = screen.getByTestId("scheduled-occurrences-section");
    await expectCardValue("Previstas", "3", section);
    await expectCardValue("Pendentes", "2", section);
  });

  it("a consulta de dados aplica o turno selecionado", { timeout: 60000 }, async () => {
    await renderPainel({ startDate: DAY, endDate: DAY, shiftId: SHIFT_N });
    await screen.findByTestId("scheduled-occurrences-section", {}, { timeout: 20000 });

    const dataQueries = recorded.filter(
      (r) => r.table === "analytics_unit_daily_compliance" && r.filters["gte:reference_date"],
    );
    expect(dataQueries.length).toBeGreaterThan(0);
    expect(dataQueries[dataQueries.length - 1].filters.shift_id).toBe(SHIFT_N);
  });

  it("§18 o turno sobrevive à navegação para a unidade", { timeout: 60000 }, async () => {
    await renderPainel({ startDate: DAY, endDate: DAY, shiftId: SHIFT_M });
    await screen.findByTestId("scheduled-occurrences-section", {}, { timeout: 15000 });
    await userEvent.click(
      await screen.findByTestId(`occurrence-unit-row-${UNIT_A}`, {}, { timeout: 15000 }),
    );
    expect(h.navigate).toHaveBeenCalledWith({
      to: "/unidades/$unitId/operacao",
      params: { unitId: UNIT_A },
      search: { startDate: DAY, endDate: DAY, shiftId: SHIFT_M },
    });
  });
});

describe("6B.3 /painel — §19 combinação impossível", () => {
  beforeEach(() => {
    seedTwoShifts(UNIT_B);
    db.analytics_unit_daily_compliance = db.analytics_unit_daily_compliance.filter(
      (r) => r.shift_id !== SHIFT_M,
    );
    db.analytics_unit_daily_occurrences = db.analytics_unit_daily_occurrences.filter(
      (r) => r.shift_id !== SHIFT_M,
    );
    db.units = [
      { id: UNIT_A, name: "Unidade A", timezone: "America/Sao_Paulo", workspace_id: ORG },
      { id: UNIT_B, name: "Unidade B", timezone: "America/Sao_Paulo", workspace_id: ORG },
    ];
  });

  it(
    "unidade sem o turno selecionado limpa o turno da URL e nunca consulta a combinação",
    { timeout: 60000 },
    async () => {
      await renderPainel({ startDate: DAY, endDate: DAY, unitId: UNIT_B, shiftId: SHIFT_M });

      await waitFor(() =>
        expect(h.navigate).toHaveBeenCalledWith(
          expect.objectContaining({
            to: "/painel",
            replace: true,
            search: expect.objectContaining({ unitId: UNIT_B }),
          }),
        ),
      );
      const clearing = h.navigate.mock.calls.find(([arg]) => arg.replace === true)?.[0] as {
        search: Record<string, unknown>;
      };
      expect(clearing.search.shiftId).toBeUndefined();

      // Nenhuma consulta de DADOS usou a combinação impossível.
      const impossible = recorded.filter(
        (r) =>
          r.table === "analytics_unit_daily_compliance" &&
          r.filters["gte:reference_date"] &&
          r.filters.unit_id === UNIT_B &&
          r.filters.shift_id === SHIFT_M,
      );
      expect(impossible).toHaveLength(0);
    },
  );
});

describe("6B.3 detalhe da unidade — §11 turno vindo da URL", () => {
  beforeEach(() => {
    db.units = [
      { id: UNIT_A, name: "Unidade A", timezone: "America/Sao_Paulo", workspace_id: ORG },
    ];
    db.analytics_unit_daily_compliance = [taskRow()];
    db.analytics_unit_daily_occurrences = [routineRow()];
    db.evidences = [];
    db.profiles = [];
    db.task_executions = [
      {
        id: "e1",
        organization_id: ORG,
        unit_id: UNIT_A,
        task_id: "t1",
        shift_id: SHIFT_M,
        scheduled_at: `${DAY}T09:00:00Z`,
        executed_at: null,
        status: "pending",
        notes: null,
        executed_by: null,
        cancelled_at: null,
        cancellation_reason: null,
        tasks: { id: "t1", title: "Tarefa manhã", description: null, code: null, weight: "comum" },
        shifts: { id: SHIFT_M, name: "Manhã" },
      },
      {
        id: "e2",
        organization_id: ORG,
        unit_id: UNIT_A,
        task_id: "t2",
        shift_id: SHIFT_N,
        scheduled_at: `${DAY}T21:00:00Z`,
        executed_at: null,
        status: "pending",
        notes: null,
        executed_by: null,
        cancelled_at: null,
        cancellation_reason: null,
        tasks: { id: "t2", title: "Tarefa noite", description: null, code: null, weight: "comum" },
        shifts: { id: SHIFT_N, name: "Noite" },
      },
    ];
    h.rpc.mockResolvedValue({
      data: [
        {
          occurrence_id: "11111111-1111-4111-8111-111111111111",
          schedule_id: "88888888-8888-4888-8888-888888888888",
          checklist_id: "99999999-9999-4999-8999-999999999999",
          checklist_title: "Rotina manhã",
          occurrence_date: DAY,
          due_at: `${DAY}T10:00:00Z`,
          started_at: null,
          completed_at: null,
          response_id: null,
          unit_id: UNIT_A,
          shift_id: SHIFT_M,
          shift_name: "Manhã",
          workspace_member_id: "44444444-4444-4444-8444-444444444444",
          responsible_name: "Ana",
        },
        {
          occurrence_id: "55555555-5555-4555-8555-555555555556",
          schedule_id: "aaaaaaaa-2222-4222-8222-22222222222a",
          checklist_id: "bbbbbbbb-3333-4333-8333-33333333333b",
          checklist_title: "Rotina noite",
          occurrence_date: DAY,
          due_at: `${DAY}T22:00:00Z`,
          started_at: null,
          completed_at: null,
          response_id: null,
          unit_id: UNIT_A,
          shift_id: SHIFT_N,
          shift_name: "Noite",
          workspace_member_id: "44444444-4444-4444-8444-444444444444",
          responsible_name: "Ana",
        },
      ],
      error: null,
    });
  });

  it(
    "inicializa o seletor e filtra as tarefas pelo shiftId da URL",
    { timeout: 60000 },
    async () => {
      await renderDetail(UNIT_A, { startDate: DAY, endDate: DAY, shiftId: SHIFT_M });

      // Cadeia assíncrona real (units → execuções → evidências/perfis) sob a
      // carga da suíte completa: espera explícita, sem depender do padrão.
      await screen.findByText("Tarefa manhã", {}, { timeout: 15000 });
      expect(screen.queryByText("Tarefa noite")).toBeNull();
      await waitFor(
        () =>
          expect(
            screen.getByText("Turno").closest("div")!.querySelector("button")!.textContent,
          ).toContain("Manhã"),
        { timeout: 15000 },
      );
    },
  );

  it(
    "turno inválido para a unidade cai em 'Todos' sem quebrar a página",
    { timeout: 60000 },
    async () => {
      await renderDetail(UNIT_A, { startDate: DAY, endDate: DAY, shiftId: "shift-inexistente" });

      await screen.findByText("Tarefa manhã", {}, { timeout: 15000 });
      expect(screen.getByText("Tarefa noite")).toBeTruthy();
      await waitFor(
        () =>
          expect(
            screen.getByText("Turno").closest("div")!.querySelector("button")!.textContent,
          ).toContain("Todos"),
        { timeout: 15000 },
      );
    },
  );

  it("a aba Rotinas respeita o turno da URL", { timeout: 60000 }, async () => {
    await renderDetail(UNIT_A, { startDate: DAY, endDate: DAY, shiftId: SHIFT_N });

    await userEvent.click(await screen.findByRole("tab", { name: /Rotinas/ }, { timeout: 15000 }));
    const list = await screen.findByTestId("occurrence-list", {}, { timeout: 15000 });
    expect(within(list).getByText("Rotina noite")).toBeTruthy();
    expect(within(list).queryByText("Rotina manhã")).toBeNull();
  });
});
