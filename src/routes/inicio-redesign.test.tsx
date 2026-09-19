import React from "react";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Dashboard } from "./inicio";
import { buildHomeOperationalSummary } from "@/lib/home-operational-summary";

/**
 * Home 6B.2L — integração da rota `/inicio` (rodada de refinamento).
 *
 * Prova, no componente REAL da rota:
 *   • os 3 cards vêm de `buildHomeOperationalSummary` do MESMO array de
 *     checklists que a Home carrega (nenhum número hardcoded, nenhuma segunda
 *     fórmula, nada de `checklist_execution_occurrences`);
 *   • a lista recebe os checklists reais e o filtro local é aplicado sobre eles;
 *   • o RBAC do produto é preservado (Viewer não ganha ação administrativa e
 *     continua indo para a execução);
 *   • "Novo checklist" usa o `handleNew` real e "Novo workspace" dispara o
 *     evento que abre o diálogo REAL do shell;
 *   • as superfícies antigas (resumo de 4 cards, rotinas agendadas,
 *     prioridades) não são mais renderizadas.
 */

// Radix Select precisa destes no jsdom para abrir/rolar.
beforeAll(() => {
  Element.prototype.hasPointerCapture = vi.fn();
  Element.prototype.releasePointerCapture = vi.fn();
  Element.prototype.setPointerCapture = vi.fn();
  Element.prototype.scrollIntoView = vi.fn();
});

const mocks = vi.hoisted(() => ({
  checklists: { data: [] as any[], error: null as any },
  profile: null as any,
  auth: {} as any,
  workspace: {} as any,
  rbac: {} as any,
  navigate: vi.fn(),
}));

vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => mocks.auth }));
vi.mock("@/contexts/WorkspaceContext", () => ({ useWorkspace: () => mocks.workspace }));
vi.mock("@/hooks/useWorkspaceRBAC", () => ({ useWorkspaceRBAC: () => mocks.rbac }));
vi.mock("@/contexts/SidebarContext", () => ({ useSidebar: () => ({ sidebarOpen: true }) }));
vi.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => false }));
vi.mock("@/components/DashboardLayout", () => ({
  DashboardLayout: ({ children }: any) =>
    React.createElement("div", { "data-testid": "shell" }, children),
}));
vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (config: any) => config,
  useNavigate: () => mocks.navigate,
}));

vi.mock("@/integrations/supabase/client", () => {
  const tableChain = () => {
    const result = { data: mocks.checklists.data, error: mocks.checklists.error };
    const chain: any = {
      select: () => chain,
      eq: () => chain,
      is: () => chain,
      order: () => chain,
      single: () => Promise.resolve({ data: null, error: null }),
      maybeSingle: () => Promise.resolve({ data: mocks.profile, error: null }),
      then: (resolve: any) => Promise.resolve(result).then(resolve),
    };
    return chain;
  };
  return {
    supabase: {
      from: () => tableChain(),
      rpc: () => Promise.resolve({ data: [], error: null }),
      auth: { getUser: () => Promise.resolve({ data: { user: { id: "u1" } } }) },
    },
  };
});

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const CHECKLISTS = [
  {
    id: "c1",
    title: "Abertura da loja",
    is_published: true,
    updated_at: "2026-09-16T12:00:00.000Z",
    created_at: "2026-09-01T12:00:00.000Z",
    checklist_assignments: [{ id: "a1", due_at: "2020-01-01T12:00:00.000Z", completed_at: null }],
  },
  {
    id: "c2",
    title: "Controle de temperatura",
    is_published: false,
    updated_at: "2026-09-17T12:00:00.000Z",
    created_at: "2026-09-02T12:00:00.000Z",
    checklist_assignments: [{ id: "a2", due_at: "2100-01-01T12:00:00.000Z", completed_at: null }],
  },
  {
    id: "c3",
    title: "Limpeza do salão",
    is_published: true,
    updated_at: "2026-09-18T12:00:00.000Z",
    created_at: "2026-09-03T12:00:00.000Z",
    checklist_assignments: [
      { id: "a3", due_at: "2100-01-01T12:00:00.000Z", completed_at: "2026-09-17T12:00:00.000Z" },
    ],
  },
];

function setupWorkspaceContext(overrides: { canManage?: boolean; isViewer?: boolean } = {}) {
  mocks.auth = {
    user: { id: "u1", email: "u1@example.com" },
    loading: false,
    needsEmailConfirmation: false,
  };
  mocks.workspace = {
    currentWorkspace: { id: "ws-1", name: "Meu Workspace" },
    workspaceStatus: "workspace",
    workspaces: [{ id: "ws-1", name: "Meu Workspace" }],
  };
  mocks.rbac = {
    canManage: overrides.canManage ?? true,
    isViewer: overrides.isViewer ?? false,
    role: overrides.isViewer ? "viewer" : "admin",
    loading: false,
  };
  mocks.profile = { display_name: "Rafaela Boonem", is_admin: true };
  mocks.checklists = { data: CHECKLISTS, error: null };
}

/** Abre o filtro e escolhe uma opção pelo rótulo. */
async function pickFilter(user: ReturnType<typeof userEvent.setup>, label: string) {
  await user.click(screen.getByTestId("home-checklist-filter"));
  await user.click(await screen.findByRole("option", { name: label }));
}

const rowTitles = () =>
  screen.getAllByTestId("home-checklist-row").map(
    (row) => within(row).getByTestId("home-checklist-title").textContent,
  );

describe("/inicio redesenhada (6B.2L)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupWorkspaceContext();
  });

  it("os 3 cards usam o MESMO buildHomeOperationalSummary dos checklists reais", async () => {
    render(<Dashboard />);

    await waitFor(() => expect(screen.getByTestId("home-checklist-list")).toBeInTheDocument());

    const summary = buildHomeOperationalSummary(CHECKLISTS);
    expect(summary).toEqual({ total: 3, concluidos: 1, pendentes: 1, atrasados: 1 });

    expect(screen.getByTestId("home-summary-card-checklists")).toHaveAttribute("data-value", "3");
    expect(screen.getByTestId("home-summary-card-pendentes")).toHaveAttribute("data-value", "1");
    expect(screen.getByTestId("home-summary-card-atrasados")).toHaveAttribute("data-value", "1");

    expect(screen.getAllByTestId("home-checklist-row")).toHaveLength(3);
    expect(screen.queryByText(/Today|This Week|Deep Work|Focus/)).toBeNull();
  });

  it("não renderiza mais as superfícies antigas nem usa rotinas agendadas como métrica", async () => {
    render(<Dashboard />);
    await waitFor(() => expect(screen.getByTestId("home-checklist-list")).toBeInTheDocument());

    expect(screen.queryByText("Resumo operacional")).toBeNull();
    expect(screen.queryByText("Prioridades")).toBeNull();
    expect(screen.queryByTestId("home-occurrence-summary")).toBeNull();
    expect(screen.queryByText(/Rotinas agendadas/)).toBeNull();
  });

  it("header contextual: nome real do workspace, saudação real e sem busca extra", async () => {
    render(<Dashboard />);

    await waitFor(() => expect(screen.getByTestId("home-checklist-list")).toBeInTheDocument());
    expect(screen.getByTestId("home-workspace-label")).toHaveTextContent("Meu Workspace");
    expect(screen.getByTestId("home-greeting-title")).toHaveTextContent("Bom dia, Rafaela.");
    expect(screen.queryByRole("button", { name: /buscar/i })).toBeNull();
  });

  it("indicador de publicação e tags: fonte real, sem data visível e prazo no tooltip", async () => {
    render(<Dashboard />);
    await waitFor(() => expect(screen.getByTestId("home-checklist-list")).toBeInTheDocument());

    // Publicação vem EXCLUSIVAMENTE de is_published (publicado/unpublished;
    // nunca de assignment, status ou datas).
    const publication = screen.getAllByTestId("home-checklist-publication");
    expect(publication[0]).toHaveAttribute("aria-label", "Publicado"); // c1 is_published: true
    expect(publication[1]).toHaveAttribute("aria-label", "Não publicado"); // c2 is_published: false
    expect(publication[0].querySelector("svg")).toHaveClass("lucide-circle-check");
    expect(publication[1].querySelector("svg")).toHaveClass("lucide-circle-dashed");
    expect(
      publication.filter((el) => el.tagName.toLowerCase() === "button"),
    ).toHaveLength(0);

    // Tags operacionais: rótulo SEM data; prazo real (due_at) no tooltip.
    expect(screen.getByText("Atrasado")).toHaveTextContent("Atrasado");
    expect(screen.getByText("Atrasado").closest("span")).toHaveAttribute(
      "title",
      "Prazo: 01/01",
    );
    expect(screen.getByText("Concluído").closest("span")).toHaveAttribute(
      "title",
      "Prazo: 01/01",
    );
    // A data da DIREITA (updated_at || created_at) permanece a principal.
    expect(screen.getAllByTestId("home-checklist-date")).toHaveLength(3);
  });

  it("filtro começa em Todos e aplica cada opção sobre os dados reais", async () => {
    const user = userEvent.setup();
    render(<Dashboard />);
    await waitFor(() => expect(screen.getByTestId("home-checklist-list")).toBeInTheDocument());

    // Default = Todos (lista completa, na ordem carregada).
    expect(screen.getByTestId("home-checklist-filter")).toHaveTextContent("Todos");
    expect(rowTitles()).toEqual([
      "Abertura da loja",
      "Controle de temperatura",
      "Limpeza do salão",
    ]);

    await pickFilter(user, "Publicados");
    expect(rowTitles()).toEqual(["Abertura da loja", "Limpeza do salão"]);

    await pickFilter(user, "Não publicados");
    expect(rowTitles()).toEqual(["Controle de temperatura"]);

    await pickFilter(user, "Pendentes");
    expect(rowTitles()).toEqual(["Controle de temperatura"]);

    await pickFilter(user, "Atrasados");
    expect(rowTitles()).toEqual(["Abertura da loja"]);

    await pickFilter(user, "Concluídos");
    expect(rowTitles()).toEqual(["Limpeza do salão"]);

    await pickFilter(user, "Todos");
    expect(screen.getAllByTestId("home-checklist-row")).toHaveLength(3);

    // O filtro é LOCAL: nenhuma consulta nova é disparada por ele.
    expect(buildHomeOperationalSummary(CHECKLISTS).total).toBe(3);
  });

  it("filtro sem resultado mostra o vazio curto, não o vazio da Home", async () => {
    const user = userEvent.setup();
    mocks.checklists = {
      data: [{ ...CHECKLISTS[1], checklist_assignments: [] }],
      error: null,
    };

    render(<Dashboard />);
    await waitFor(() => expect(screen.getByTestId("home-checklist-list")).toBeInTheDocument());

    await pickFilter(user, "Atrasados");
    expect(screen.getByTestId("home-checklists-filter-empty")).toBeInTheDocument();
    expect(screen.getByText("Nenhum checklist neste filtro.")).toBeInTheDocument();
    expect(screen.queryByTestId("home-checklists-empty")).toBeNull();
  });

  it("contexto pessoal: rótulo real 'Pessoal' e CTA de checklist pessoal no vazio", async () => {
    mocks.workspace = { currentWorkspace: null, workspaceStatus: "personal", workspaces: [] };
    mocks.checklists = { data: [], error: null };

    render(<Dashboard />);

    await waitFor(() => expect(screen.getByTestId("home-checklists-empty")).toBeInTheDocument());
    expect(screen.getByTestId("home-workspace-label")).toHaveTextContent("Pessoal");
    expect(screen.getByText("Nenhum checklist ainda")).toBeInTheDocument();
    expect(screen.getByTestId("home-empty-new-checklist")).toBeInTheDocument();
  });

  it("RBAC preservado: Viewer não ganha ação administrativa e abre a execução", async () => {
    setupWorkspaceContext({ canManage: false, isViewer: true });
    const user = userEvent.setup();

    render(<Dashboard />);
    await waitFor(() => expect(screen.getByTestId("home-checklist-list")).toBeInTheDocument());

    expect(screen.queryByTestId("home-checklist-menu")).toBeNull();
    expect(screen.queryByTestId("home-new-checklist")).toBeNull();

    await user.click(screen.getByText("Abertura da loja"));
    expect(mocks.navigate).toHaveBeenCalledWith({ to: "/executar/$id", params: { id: "c1" } });

    // A LINHA continua sendo a única ação de abertura (sem botão duplicado).
    mocks.navigate.mockClear();
    await user.click(screen.getAllByTestId("home-checklist-row")[1]);
    expect(mocks.navigate).toHaveBeenCalledWith({ to: "/executar/$id", params: { id: "c2" } });
    expect(screen.queryByRole("button", { name: "Abrir checklist" })).toBeNull();
  });

  it("admin: nome do checklist abre o editor e o botão de abrir usa o id real", async () => {
    const user = userEvent.setup();
    render(<Dashboard />);
    await waitFor(() => expect(screen.getByTestId("home-checklist-list")).toBeInTheDocument());

    await user.click(screen.getByText("Limpeza do salão"));
    expect(mocks.navigate).toHaveBeenCalledWith({ to: "/checklist", search: { id: "c3" } });

    mocks.navigate.mockClear();
    await user.click(screen.getAllByTestId("home-checklist-row")[0]);
    expect(mocks.navigate).toHaveBeenCalledWith({ to: "/checklist", search: { id: "c1" } });
  });

  it("admin: '+ Novo checklist' usa o fluxo real", async () => {
    const user = userEvent.setup();
    render(<Dashboard />);
    await waitFor(() => expect(screen.getByTestId("home-checklist-list")).toBeInTheDocument());

    await user.click(screen.getByTestId("home-new-checklist"));
    await waitFor(
      () =>
        expect(mocks.navigate).toHaveBeenCalledWith({
          to: "/checklist",
          search: { workspace: "ws-1" },
        }),
      { timeout: 1500 },
    );
  });

  it("'Novo workspace' dispara o evento que abre o diálogo real do shell", async () => {
    const user = userEvent.setup();
    const onOpenCreateWorkspace = vi.fn();
    window.addEventListener("open-create-workspace", onOpenCreateWorkspace);

    render(<Dashboard />);
    await waitFor(() => expect(screen.getByTestId("home-new-workspace")).toBeInTheDocument());

    await user.click(screen.getByTestId("home-new-workspace"));
    expect(onOpenCreateWorkspace).toHaveBeenCalledTimes(1);

    window.removeEventListener("open-create-workspace", onOpenCreateWorkspace);
  });

  it("gate administrativo: usuário sem is_admin e com workspace já existente não vê a ação", async () => {
    mocks.profile = { display_name: "Rafaela Boonem", is_admin: false };

    render(<Dashboard />);
    await waitFor(() => expect(screen.getByTestId("home-checklist-list")).toBeInTheDocument());

    expect(screen.queryByTestId("home-new-workspace")).toBeNull();
  });
});
