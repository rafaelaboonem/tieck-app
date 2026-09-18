/**
 * RealRecentExecutions + RecentExecutionDrawer — a interação da PESSOA.
 *
 * O que esta suíte protege:
 *   • hover/focus no avatar revela QUEM é (Tooltip com nome; unidade só quando
 *     existe de verdade);
 *   • clique no avatar abre o drawer e NÃO dispara a ação da linha;
 *   • o drawer separa "Responsável atribuído" de "Executado por", trata executor
 *     desconhecido honestamente e não inventa placeholder para campo ausente;
 *   • "Ver Checklist" só existe com `checklistId` real + navegação do host;
 *   • Escape fecha, o foco volta ao avatar e `items=[]` continua no estado vazio
 *     atual (nada de fixture).
 *
 * jsdom + Radix: o mesmo polfill local usado pelas outras suítes do produto
 * (ResizeObserver/captura de ponteiro) e o passthrough do `Avatar.Image`, porque
 * em jsdom a imagem nunca "carrega".
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { readFileSync } from "fs";
import { resolve } from "path";

Element.prototype.releasePointerCapture = () => {};
Element.prototype.scrollIntoView = () => {};
if (!("ResizeObserver" in globalThis)) {
  (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}

vi.mock("@radix-ui/react-avatar", async () => {
  const ReactModule = await import("react");
  return {
    Root: ({ children, ...props }: any) => ReactModule.createElement("span", props, children),
    Image: ({ children, onLoadingStatusChange, ...props }: any) =>
      ReactModule.createElement("img", props),
    Fallback: ({ children, ...props }: any) => ReactModule.createElement("span", props, children),
  };
});

import { RealRecentExecutions, type RecentExecution } from "../RealRecentExecutions";

const PAINEL_SRC = readFileSync(resolve(__dirname, "../../../../routes/painel.tsx"), "utf8");

/** Item mínimo: só o que a linha exige. */
function baseItem(overrides: Partial<RecentExecution> = {}): RecentExecution {
  return {
    id: "EX-1",
    checklist: "Checklist de abertura",
    executor: "Juliana Prado",
    memberId: "member-juliana",
    context: "Unidade Norte",
    statusLabel: "Concluído no prazo",
    statusTone: "done",
    occurredAt: "hoje · 08:12",
    relative: "há 2 h",
    ...overrides,
  };
}

function renderCard(items: RecentExecution[], props: Partial<Parameters<typeof RealRecentExecutions>[0]> = {}) {
  const user = userEvent.setup({ pointerEventsCheck: 0 });
  const utils = render(
    <RealRecentExecutions
      items={items}
      description="Checklists respondidos — o que acabou de acontecer na operação."
      {...props}
    />,
  );
  return { user, ...utils };
}

const avatarOf = (id = "EX-1") => screen.getByTestId(`recent-execution-avatar-${id}`);

afterEach(() => cleanup());

describe("interação do avatar (tooltip)", () => {
  it("A) hover mostra o nome da pessoa", async () => {
    const { user } = renderCard([baseItem()]);
    await user.hover(avatarOf());
    expect(await screen.findByRole("tooltip")).toHaveTextContent("Juliana Prado");
  });

  it("A2) focus por teclado mostra o mesmo nome", async () => {
    const { user } = renderCard([baseItem()]);
    await user.tab();
    await waitFor(() => expect(avatarOf()).toHaveFocus());
    expect(await screen.findByRole("tooltip")).toHaveTextContent("Juliana Prado");
  });

  it("A3) a segunda linha do tooltip só aparece com unidade real", async () => {
    const { user } = renderCard([baseItem({ unitName: "Unidade Norte" })]);
    await user.hover(avatarOf());
    expect(await screen.findByRole("tooltip")).toHaveTextContent("Unidade Norte");

    cleanup();
    const second = renderCard([baseItem({ id: "EX-2" })]);
    await second.user.hover(avatarOf("EX-2"));
    // Sem `unitName` o tooltip traz só o nome — o contexto da LINHA não sobe
    // para o tooltip, e não existe segunda linha.
    const tip = await screen.findByRole("tooltip");
    expect(tip).toHaveTextContent("Juliana Prado");
    expect(tip).not.toHaveTextContent("Unidade Norte");
  });

  it("o avatar é botão real com rótulo acessível", () => {
    renderCard([baseItem()]);
    const avatar = avatarOf();
    expect(avatar.tagName).toBe("BUTTON");
    expect(avatar).toHaveAttribute("aria-label", "Ver detalhes de Juliana Prado");
  });
});

describe("drawer da execução", () => {
  it("B) clique no avatar abre o drawer", async () => {
    const { user } = renderCard([baseItem()]);
    expect(screen.queryByTestId("recent-execution-drawer")).toBeNull();
    await user.click(avatarOf());
    expect(await screen.findByTestId("recent-execution-drawer")).toBeInTheDocument();
  });

  it("C) o drawer mostra o nome da pessoa", async () => {
    const { user } = renderCard([baseItem({ executorName: "Juliana Prado" })]);
    await user.click(avatarOf());
    await screen.findByTestId("recent-execution-drawer");
    expect(screen.getByTestId("drawer-executor")).toHaveTextContent("Juliana Prado");
  });

  it("D) campo ausente não gera placeholder falso", async () => {
    const { user } = renderCard([baseItem()]);
    await user.click(avatarOf());
    await screen.findByTestId("recent-execution-drawer");

    // Sem dado real, a linha não existe.
    expect(screen.queryByTestId("drawer-field-unidade")).toBeNull();
    expect(screen.queryByTestId("drawer-field-turno")).toBeNull();
    expect(screen.queryByTestId("drawer-field-previsto")).toBeNull();
    expect(screen.queryByTestId("drawer-field-concluído")).toBeNull();
    expect(screen.queryByTestId("drawer-field-conformidade")).toBeNull();
    expect(screen.queryByTestId("drawer-field-resultado")).toBeNull();
    // E nada de "—" de preenchimento.
    expect(screen.getByTestId("recent-execution-drawer").textContent).not.toContain("—");
  });

  it("D2) os campos existentes aparecem formatados", async () => {
    const { user } = renderCard([
      baseItem({
        unitName: "Unidade Norte",
        shiftName: "Manhã",
        dueAt: "2026-09-17T08:00:00",
        completedAt: "2026-09-17T08:12:00",
        resultLabel: "Conforme",
        compliancePercentage: 94,
      }),
    ]);
    await user.click(avatarOf());
    await screen.findByTestId("recent-execution-drawer");

    expect(screen.getByTestId("drawer-field-unidade")).toHaveTextContent("Unidade Norte");
    expect(screen.getByTestId("drawer-field-turno")).toHaveTextContent("Manhã");
    expect(screen.getByTestId("drawer-field-previsto")).toHaveTextContent("08:00");
    expect(screen.getByTestId("drawer-field-concluído")).toHaveTextContent("08:12");
    expect(screen.getByTestId("drawer-field-conformidade")).toHaveTextContent("94%");
  });

  it("E) responsável atribuído e executor aparecem separados", async () => {
    const { user } = renderCard([
      baseItem({ assignedName: "Bruno Lima", executorName: "Ana Ribeiro", executor: "Ana Ribeiro" }),
    ]);
    await user.click(avatarOf());
    await screen.findByTestId("recent-execution-drawer");

    expect(screen.getByTestId("drawer-assigned")).toHaveTextContent("Bruno Lima");
    expect(screen.getByTestId("drawer-executor")).toHaveTextContent("Ana Ribeiro");
  });

  it("E2) papel do workspace é rotulado como papel, nunca como cargo", async () => {
    const { user } = renderCard([baseItem({ roleLabel: "Editor" })]);
    await user.click(avatarOf());
    await screen.findByTestId("recent-execution-drawer");
    const text = screen.getByTestId("recent-execution-drawer").textContent ?? "";
    expect(text).toContain("Papel no workspace");
    expect(text).not.toContain("Cargo");
  });

  it("F) executor desconhecido é tratado honestamente", async () => {
    const { user } = renderCard([
      baseItem({
        executor: "Respondente não identificado",
        memberId: undefined,
        executorIdentified: false,
        executorName: undefined,
      }),
    ]);
    await user.click(avatarOf());
    await screen.findByTestId("recent-execution-drawer");
    expect(screen.getByTestId("drawer-executor")).toHaveTextContent("Respondente não identificado");
  });

  it("J) Escape fecha o drawer", async () => {
    const { user } = renderCard([baseItem()]);
    await user.click(avatarOf());
    await screen.findByTestId("recent-execution-drawer");
    await user.keyboard("{Escape}");
    await waitFor(() =>
      expect(screen.queryByTestId("recent-execution-drawer")).not.toBeInTheDocument(),
    );
  });

  it("K) o foco volta para o avatar ao fechar", async () => {
    const { user } = renderCard([baseItem()]);
    const avatar = avatarOf();
    await user.click(avatar);
    await screen.findByTestId("recent-execution-drawer");
    await user.keyboard("{Escape}");
    await waitFor(() => expect(avatar).toHaveFocus());
  });
});

describe("Ver Checklist", () => {
  it("G) usa o checklistId REAL do item", async () => {
    const onOpenChecklist = vi.fn();
    const { user } = renderCard([baseItem({ checklistId: "chk-987" })], { onOpenChecklist });
    await user.click(avatarOf());
    await user.click(await screen.findByTestId("drawer-open-checklist"));
    expect(onOpenChecklist).toHaveBeenCalledTimes(1);
    expect(onOpenChecklist).toHaveBeenCalledWith("chk-987");
  });

  it("G2) nunca usa o id da LINHA como id do checklist", async () => {
    const onOpenChecklist = vi.fn();
    const { user } = renderCard([baseItem({ id: "EX-1", checklistId: "chk-987" })], {
      onOpenChecklist,
    });
    await user.click(avatarOf());
    await user.click(await screen.findByTestId("drawer-open-checklist"));
    expect(onOpenChecklist).not.toHaveBeenCalledWith("EX-1");
  });

  it("L) item sem checklistId não oferece ação falsa", async () => {
    const onOpenChecklist = vi.fn();
    const { user } = renderCard([baseItem({ checklistId: undefined })], { onOpenChecklist });
    await user.click(avatarOf());
    await screen.findByTestId("recent-execution-drawer");
    expect(screen.queryByTestId("drawer-open-checklist")).toBeNull();
    expect(onOpenChecklist).not.toHaveBeenCalled();
  });

  it("L2) sem navegação do host também não existe botão", async () => {
    const { user } = renderCard([baseItem({ checklistId: "chk-987" })]);
    await user.click(avatarOf());
    await screen.findByTestId("recent-execution-drawer");
    expect(screen.queryByTestId("drawer-open-checklist")).toBeNull();
  });

  it("H) a rota usada pelo /painel é a rota real do produto", () => {
    // Mesmo destino de Recentes/início/organizar: `/checklist?id=<checklistId>`.
    expect(PAINEL_SRC).toContain('navigate({ to: "/checklist", search: { id: checklistId } })');
    expect(PAINEL_SRC).not.toContain("/execucoes/");
  });
});

describe("conflito com a linha e estado vazio", () => {
  it("I) clique no avatar não aciona a ação da linha", async () => {
    const onOpen = vi.fn();
    const { user } = renderCard([baseItem({ checklistId: "chk-987" })], { onOpen });
    await user.click(avatarOf());
    await screen.findByTestId("recent-execution-drawer");
    expect(onOpen).not.toHaveBeenCalled();

    // E a linha continua com a ação dela, intacta.
    await user.keyboard("{Escape}");
    await waitFor(() =>
      expect(screen.queryByTestId("recent-execution-drawer")).not.toBeInTheDocument(),
    );
    await user.click(screen.getByText("Checklist de abertura"));
    expect(onOpen).toHaveBeenCalledWith("EX-1");
  });

  it("M) items=[] mantém o estado vazio honesto", () => {
    renderCard([], {
      unavailable: {
        title: "Aguardando conexão de dados",
        helper: "Nenhum contrato carregado pela rota devolve respostas individuais.",
      },
    });
    expect(screen.getByText("Aguardando conexão de dados")).toBeInTheDocument();
    expect(screen.queryByTestId("recent-execution-drawer")).toBeNull();
    // Nenhuma linha, nenhum avatar: nada é fabricado.
    expect(screen.queryByTestId("recent-execution-avatar-EX-1")).toBeNull();
  });
});

describe("fonte real: loading, erro e preferência de avatar (6B.2E)", () => {
  it("T) erro NÃO pode ser apresentado como 'sem execuções'", async () => {
    const onRetry = vi.fn();
    const { user } = renderCard([], { error: true, onRetry });

    expect(screen.getByTestId("recent-executions-error")).toBeInTheDocument();
    expect(
      screen.getByText("Não foi possível carregar as últimas execuções."),
    ).toBeInTheDocument();
    expect(screen.queryByText("Sem execuções no período")).toBeNull();

    await user.click(screen.getByRole("button", { name: "Tentar novamente" }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("empty state real usa a linguagem da seção (rotinas concluídas)", () => {
    renderCard([]);
    expect(screen.getByText("Sem execuções no período")).toBeInTheDocument();
    expect(
      screen.getByText("Nenhuma rotina foi concluída no recorte selecionado."),
    ).toBeInTheDocument();
  });

  it("loading mostra esqueleto e nunca o estado vazio", () => {
    renderCard([], { loading: true });
    expect(screen.getByTestId("recent-executions-loading")).toBeInTheDocument();
    expect(screen.queryByText("Sem execuções no período")).toBeNull();
    expect(screen.queryByTestId("recent-executions-error")).toBeNull();
  });

  it("refetch com itens em tela mantém as linhas (sem piscar vazio)", () => {
    renderCard([baseItem()], { loading: true });
    expect(screen.getByTestId("recent-execution-avatar-EX-1")).toBeInTheDocument();
    expect(screen.queryByTestId("recent-executions-loading")).toBeNull();
  });

  it("O/P/Q) a preferência REAL do membro chega ao MemberAvatar", () => {
    const { container } = renderCard([
      baseItem({
        avatarUrl: "https://cdn.exemplo/juliana.png",
        avatarDisplayMode: "illustrated",
        selectedAvatarId: "avatar-14",
      }),
    ]);
    const avatar = container.querySelector('[data-slot="member-avatar"]');
    expect(avatar).toHaveAttribute("data-avatar-display-mode", "illustrated");
    // A ilustração escolhida vence a foto: a imagem renderizada é o asset do
    // registry, não a foto do perfil.
    const image = container.querySelector('[data-slot="member-avatar-photo"]');
    expect(image?.getAttribute("src")).toContain("avatar-14");
    expect(image?.getAttribute("src")).not.toContain("cdn.exemplo");
  });

  it("S) modo photo usa a foto real do perfil", () => {
    const { container } = renderCard([
      baseItem({ avatarUrl: "https://cdn.exemplo/juliana.png", avatarDisplayMode: "photo" }),
    ]);
    const image = container.querySelector('[data-slot="member-avatar-photo"]');
    expect(image?.getAttribute("src")).toBe("https://cdn.exemplo/juliana.png");
    expect(container.querySelector('[data-slot="member-avatar"]')).toHaveAttribute(
      "data-avatar-display-mode",
      "photo",
    );
  });

  it("R) modo automatic ignora a foto (ilustração determinística)", () => {
    const { container } = renderCard([
      baseItem({ avatarUrl: "https://cdn.exemplo/juliana.png", avatarDisplayMode: "automatic" }),
    ]);
    const image = container.querySelector('[data-slot="member-avatar-photo"]');
    expect(image?.getAttribute("src")).toContain("avatar-");
    expect(image?.getAttribute("src")).not.toContain("cdn.exemplo");
    expect(container.querySelector('[data-slot="member-avatar"]')).toHaveAttribute(
      "data-avatar-display-mode",
      "automatic",
    );
  });

  it("exatamente um erro técnico visível: a mensagem do card é a única do estado", () => {
    renderCard([], { error: true });
    const card = screen.getByText("Últimas execuções").closest("div");
    expect(card?.textContent ?? "").not.toContain("PGRST");
    expect(card?.textContent ?? "").not.toContain("contrato");
  });
});

describe("drawer: identidade ausente não vira texto de enfeite", () => {
  it("sem responsável real, a linha 'Responsável atribuído' não existe", async () => {
    const { user } = renderCard([baseItem({ assignedName: undefined })]);
    await user.click(avatarOf());
    await screen.findByTestId("recent-execution-drawer");

    expect(screen.queryByTestId("drawer-assigned")).toBeNull();
    expect(screen.getByTestId("recent-execution-drawer").textContent).not.toContain(
      "Não registrado",
    );
    // O executor REAL continua visível.
    expect(screen.getByTestId("drawer-executor")).toHaveTextContent("Juliana Prado");
  });
});
