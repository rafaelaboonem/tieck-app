/**
 * RealChecklistExecutionInsights — card DIREITO de "Insights da operação"
 * (6B.2J). Componente PURO: recebe as métricas prontas e apresenta.
 *
 * O que esta suíte protege:
 *   • a taxa exibida é due_completed/due (94,7% de 18/19), NUNCA completed/total;
 *   • due = 0 → "—" com "Ainda sem ocorrências devidas" (0% seria falso);
 *   • identidade é o checklist_id: mesmos títulos → DUAS linhas, sem dedupe;
 *   • ordem estável alfabética (id desempata), sem ranking;
 *   • atraso aberto só aparece quando > 0;
 *   • loading / erro+retry / vazio;
 *   • "Ver Checklist" navega pelo checklistId real (nunca título).
 */
import * as React from "react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";

import { RealChecklistExecutionInsights } from "../RealChecklistExecutionInsights";
import type { ChecklistExecutionMetric } from "@/lib/checklist-execution-metrics";

const ID_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ID_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const ID_C = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

/** Linha coerente com o lifecycle 5E.2A e com a RPC 6B.2J. */
function metric(overrides: Partial<ChecklistExecutionMetric> = {}): ChecklistExecutionMetric {
  return {
    checklistId: ID_A,
    checklistTitle: "Controle de temperatura",
    unitId: "dddddddd-dddd-4ddd-8ddd-ddddddddddd1",
    unitName: "Unidade Norte",
    shiftId: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeee1",
    shiftName: "Noite",
    totalOccurrences: 20,
    completedOccurrences: 18,
    completedOnTime: 16,
    completedLate: 2,
    overdueOpenOccurrences: 1,
    pendingOpenOccurrences: 1,
    dueOccurrences: 19,
    dueCompletedOccurrences: 18,
    ...overrides,
  };
}

beforeEach(() => {
  cleanup();
});

describe("taxa das ocorrências DEVIDAS (nunca completed/total)", () => {
  it("A/B) 18 de 19 devidas → 94,7% (18/20 daria 90%)", () => {
    render(<RealChecklistExecutionInsights metrics={[metric()]} />);

    const row = screen.getByTestId("checklist-execution-row");
    expect(row.getAttribute("data-rate")).toBe("94.7");
    expect(row.getAttribute("data-due")).toBe("19");
    expect(row.getAttribute("data-due-completed")).toBe("18");
    expect(screen.getByTestId("checklist-execution-rate").textContent).toBe("94,7%");
    expect(screen.getByTestId("checklist-execution-row").textContent).toContain(
      "18 de 19 devidas concluídas",
    );
  });

  it("C) due = 0 → '—' e 'Ainda sem ocorrências devidas' (NUNCA 0%)", () => {
    render(
      <RealChecklistExecutionInsights
        metrics={[
          metric({
            dueOccurrences: 0,
            dueCompletedOccurrences: 0,
            completedOccurrences: 0,
            completedOnTime: 0,
            completedLate: 0,
            totalOccurrences: 2,
            pendingOpenOccurrences: 2,
          }),
        ]}
      />,
    );

    expect(screen.getByTestId("checklist-execution-rate").textContent).toBe("—");
    expect(screen.getByTestId("checklist-execution-row").textContent).toContain(
      "Ainda sem ocorrências devidas",
    );
    expect(screen.getByTestId("checklist-execution-row").textContent).not.toContain("0%");
  });
});

describe("identidade e ordem", () => {
  it("D) dois checklists com o MESMO título aparecem em DUAS linhas (key = id)", () => {
    render(
      <RealChecklistExecutionInsights
        metrics={[metric({ checklistId: ID_A }), metric({ checklistId: ID_B })]}
      />,
    );

    const rows = screen.getAllByTestId("checklist-execution-row");
    expect(rows).toHaveLength(2);
    expect(new Set(rows.map((r) => r.getAttribute("data-checklist-id"))).size).toBe(2);
  });

  it("E) ordem alfabética estável por título, id desempata (não é ranking)", () => {
    render(
      <RealChecklistExecutionInsights
        metrics={[
          metric({ checklistId: ID_B, checklistTitle: "Fechamento" }),
          metric({ checklistId: ID_A, checklistTitle: "Abertura" }),
          metric({ checklistId: ID_C, checklistTitle: "Fechamento" }),
        ]}
      />,
    );

    expect(screen.getAllByTestId("checklist-execution-row").map((r) => r.getAttribute("data-checklist-id"))).toEqual([
      ID_A,
      ID_B,
      ID_C,
    ]);
  });
});

describe("exceções e estados", () => {
  it("F) 'abertas em atraso' só aparece quando > 0", () => {
    const { unmount } = render(<RealChecklistExecutionInsights metrics={[metric()]} />);
    expect(screen.getByTestId("checklist-execution-row").textContent).toContain(
      "1 abertas em atraso",
    );
    unmount();

    render(
      <RealChecklistExecutionInsights
        metrics={[metric({ overdueOpenOccurrences: 0, totalOccurrences: 19, pendingOpenOccurrences: 1 })]}
      />,
    );
    expect(screen.queryByTestId("checklist-execution-overdue")).toBeNull();
  });

  it("G) loading mostra esqueleto e não desenha linhas", () => {
    render(<RealChecklistExecutionInsights metrics={[]} loading />);

    expect(screen.getByTestId("checklist-execution-loading")).toBeTruthy();
    expect(screen.queryByTestId("checklist-execution-row")).toBeNull();
  });

  it("H) erro mostra mensagem genérica + retry (nunca vira vazio)", () => {
    const onRetry = vi.fn();
    render(<RealChecklistExecutionInsights metrics={[]} error onRetry={onRetry} />);

    expect(screen.getByTestId("checklist-execution-error").textContent).toContain(
      "Falha ao carregar execução por checklist.",
    );
    fireEvent.click(screen.getByRole("button", { name: "Tentar novamente" }));
    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId("checklist-execution-empty")).toBeNull();
  });

  it("I) vazio honesto quando o recorte não tem rotinas", () => {
    render(<RealChecklistExecutionInsights metrics={[]} />);

    expect(screen.getByTestId("checklist-execution-empty").textContent).toContain(
      "Sem execuções de checklist no período",
    );
    expect(screen.getByTestId("checklist-execution-empty").textContent).toContain(
      "Nenhuma rotina agendada foi encontrada",
    );
  });
});

describe("contexto e navegação", () => {
  it("contexto discreto mostra unidade · turno só quando existem", () => {
    const { unmount } = render(<RealChecklistExecutionInsights metrics={[metric()]} />);
    expect(screen.getByTestId("checklist-execution-row").textContent).toContain("Unidade Norte · Noite");
    unmount();

    render(
      <RealChecklistExecutionInsights metrics={[metric({ unitName: null, unitId: null, shiftName: null, shiftId: null })]} />,
    );
    expect(screen.getByTestId("checklist-execution-row").textContent).not.toContain("Unidade Norte");
  });

  it("o NOME do checklist é o controle: clique envia o checklistId REAL", () => {
    const onOpenChecklist = vi.fn();
    const { unmount } = render(
      <RealChecklistExecutionInsights metrics={[metric()]} onOpenChecklist={onOpenChecklist} />,
    );
    // O botão é o próprio nome (não existe linha extra "Ver Checklist").
    fireEvent.click(screen.getByRole("button", { name: "Controle de temperatura" }));
    expect(onOpenChecklist).toHaveBeenCalledTimes(1);
    expect(onOpenChecklist).toHaveBeenCalledWith(ID_A);
    unmount();

    // Sem handler: título é texto normal e nenhuma ação falsa é oferecida.
    render(<RealChecklistExecutionInsights metrics={[metric()]} />);
    expect(
      screen.getByTestId("checklist-execution-title").textContent,
    ).toBe("Controle de temperatura");
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.queryByText("Ver Checklist")).toBeNull();
  });
});
