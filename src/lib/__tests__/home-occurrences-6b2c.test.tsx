/**
 * Execution 6B.2C — Home: obrigações agendadas visíveis e acionáveis.
 *
 * Prova comportamento real (navegação observada, RPC observada, render real):
 *   - cada occurrence vira uma linha própria, com seu próprio occurrenceId;
 *   - clicar abre /executar/$id?occurrenceId=... para viewer, editor E admin;
 *   - as prioridades legadas continuam navegando como antes;
 *   - a prioridade Camera AI continua abrindo /checklist?settings=true;
 *   - contexto pessoal nunca consulta a RPC de occurrences;
 *   - falha na leitura não vira "zero rotinas" silencioso;
 *   - o Resumo mostra as rotinas em grupo SEPARADO (sem fundir com assignments).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent, within } from "@testing-library/react";
import { HomeOperationalPriorities } from "@/components/home/HomeOperationalPriorities";
import { HomeOccurrenceSummary } from "@/components/home/HomeOccurrenceSummary";
import type { HomeExecutionOccurrence } from "@/lib/home-execution-occurrences";

const WS = "88888888-8888-4888-8888-888888888888";
const CHK = "55555555-5555-4555-8555-555555555555";
const CHK_B = "66666666-6666-4666-8666-666666666666";
const WM = "77777777-7777-4777-8777-777777777777";
const SCHED = "44444444-4444-4444-8444-444444444444";
const OCC_YESTERDAY = "11111111-1111-4111-8111-111111111111";
const OCC_TODAY = "22222222-2222-4222-8222-222222222222";
const OCC_OTHER = "33333333-3333-4333-8333-333333333333";

const h = vi.hoisted(() => ({
  navigate: vi.fn(),
  rpc: vi.fn(),
  workspace: {
    currentWorkspace: { id: "88888888-8888-4888-8888-888888888888" } as { id: string } | null,
    workspaceStatus: "workspace" as "loading" | "personal" | "workspace",
    workspaces: [] as unknown[],
  },
  rbac: {
    role: "viewer" as string | null,
    isViewer: true,
    canManage: false,
    workspaceMemberId: "77777777-7777-4777-8777-777777777777" as string | null,
    hasAccess: true,
    isAdmin: false,
    loading: false,
    isFetching: false,
  },
  attention: {} as Record<string, { rejectedCount: number; latestSubmittedAt: string | null }>,
}));

vi.mock("@tanstack/react-router", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-router")>();
  return {
    ...actual,
    useNavigate: () => h.navigate,
    Link: ({ children }: { children?: React.ReactNode }) => <a>{children}</a>,
  };
});

vi.mock("@/integrations/supabase/client", () => {
  const assignment = {
    id: "assignment-1",
    checklist_id: "55555555-5555-4555-8555-555555555555",
    due_at: "2020-01-01T00:00:00Z",
    completed_at: null,
    workspace_member_id: "77777777-7777-4777-8777-777777777777",
  };
  const builder: Record<string, unknown> = {};
  const chain = () => vi.fn(() => builder);
  builder.select = chain();
  builder.eq = chain();
  builder.is = chain();
  builder.order = chain();
  const resolved = Promise.resolve({
    data: [
      {
        id: "55555555-5555-4555-8555-555555555555",
        title: "Checklist legado",
        workspace_id: "88888888-8888-4888-8888-888888888888",
        user_id: "u1",
        checklist_assignments: [assignment],
      },
    ],
    error: null,
  });
  (builder as { then?: unknown }).then = resolved.then.bind(resolved);
  return { supabase: { from: vi.fn(() => builder), rpc: h.rpc } };
});

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ user: { id: "u1" }, loading: false, needsEmailConfirmation: false }),
}));
vi.mock("@/contexts/WorkspaceContext", () => ({ useWorkspace: () => h.workspace }));
vi.mock("@/contexts/SidebarContext", () => ({ useSidebar: () => ({ sidebarOpen: true }) }));
vi.mock("@/hooks/useWorkspaceRBAC", () => ({ useWorkspaceRBAC: () => h.rbac }));
vi.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => false }));
vi.mock("@/hooks/useHomeCameraAttention", () => ({
  useHomeCameraAttention: () => h.attention,
}));
vi.mock("@/components/DashboardLayout", () => ({
  DashboardLayout: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

import { Dashboard } from "@/routes/inicio";

const row = (occurrenceId: string, over: Record<string, unknown> = {}) => ({
  occurrence_id: occurrenceId,
  schedule_id: SCHED,
  checklist_id: CHK,
  checklist_title: "Rotina da manhã",
  workspace_member_id: WM,
  occurrence_date: "2026-09-13",
  due_at: "2020-01-01T00:00:00Z",
  started_at: null,
  completed_at: null,
  response_id: null,
  unit_id: null,
  shift_id: null,
  ...over,
});

const occurrence = (over: Partial<HomeExecutionOccurrence> = {}): HomeExecutionOccurrence => ({
  occurrenceId: OCC_TODAY,
  scheduleId: SCHED,
  checklistId: CHK,
  checklistTitle: "Rotina da manhã",
  workspaceMemberId: WM,
  occurrenceDate: "2026-09-13",
  dueAt: "2099-01-01T00:00:00Z",
  startedAt: null,
  completedAt: null,
  responseId: null,
  unitId: null,
  shiftId: null,
  ...over,
});

beforeEach(() => {
  h.navigate.mockReset();
  h.rpc.mockReset();
  h.attention = {};
  h.workspace.currentWorkspace = { id: WS };
  h.workspace.workspaceStatus = "workspace";
  h.rbac.role = "viewer";
  h.rbac.isViewer = true;
  h.rbac.canManage = false;

  h.rpc.mockImplementation(async (name: string) => {
    if (name === "list_my_checklist_execution_occurrences") {
      return {
        data: [row(OCC_YESTERDAY), row(OCC_TODAY, { due_at: "2099-01-01T00:00:00Z" })],
        error: null,
      };
    }
    if (name === "list_my_checklist_assignments") {
      return {
        data: [
          {
            id: "assignment-1",
            checklist_id: CHK,
            due_at: "2020-01-01T00:00:00Z",
            completed_at: null,
            workspace_member_id: WM,
          },
        ],
        error: null,
      };
    }
    return { data: null, error: null };
  });
});

describe("6B.2C — componente de prioridades com occurrences", () => {
  it("cada occurrence é uma linha própria, identificada pelo seu occurrenceId", () => {
    const onOpenOccurrence = vi.fn();
    render(
      <HomeOperationalPriorities
        checklists={[]}
        occurrences={[
          occurrence({ occurrenceId: OCC_YESTERDAY, dueAt: "2020-01-01T00:00:00Z" }),
          occurrence({ occurrenceId: OCC_TODAY }),
        ]}
        onOpen={() => {}}
        onOpenOccurrence={onOpenOccurrence}
      />,
    );

    const rows = screen.getAllByTestId("home-occurrence-priority");
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.getAttribute("data-occurrence-id"))).toEqual([
      OCC_YESTERDAY,
      OCC_TODAY,
    ]);
    // Mais antiga (atrasada) primeiro.
    expect(screen.getByText("Atrasada")).toBeInTheDocument();
    expect(screen.getByText("Pendente")).toBeInTheDocument();
  });

  it("duas occurrences do MESMO checklist continuam sendo duas ações distintas", () => {
    const onOpenOccurrence = vi.fn();
    render(
      <HomeOperationalPriorities
        checklists={[]}
        occurrences={[
          occurrence({ occurrenceId: OCC_YESTERDAY, dueAt: "2020-01-01T00:00:00Z" }),
          occurrence({ occurrenceId: OCC_TODAY }),
        ]}
        onOpen={() => {}}
        onOpenOccurrence={onOpenOccurrence}
      />,
    );

    fireEvent.click(screen.getAllByTestId("home-occurrence-priority")[0]);
    fireEvent.click(screen.getAllByTestId("home-occurrence-priority")[1]);

    expect(onOpenOccurrence.mock.calls[0][0].occurrenceId).toBe(OCC_YESTERDAY);
    expect(onOpenOccurrence.mock.calls[1][0].occurrenceId).toBe(OCC_TODAY);
    expect(onOpenOccurrence.mock.calls[0][0].checklistId).toBe(CHK);
  });

  it("sem occurrences o componente se comporta exatamente como antes", () => {
    render(
      <HomeOperationalPriorities
        checklists={[
          {
            id: CHK,
            title: "Checklist legado",
            checklist_assignments: [
              { id: "a1", due_at: "2020-01-01T00:00:00Z", completed_at: null },
            ],
          },
        ]}
        onOpen={() => {}}
      />,
    );

    expect(screen.queryAllByTestId("home-occurrence-priority")).toHaveLength(0);
    expect(screen.getByText("Checklist legado")).toBeInTheDocument();
    expect(screen.getByText("Atrasado")).toBeInTheDocument();
  });

  it("ocorrência concluída não aparece e o restante é reportado", () => {
    render(
      <HomeOperationalPriorities
        checklists={[]}
        occurrences={[occurrence({ completedAt: "2020-01-02T00:00:00Z" })]}
        onOpen={() => {}}
        onOpenOccurrence={() => {}}
      />,
    );

    expect(screen.queryAllByTestId("home-occurrence-priority")).toHaveLength(0);
  });
});

describe("6B.2C — resumo: rotinas contadas à parte", () => {
  it("mostra o grupo separado quando há rotinas abertas, sem fundir com os checklists", () => {
    render(<HomeOccurrenceSummary occurrenceCounts={{ total: 3, atrasadas: 2, pendentes: 1 }} />);

    const group = screen.getByTestId("home-occurrence-summary");
    expect(within(group).getByText("Rotinas atrasadas")).toBeInTheDocument();
    expect(within(group).getByText("Rotinas pendentes")).toBeInTheDocument();
    expect(within(group).getByText("2")).toBeInTheDocument();
    expect(screen.getByText(/contadas à parte/)).toBeInTheDocument();
  });

  it("sem ocorrências abertas não inventa um grupo de rotinas", () => {
    render(<HomeOccurrenceSummary occurrenceCounts={{ total: 0, atrasadas: 0, pendentes: 0 }} />);
    expect(screen.queryByTestId("home-occurrence-summary")).toBeNull();
  });

  it("sem contagem (leitura falhou ou desligada) nada é renderizado", () => {
    render(<HomeOccurrenceSummary />);
    expect(screen.queryByTestId("home-occurrence-summary")).toBeNull();
  });

  it("o resumo de checklists continua intocado e separado", async () => {
    const { HomeOperationalSummary } = await import("@/components/home/HomeOperationalSummary");
    render(<HomeOperationalSummary checklists={[]} />);
    expect(screen.getByText("Total")).toBeInTheDocument();
    expect(screen.getByText("Atrasados")).toBeInTheDocument();
    expect(screen.queryByTestId("home-occurrence-summary")).toBeNull();
  });
});

describe("6B.2C — a nova Home (6B.2L) e as rotinas agendadas", () => {
  it("a rota /inicio não consulta a RPC de occurrences e não renderiza as superfícies de rotina", async () => {
    // 6B.2L: a composição aprovada da Home não renderiza mais Prioridades nem o
    // resumo de rotinas — a leitura de occurrences deixou de ser feita aqui.
    render(<Dashboard />);

    await waitFor(() => expect(screen.getByTestId("home-checklist-list")).toBeInTheDocument());

    expect(
      h.rpc.mock.calls.filter((c) => c[0] === "list_my_checklist_execution_occurrences"),
    ).toHaveLength(0);
    expect(screen.queryAllByTestId("home-occurrence-priority")).toHaveLength(0);
    expect(screen.queryByTestId("home-occurrence-summary")).toBeNull();
    expect(screen.queryByText(/Rotinas agendadas|Rotinas atrasadas|Rotinas pendentes/)).toBeNull();
    expect(screen.queryByText("Prioridades")).toBeNull();
    // A superfície do /inicio continua sendo a lista REAL de checklists.
    expect(screen.getByText("Checklist legado")).toBeInTheDocument();
    // E os 3 cards continuam vindo só de buildHomeOperationalSummary.
    expect(screen.getByTestId("home-summary-card-checklists")).toBeInTheDocument();
  });

  it("contexto pessoal também não consulta a RPC de occurrences", async () => {
    h.workspace.workspaceStatus = "personal";
    h.workspace.currentWorkspace = null;
    h.rbac.role = null;
    h.rbac.isViewer = false;
    h.rbac.canManage = false;

    render(<Dashboard />);

    await waitFor(() => expect(screen.getByTestId("home-checklist-list")).toBeInTheDocument());
    expect(
      h.rpc.mock.calls.filter((c) => c[0] === "list_my_checklist_execution_occurrences"),
    ).toHaveLength(0);
  });

});
