/**
 * RealOperationalInsights — conteúdo e estados do card de insights.
 *
 * Cobre o que a revisão visual pediu: nome do turno, bucket "Sem turno
 * definido", conformidade formatada, meta, volume concluído, no prazo, com
 * atraso, e as exceções SÓ quando existem (zero não é informação). Também os três
 * estados (loading/erro com retry/vazio) e a ordem estável (sem turno por
 * último, nunca ranking).
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";

import { RealOperationalInsights } from "../RealOperationalInsights";
import type { ShiftComplianceRow } from "@/lib/shift-compliance";

const TARGET = 90;

function shift(overrides: Partial<ShiftComplianceRow> & Pick<ShiftComplianceRow, "shiftId" | "shiftName">): ShiftComplianceRow {
  const total = overrides.totalScheduledTasks ?? 20;
  const completed = overrides.completedTasks ?? 18;
  return {
    totalScheduledTasks: total,
    completedTasks: completed,
    completedOnTime: 16,
    completedLate: 2,
    overdueOpenTasks: 0,
    criticalFailures: 0,
    pendingEvidences: 0,
    dueWeightTotal: 40,
    dueWeightDone: 37,
    dueCompliancePercentage: 92.4,
    completionPercentage: total > 0 ? Math.round((1000 * completed) / total) / 10 : null,
    ...overrides,
  };
}

const MANHA = shift({ shiftId: "s-manha", shiftName: "Manhã" });
const TARDE = shift({
  shiftId: "s-tarde",
  shiftName: "Tarde",
  totalScheduledTasks: 20,
  completedTasks: 15,
  completedOnTime: 13,
  completedLate: 2,
  overdueOpenTasks: 2,
  dueWeightTotal: 50,
  dueWeightDone: 42,
  dueCompliancePercentage: 84,
  completionPercentage: 75,
});
const NOITE = shift({
  shiftId: "s-noite",
  shiftName: "Noite",
  totalScheduledTasks: 14,
  completedTasks: 8,
  completedOnTime: 6,
  completedLate: 2,
  overdueOpenTasks: 0,
  criticalFailures: 1,
  pendingEvidences: 3,
  dueWeightTotal: 28,
  dueWeightDone: 20,
  dueCompliancePercentage: 71.5,
  completionPercentage: 57.1,
});
const SEM_TURNO = shift({
  shiftId: null,
  shiftName: null,
  totalScheduledTasks: 3,
  completedTasks: 3,
  completedOnTime: 3,
  completedLate: 0,
  dueWeightTotal: 6,
  dueWeightDone: 6,
  dueCompliancePercentage: 100,
  completionPercentage: 100,
});

const ALL = [MANHA, TARDE, NOITE, SEM_TURNO];

beforeEach(() => {
  cleanup();
});

/**
 * Busca o bloco pelo ID REAL do turno (nunca por índice): a ordem exibida é
 * alfabética por nome, então índice acoplaria o teste à ordenação.
 */
function block(shiftId: string): HTMLElement {
  const el = screen
    .getAllByTestId("shift-insight")
    .find((node) => node.getAttribute("data-shift-id") === shiftId);
  if (!el) throw new Error(`bloco do turno ${shiftId} não encontrado`);
  return el;
}

describe("loading / erro / vazio", () => {
  it("AA) loading mostra esqueleto e nenhum bloco de turno", () => {
    render(<RealOperationalInsights rows={[]} target={TARGET} loading />);

    expect(screen.getByTestId("operational-insights-loading")).toBeTruthy();
    expect(screen.queryAllByTestId("shift-insight")).toHaveLength(0);
    expect(screen.queryByTestId("operational-insights-empty")).toBeNull();
    expect(screen.queryByTestId("operational-insights-error")).toBeNull();
  });

  it("AB) erro mostra mensagem + retry, nunca o vazio", () => {
    const onRetry = vi.fn();
    render(<RealOperationalInsights rows={[]} target={TARGET} error onRetry={onRetry} />);

    expect(screen.getByTestId("operational-insights-error").textContent).toContain(
      "Não foi possível carregar os insights da operação.",
    );
    expect(screen.queryByTestId("operational-insights-empty")).toBeNull();

    screen.getByRole("button", { name: "Tentar novamente" }).click();
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("Z) sem linhas no recorte → vazio honesto", () => {
    render(<RealOperationalInsights rows={[]} target={TARGET} />);

    const empty = screen.getByTestId("operational-insights-empty");
    expect(empty.textContent).toContain("Sem dados por turno no período");
    expect(empty.textContent).toContain(
      "Nenhuma tarefa programada foi encontrada para o recorte selecionado.",
    );
    expect(screen.queryAllByTestId("shift-insight")).toHaveLength(0);
  });

  it("Z) turnos só com zeros também são vazio (nenhum bloco de zeros)", () => {
    const zero = shift({
      shiftId: "s-zero",
      shiftName: "Manhã",
      totalScheduledTasks: 0,
      completedTasks: 0,
      completedOnTime: 0,
      completedLate: 0,
      dueWeightTotal: 0,
      dueWeightDone: 0,
      dueCompliancePercentage: null,
      completionPercentage: null,
    });
    render(<RealOperationalInsights rows={[zero]} target={TARGET} />);

    expect(screen.getByTestId("operational-insights-empty")).toBeTruthy();
  });
});

describe("conteúdo por turno", () => {
  it("P) cada turno aparece com o próprio nome", () => {
    render(<RealOperationalInsights rows={ALL} target={TARGET} />);

    expect(block("s-manha").textContent).toContain("Manhã");
    expect(block("s-tarde").textContent).toContain("Tarde");
    expect(block("s-noite").textContent).toContain("Noite");
    expect(screen.getAllByTestId("shift-insight")).toHaveLength(4);
  });

  it("Q) turno nulo aparece como \"Sem turno definido\", sem id fake no DOM", () => {
    render(<RealOperationalInsights rows={ALL} target={TARGET} />);

    const blocks = screen.getAllByTestId("shift-insight");
    const last = blocks[blocks.length - 1];
    expect(last.textContent).toContain("Sem turno definido");
    expect(last.getAttribute("data-shift-id")).toBe("");
    // Nenhum rótulo interno de id vaza para a tela.
    expect(document.body.textContent).not.toContain("s-manha");
    expect(document.body.textContent).not.toContain("null");
  });

  it("R) conformidade formatada com uma casa decimal (vírgula)", () => {
    render(<RealOperationalInsights rows={ALL} target={TARGET} />);

    expect(block("s-manha").textContent).toContain("92,4%");
    expect(block("s-tarde").textContent).toContain("84,0%");
    expect(block("s-noite").textContent).toContain("71,5%");
  });

  it("S) a meta operacional do painel aparece em cada bloco", () => {
    render(<RealOperationalInsights rows={ALL} target={TARGET} />);

    for (const block of screen.getAllByTestId("shift-insight")) {
      expect(block.textContent).toContain("Meta operacional 90%");
    }
  });

  it("T) concluídas no formato X/Y", () => {
    render(<RealOperationalInsights rows={ALL} target={TARGET} />);

    const manha = block("s-manha");
    expect(manha.textContent).toContain("Concluídas");
    expect(manha.textContent).toContain("18/20");
    expect(manha.textContent).toContain("90,0% do programado");
  });

  it("U/V) no prazo e com atraso sempre visíveis", () => {
    render(<RealOperationalInsights rows={ALL} target={TARGET} />);

    const manha = block("s-manha").textContent ?? "";
    expect(manha).toContain("No prazo");
    expect(manha).toContain("16");
    expect(manha).toContain("Com atraso");
    expect(manha).toContain("2");
  });

  it("W) atrasos abertos só aparecem quando > 0", () => {
    render(<RealOperationalInsights rows={ALL} target={TARGET} />);

    expect(block("s-manha").querySelector("[data-testid='shift-overdue-open']")).toBeNull();
    expect(block("s-noite").querySelector("[data-testid='shift-overdue-open']")).toBeNull();
    const tarde = block("s-tarde").querySelector("[data-testid='shift-overdue-open']")?.textContent;
    expect(tarde).toContain("Abertas em atraso");
    expect(tarde).toContain("2");
  });

  it("X) falhas críticas só aparecem quando > 0", () => {
    render(<RealOperationalInsights rows={ALL} target={TARGET} />);

    expect(block("s-manha").querySelector("[data-testid='shift-critical']")).toBeNull();
    expect(block("s-noite").querySelector("[data-testid='shift-critical']")?.textContent).toContain(
      "Falhas críticas",
    );
  });

  it("Y) evidências pendentes só aparecem quando > 0", () => {
    render(<RealOperationalInsights rows={ALL} target={TARGET} />);

    expect(block("s-manha").querySelector("[data-testid='shift-evidences']")).toBeNull();
    expect(block("s-noite").querySelector("[data-testid='shift-evidences']")?.textContent).toContain(
      "Evidências pendentes",
    );
  });

  it("status usa a regra canônica do domínio (nada de classificação paralela)", () => {
    render(<RealOperationalInsights rows={ALL} target={TARGET} />);

    // A mesma precedência de `getOperationalStatus`: falha → crítico;
    // conformidade < 90 OU conclusão com atraso/atraso aberto → atenção.
    expect(block("s-noite").textContent).toContain("Crítico"); // 1 falha crítica
    expect(block("s-tarde").textContent).toContain("Atenção"); // 84,0% + 2 abertas
    expect(block("s-manha").textContent).toContain("Atenção"); // 2 concluídas com atraso
    expect(block("").textContent).toContain("No padrão"); // 100% e nada atrasado
  });

  it("barra expõe o valor por acessibilidade e sem denominador vira '—'", () => {
    const semDenominador = shift({
      shiftId: "s-x",
      shiftName: "Extra",
      dueWeightTotal: 0,
      dueWeightDone: 0,
      dueCompliancePercentage: null,
    });
    render(<RealOperationalInsights rows={[MANHA, semDenominador]} target={TARGET} />);

    const manhaBar = block("s-manha").querySelector("[role='progressbar']");
    const extraBar = block("s-x").querySelector("[role='progressbar']");
    expect(manhaBar?.getAttribute("aria-valuenow")).toBe("92.4");
    expect(manhaBar?.getAttribute("aria-valuetext")).toBe("92,4%");
    expect(extraBar?.getAttribute("aria-valuetext")).toBe(
      "Sem tarefas com prazo vencido no período",
    );
    expect(block("s-x").textContent).toContain("—");
  });

  it("ordem: alfabética com 'Sem turno definido' por último (não é ranking)", () => {
    render(<RealOperationalInsights rows={[NOITE, SEM_TURNO, MANHA, TARDE]} target={TARGET} />);

    const order = screen
      .getAllByTestId("shift-insight")
      .map((el) => el.getAttribute("data-shift-id"));
    // Manhã · Noite · Tarde (alfabético) e o bucket sem turno por último — mesmo
    // tendo sido passado em outra ordem e apesar do desempenho de cada um.
    expect(order).toEqual(["s-manha", "s-noite", "s-tarde", ""]);
  });

  it("é o card ESQUERDO da seção Insights: título/descrição de conformidade por turno", () => {
    render(<RealOperationalInsights rows={ALL} target={TARGET} />);

    const card = screen.getByTestId("operational-insights").textContent ?? "";
    // O rótulo "Insights da operação" passou a ser o título EXTERNO da seção
    // (PanelDashboard); o card é apresentado como "Conformidade por turno".
    expect(card).toContain("Conformidade por turno");
    expect(card).toContain("Conformidade ponderada das tarefas por turno no recorte selecionado");
    expect(card).not.toContain("Insights da operação");
  });
});
