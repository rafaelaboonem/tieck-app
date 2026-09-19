import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HomeTopbar } from "../HomeTopbar";
import { HomeGreeting } from "../HomeGreeting";
import { HomeSummaryCards } from "../HomeSummaryCards";
import { HomeChecklistList, type HomeChecklistListActions } from "../HomeChecklistList";
import { buildHomeOperationalSummary } from "@/lib/home-operational-summary";

/**
 * Home 6B.2L — apresentação (rodada de refinamento).
 * Prova que a Home desenha DADOS REAIS (nada hardcoded), a anatomia da linha
 * em UMA altura (status junto ao título, sem ícone; publicação como indicador
 * NÃO clicável à direita) e que nenhum dado da referência visual (Papaliur:
 * "Today"/"This Week"/"Focus Deep Work") entrou no produto.
 */

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

function actions(overrides: Partial<HomeChecklistListActions> = {}): HomeChecklistListActions {
  return {
    onOpen: vi.fn(),
    onToggleSelect: vi.fn(),
    onSettings: vi.fn(),
    onEdit: vi.fn(),
    onSelect: vi.fn(),
    onRename: vi.fn(),
    onCopyLink: vi.fn(),
    onDuplicate: vi.fn(),
    onDelete: vi.fn(),
    ...overrides,
  };
}

const emptyState = { title: "Nenhum checklist ainda", description: "helper real" };

function renderList(props: Partial<React.ComponentProps<typeof HomeChecklistList>> = {}) {
  return render(
    <HomeChecklistList
      checklists={CHECKLISTS}
      canManage
      selectionMode={false}
      selectedIds={[]}
      actions={actions()}
      emptyState={emptyState}
      {...props}
    />,
  );
}

describe("HomeSummaryCards (6B.2L)", () => {
  it("usa EXATAMENTE buildHomeOperationalSummary — nenhum número hardcoded", () => {
    const summary = buildHomeOperationalSummary(CHECKLISTS);

    const { unmount } = render(<HomeSummaryCards checklists={CHECKLISTS} />);

    expect(screen.getByTestId("home-summary-card-checklists")).toHaveAttribute(
      "data-value",
      String(summary.total),
    );
    expect(screen.getByTestId("home-summary-card-pendentes")).toHaveAttribute(
      "data-value",
      String(summary.pendentes),
    );
    expect(screen.getByTestId("home-summary-card-atrasados")).toHaveAttribute(
      "data-value",
      String(summary.atrasados),
    );
    expect(summary).toEqual({ total: 3, concluidos: 1, pendentes: 1, atrasados: 1 });
    expect(screen.getByText("disponíveis neste contexto")).toBeInTheDocument();
    expect(screen.getByText("aguardando conclusão")).toBeInTheDocument();
    expect(screen.getByText("exigem atenção")).toBeInTheDocument();
    unmount();

    render(<HomeSummaryCards checklists={[]} />);
    expect(screen.getByTestId("home-summary-card-checklists")).toHaveAttribute("data-value", "0");
    expect(screen.getByTestId("home-summary-card-pendentes")).toHaveAttribute("data-value", "0");
    expect(screen.getByTestId("home-summary-card-atrasados")).toHaveAttribute("data-value", "0");
  });

  it("não traz dados de exemplo da referência visual externa", () => {
    render(<HomeSummaryCards checklists={CHECKLISTS} />);
    expect(screen.queryByText(/Today|This Week|Deep Work|Focus/)).toBeNull();
  });
});

describe("HomeGreeting (6B.2L)", () => {
  it("saudação com o nome real e fallback neutro", () => {
    const { unmount } = render(<HomeGreeting firstName="Rafaela" />);
    expect(screen.getByTestId("home-greeting-title")).toHaveTextContent("Bom dia, Rafaela.");
    expect(screen.getByTestId("home-greeting-subtitle")).toHaveTextContent(
      "Vamos organizar o que precisa da sua atenção hoje.",
    );
    unmount();

    render(<HomeGreeting firstName={null} />);
    expect(screen.getByTestId("home-greeting-title")).toHaveTextContent("Bom dia.");
  });
});

describe("HomeTopbar (6B.2L)", () => {
  const base = {
    workspaceLabel: "Meu Workspace",
    isMobile: false,
    sidebarOpen: true,
    canCreateWorkspace: true,
    onCreateWorkspace: vi.fn(),
    canCreateChecklist: true,
    onCreateChecklist: vi.fn(),
  };

  it("mostra o nome REAL do workspace e dispara as ações reais", async () => {
    const user = userEvent.setup();
    const onCreateChecklist = vi.fn();
    const onCreateWorkspace = vi.fn();
    render(
      <HomeTopbar
        {...base}
        onCreateChecklist={onCreateChecklist}
        onCreateWorkspace={onCreateWorkspace}
      />,
    );

    expect(screen.getByTestId("home-workspace-label")).toHaveTextContent("Meu Workspace");

    await user.click(screen.getByTestId("home-new-checklist"));
    expect(onCreateChecklist).toHaveBeenCalledTimes(1);

    await user.click(screen.getByTestId("home-new-workspace"));
    expect(onCreateWorkspace).toHaveBeenCalledTimes(1);
  });

  it("não renderiza busca extra na Home (o sistema global continua no shell)", () => {
    render(<HomeTopbar {...base} />);
    expect(screen.queryByRole("button", { name: /buscar/i })).toBeNull();
  });

  it("respeita o RBAC: sem permissão, a ação administrativa não é oferecida", () => {
    render(<HomeTopbar {...base} canCreateWorkspace={false} canCreateChecklist={false} />);
    expect(screen.queryByTestId("home-new-workspace")).toBeNull();
    expect(screen.queryByTestId("home-new-checklist")).toBeNull();
  });
});

describe("HomeChecklistList (6B.2L)", () => {
  it("renderiza os checklists REAIS com publicação, status e data reais", () => {
    renderList();

    expect(screen.getByTestId("home-checklist-list")).toHaveAttribute("data-count", "3");
    expect(screen.getAllByTestId("home-checklist-row")).toHaveLength(3);

    expect(screen.getByText("Abertura da loja")).toBeInTheDocument();
    expect(screen.getByText("Controle de temperatura")).toBeInTheDocument();
    expect(screen.getByText("Limpeza do salão")).toBeInTheDocument();

    // Publicação real (is_published) como INDICADOR com tooltip/aria-label —
    // não existe mais a badge textual "Publicado"/"Não publicado".
    expect(screen.queryByText("Publicado")).toBeNull();
    expect(screen.queryByText("Não publicado")).toBeNull();
    const publication = screen.getAllByTestId("home-checklist-publication");
    expect(publication).toHaveLength(3);
    expect(publication[0]).toHaveAttribute("aria-label", "Publicado");
    expect(publication[0]).toHaveAttribute("title", "Publicado");
    expect(publication[1]).toHaveAttribute("aria-label", "Não publicado");
    expect(publication[1]).toHaveAttribute("title", "Não publicado");
    expect(publication[2]).toHaveAttribute("aria-label", "Publicado");
    // Indicador não é botão: não duplica a ação da linha.
    expect(
      publication.filter((el) => el.tagName.toLowerCase() === "button"),
    ).toHaveLength(0);
    // Verde discreto quando publicado; neutro tracejado quando não.
    expect(publication[0].className).toContain("text-green-600");
    expect(publication[1].className).toContain("text-neutral-300");
    expect(publication[0].querySelector("svg")).toHaveClass("lucide-circle-check");
    expect(publication[1].querySelector("svg")).toHaveClass("lucide-circle-dashed");

    // Status REAL vindo de getAssignmentStatus/getStatusBadge, junto ao título:
    // rótulo SEM data visível; o prazo real (due_at) segue no tooltip da tag.
    const atrasado = screen.getByText("Atrasado").closest("span");
    expect(atrasado?.textContent).toBe("Atrasado"); // sem "· 01/01" no texto
    expect(atrasado).toHaveAttribute("title", "Prazo: 01/01");
    expect(screen.getByText("Pendente").closest("span")).toHaveAttribute(
      "title",
      "Prazo: 01/01",
    );
    expect(screen.getByText("Concluído").closest("span")).toHaveAttribute(
      "title",
      "Prazo: 01/01",
    );
    expect(atrasado?.querySelector("svg")).toBeNull(); // sem ícone interno no badge
    // Status fica no MESMO bloco do título (primeira linha, sem faixa dedicada).
    const firstRow = screen.getAllByTestId("home-checklist-row")[0];
    expect(
      within(firstRow).getByTestId("home-checklist-title").parentElement?.contains(
        screen.getByText("Atrasado"),
      ),
    ).toBe(true);

    // Data real já usada hoje (updated_at || created_at).
    const expectedDate = new Date("2026-09-16T12:00:00.000Z").toLocaleDateString("pt-BR");
    expect(screen.getByText(expectedDate)).toBeInTheDocument();
  });

  it("a linha NÃO começa mais com o ícone/quadrado antigo", () => {
    renderList();

    const row = screen.getAllByTestId("home-checklist-row")[0];
    const title = within(row).getByTestId("home-checklist-title");
    // Nada (nenhum svg) aparece ANTES do título dentro da linha.
    const before = Array.from(row.querySelectorAll("svg")).filter(
      (svg) => svg.compareDocumentPosition(title) & Node.DOCUMENT_POSITION_FOLLOWING,
    );
    expect(before).toEqual([]);
    // E o primeiro bloco da linha é o conteúdo (título), não um tile de ícone.
    expect(row.firstElementChild?.firstElementChild).toBe(title.parentElement);
  });

  it("não existe mais botão duplicado 'Abrir checklist': a linha inteira abre", async () => {
    const user = userEvent.setup();
    const onOpen = vi.fn();
    renderList({ actions: actions({ onOpen }) });

    expect(screen.queryByRole("button", { name: "Abrir checklist" })).toBeNull();
    expect(screen.queryByTestId("home-checklist-open")).toBeNull();

    // A LINHA continua sendo a ação principal com o checklist real.
    await user.click(screen.getAllByTestId("home-checklist-row")[0]);
    expect(onOpen).toHaveBeenCalledWith(CHECKLISTS[0]);

    // A data segue no bloco à direita, junto do indicador de publicação.
    expect(screen.getAllByTestId("home-checklist-date")).toHaveLength(3);
  });

  it("linha clicável abre o checklist e o Viewer não ganha ação administrativa", async () => {
    const user = userEvent.setup();
    const onOpen = vi.fn();
    const onSettings = vi.fn();
    const { unmount } = renderList({ actions: actions({ onOpen, onSettings }) });

    await user.click(screen.getByText("Abertura da loja"));
    expect(onOpen).toHaveBeenCalledWith(CHECKLISTS[0]);

    await user.click(screen.getAllByTestId("home-checklist-menu")[0]);
    await user.click(await screen.findByText("Configurações"));
    expect(onSettings).toHaveBeenCalledWith(CHECKLISTS[0]);
    unmount();

    renderList({ canManage: false });
    expect(screen.queryByTestId("home-checklist-menu")).toBeNull();
    expect(screen.queryByText("Excluir")).toBeNull();
    // O Viewer continua abrindo pela linha (navegação principal preservada).
    expect(screen.getAllByTestId("home-checklist-row")).toHaveLength(3);
  });

  it("ações da direita não disparam o clique da linha", async () => {
    const user = userEvent.setup();
    const onOpen = vi.fn();
    const onToggleSelect = vi.fn();
    renderList({ actions: actions({ onOpen, onToggleSelect }) });

    await user.click(screen.getAllByTestId("home-checklist-menu")[0]);
    expect(onOpen).not.toHaveBeenCalled();
    await user.keyboard("{Escape}");

    renderList({
      selectionMode: true,
      selectedIds: [],
      actions: actions({ onOpen, onToggleSelect }),
    });
    onOpen.mockClear();
    await user.click(screen.getAllByTestId("home-checklist-checkbox")[0]);
    expect(onToggleSelect).toHaveBeenCalledWith("c1");
    expect(onOpen).not.toHaveBeenCalled();
  });

  it("modo seleção liga/desliga pelo checkbox e pela linha", async () => {
    const user = userEvent.setup();
    const onToggleSelect = vi.fn();
    renderList({
      selectionMode: true,
      selectedIds: ["c2"],
      actions: actions({ onToggleSelect }),
    });

    expect(screen.getAllByTestId("home-checklist-checkbox")[1]).toBeChecked();
    await user.click(screen.getAllByTestId("home-checklist-row")[0]);
    expect(onToggleSelect).toHaveBeenCalledWith("c1");
    expect(screen.getAllByTestId("home-checklist-row")[1]).toHaveAttribute(
      "data-selected",
      "true",
    );
  });

  it("estado vazio real (sem filtro) mantém o CTA só quando permitido", async () => {
    const user = userEvent.setup();
    const onCreate = vi.fn();
    const { unmount } = renderList({
      checklists: [],
      emptyState: { ...emptyState, onCreate },
    });

    expect(screen.getByTestId("home-checklists-empty")).toBeInTheDocument();
    expect(screen.getByText("Nenhum checklist ainda")).toBeInTheDocument();
    await user.click(screen.getByTestId("home-empty-new-checklist"));
    expect(onCreate).toHaveBeenCalledTimes(1);
    unmount();

    renderList({ checklists: [], canManage: false });
    expect(screen.queryByTestId("home-empty-new-checklist")).toBeNull();
    expect(screen.queryByTestId("home-checklist-row")).toBeNull();
  });

  it("filtro sem resultado mostra a mensagem curta, sem ilustração", () => {
    renderList({ checklists: [], filtered: true });

    expect(screen.getByTestId("home-checklists-filter-empty")).toBeInTheDocument();
    expect(screen.getByText("Nenhum checklist neste filtro.")).toBeInTheDocument();
    expect(screen.queryByTestId("home-checklists-empty")).toBeNull();
    expect(screen.queryByTestId("home-empty-new-checklist")).toBeNull();
  });
});
