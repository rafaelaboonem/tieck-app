import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { render, screen } from "@testing-library/react";
import { HomeSummaryCards } from "../HomeSummaryCards";
import { buildHomeOperationalSummary } from "@/lib/home-operational-summary";

/**
 * Home 6B.2L — refinamento dos 3 cards de resumo.
 * Prova a anatomia da referência ([ícone] título / VALOR / helper), que os
 * cards continuam puramente INFORMATIVOS (sem seta, sem clique, sem controle
 * de filtro) e que o hover reutiliza o padrão visual do `/painel`.
 */

const CHECKLISTS = [
  { id: "c1", title: "A", is_published: true, updated_at: "2026-09-16", created_at: "2026-09-01", checklist_assignments: [{ id: "a1", due_at: "2020-01-01", completed_at: null }] },
  { id: "c2", title: "B", is_published: false, updated_at: "2026-09-17", created_at: "2026-09-02", checklist_assignments: [{ id: "a2", due_at: "2100-01-01", completed_at: null }] },
  { id: "c3", title: "C", is_published: true, updated_at: "2026-09-18", created_at: "2026-09-03", checklist_assignments: [{ id: "a3", due_at: "2100-01-01", completed_at: "2026-09-17" }] },
];

describe("HomeSummaryCards — anatomia e inércia (6B.2L)", () => {
  it("continua usando EXATAMENTE buildHomeOperationalSummary (dados reais)", () => {
    const summary = buildHomeOperationalSummary(CHECKLISTS);
    expect(summary).toEqual({ total: 3, concluidos: 1, pendentes: 1, atrasados: 1 });

    render(<HomeSummaryCards checklists={CHECKLISTS} />);

    expect(screen.getByTestId("home-summary-card-checklists")).toHaveAttribute("data-value", "3");
    expect(screen.getByTestId("home-summary-card-pendentes")).toHaveAttribute("data-value", "1");
    expect(screen.getByTestId("home-summary-card-atrasados")).toHaveAttribute("data-value", "1");
    expect(screen.getByText("disponíveis neste contexto")).toBeInTheDocument();
    expect(screen.getByText("aguardando conclusão")).toBeInTheDocument();
    expect(screen.getByText("exigem atenção")).toBeInTheDocument();
  });

  it("anatomia: ícone em tile vem ANTES do título, valor maior e helper na base", () => {
    render(<HomeSummaryCards checklists={CHECKLISTS} />);

    const helpers: Record<string, string> = {
      checklists: "disponíveis neste contexto",
      pendentes: "aguardando conclusão",
      atrasados: "exigem atenção",
    };
    for (const key of ["checklists", "pendentes", "atrasados"]) {
      const card = screen.getByTestId(`home-summary-card-${key}`);
      // O primeiro bloco interno é a linha [tile] título — ícone antes do texto.
      const header = card.firstElementChild?.firstElementChild as HTMLElement;
      expect(header.tagName.toLowerCase()).toBe("div");
      expect(header.firstElementChild?.querySelector("svg")).not.toBeNull();
      expect(header.textContent).toMatch(/Checklists|Pendentes|Atrasados/);
      // VALOR com tabular-nums e o helper REAL deste card separado abaixo.
      const value = card.querySelector(".tabular-nums");
      expect(value).not.toBeNull();
      expect(value?.textContent).toMatch(/^\d+$/);
      expect(card.textContent).toContain(helpers[key]);
    }
  });

  it("cards são semanticamente inertes: sem button, sem onClick, sem seta", () => {
    render(<HomeSummaryCards checklists={CHECKLISTS} />);

    expect(screen.queryByRole("button")).toBeNull();
    for (const key of ["checklists", "pendentes", "atrasados"]) {
      const card = screen.getByTestId(`home-summary-card-${key}`);
      expect(card.tagName.toLowerCase()).not.toBe("button");
      expect(card.onclick).toBeNull();
      expect(card.className).not.toContain("cursor-pointer");
    }
    expect(screen.queryByTestId("home-summary-arrow")).toBeNull();
    expect(document.querySelector(".lucide-arrow-right")).toBeNull();
    expect(document.querySelector(".lucide-chevron-right")).toBeNull();
  });

  it("hover reutiliza o padrão visual do /painel (grupo ti-hover-kpi)", () => {
    render(<HomeSummaryCards checklists={CHECKLISTS} />);

    // O escopo `.tieck-home` existe num ancestral REAL de cada card — sem ele
    // o seletor `.tieck-home .ti-hover-kpi` jamais casa (bug já cometido antes).
    for (const key of ["checklists", "pendentes", "atrasados"]) {
      const card = screen.getByTestId(`home-summary-card-${key}`);
      expect(card.className).toContain("ti-hover-kpi");
      expect(card).toHaveClass("ti-hover-kpi");
      expect(card.matches(".tieck-home .ti-hover-kpi")).toBe(true);
    }

    // A réplica da Home reproduz os MESMOS valores do grupo `.ti-hover-kpi`
    // do /painel (lift, escala, tempos, easing, shadow/border e reduced-motion).
    const read = (p: string) =>
      readFileSync(join(__dirname, "../../../..", p), "utf8");
    const panel = read("src/components/dashboard/panel/panel-light.css");
    const home = read("src/components/home/home-light.css");
    for (const token of [
      "translate3d(0, -3px, 0) scale(1.025)",
      "transition-duration: 220ms",
      "cubic-bezier(0.22, 1, 0.36, 1)",
      "transform 300ms",
      "box-shadow 300ms",
      "border-color 300ms",
      "transform 130ms ease-out",
      "translate3d(0, -1px, 0) scale(1.008)",
      "(hover: hover) and (pointer: fine)",
      "prefers-reduced-motion: reduce",
    ]) {
      expect(panel).toContain(token);
      expect(home).toContain(token);
    }
  });
});
