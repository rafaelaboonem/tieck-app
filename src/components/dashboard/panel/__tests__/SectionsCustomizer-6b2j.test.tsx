/**
 * Personalizar painel — módulos de insights (6B.2J).
 *
 * Cobre o contrato central de visibilidade: `operation-insights` passa a
 * representar "Conformidade por turno" (id estável preservado, só o label
 * muda), `checklist-execution-insights` entra como novo módulo e o DEFAULT
 * (tudo visível) inclui ambos. O popover lista os dois em ANÁLISES na ordem
 * aprovada; toggles persistem no localStorage; "Restaurar padrão" reativa
 * tudo; `isSectionVisible`/`normalizeVisibleSections` só aceitam ids
 * canônicos.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import * as React from "react";

import {
  DASHBOARD_SECTIONS,
  DEFAULT_VISIBLE_SECTIONS,
  DashboardSectionId,
  SECTION_GROUPS,
  SectionsCustomizer,
  isSectionVisible,
  normalizeVisibleSections,
  useVisibleSections,
} from "../SectionsCustomizer";

/** Usa o hook REAL (mesma persistência do /painel): toggle escreve no
    localStorage, "Restaurar padrão" reescreve o default completo. */
function Harness() {
  const [visible, setVisible] = useVisibleSections();
  return (
    <SectionsCustomizer
      visible={visible}
      onChange={setVisible}
      open={true}
      onOpenChange={() => {}}
    />
  );
}

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  window.localStorage.clear();
  cleanup();
});

describe("registro central de módulos", () => {
  it("A. operation-insights → 'Conformidade por turno'", () => {
    const entry = DASHBOARD_SECTIONS.find((section) => section.id === "operation-insights");
    expect(entry?.label).toBe("Conformidade por turno");
    expect(entry?.group).toBe("analytics");
  });

  it("B. checklist-execution-insights → 'Execução por checklist'", () => {
    const entry = DASHBOARD_SECTIONS.find(
      (section) => section.id === "checklist-execution-insights",
    );
    expect(entry?.label).toBe("Execução por checklist");
    expect(entry?.group).toBe("analytics");
  });

  it("C. DEFAULT inclui os dois (restaurar padrão reativa ambos)", () => {
    expect(DEFAULT_VISIBLE_SECTIONS).toContain("operation-insights");
    expect(DEFAULT_VISIBLE_SECTIONS).toContain("checklist-execution-insights");
  });

  it("ordem dos módulos de ANÁLISES segue a aprovada", () => {
    const labels = DASHBOARD_SECTIONS.filter((s) => s.group === "analytics").map((s) => s.label);
    expect(labels).toEqual([
      "Atividade dos checklists",
      "Conformidade por unidade",
      "Execução do período",
      "Últimas execuções",
      "Pontos de atenção",
      "Desempenho por unidade",
      "Conformidade por turno",
      "Execução por checklist",
    ]);
  });

  it("ids continuam canônicos para persistência antiga (normalize/isSectionVisible)", () => {
    const mixed = ["operation-insights", "bogus", "checklist-execution-insights"] as DashboardSectionId[];
    expect(normalizeVisibleSections(mixed)).toEqual([
      "operation-insights",
      "checklist-execution-insights",
    ]);
    expect(isSectionVisible(["operation-insights"], "operation-insights")).toBe(true);
    expect(isSectionVisible(["operation-insights"], "checklist-execution-insights")).toBe(false);
  });
});

describe("popover Personalizar painel", () => {
  it("D. lista os dois módulos com checkboxes distintos no grupo ANÁLISES", () => {
    render(<Harness />);

    const groupLabel = screen.getByText("Análises");
    const analyticsGroup = groupLabel.closest("div");
    expect(analyticsGroup?.textContent).toContain("Conformidade por turno");
    expect(analyticsGroup?.textContent).toContain("Execução por checklist");

    const shiftBox = screen.getByRole("checkbox", { name: "Conformidade por turno" });
    const execBox = screen.getByRole("checkbox", { name: "Execução por checklist" });
    expect(shiftBox).toBeChecked();
    expect(execBox).toBeChecked();
  });

  it("cada checkbox controla apenas o seu próprio estado", () => {
    render(<Harness />);

    fireEvent.click(screen.getByRole("checkbox", { name: "Conformidade por turno" }));
    expect(screen.getByRole("checkbox", { name: "Conformidade por turno" })).not.toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Execução por checklist" })).toBeChecked();

    fireEvent.click(screen.getByRole("checkbox", { name: "Execução por checklist" }));
    expect(screen.getByRole("checkbox", { name: "Conformidade por turno" })).not.toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Execução por checklist" })).not.toBeChecked();
  });

  it("toggle persiste no localStorage existente", () => {
    render(<Harness />);

    fireEvent.click(screen.getByRole("checkbox", { name: "Execução por checklist" }));
    expect(
      JSON.parse(window.localStorage.getItem("tieck:dashboard:visible-sections") || "[]"),
    ).not.toContain("checklist-execution-insights");

    fireEvent.click(screen.getByRole("checkbox", { name: "Execução por checklist" }));
    expect(
      JSON.parse(window.localStorage.getItem("tieck:dashboard:visible-sections") || "[]"),
    ).toContain("checklist-execution-insights");
  });

  it("'Restaurar padrão' reativa os dois módulos", () => {
    render(<Harness />);

    fireEvent.click(screen.getByRole("checkbox", { name: "Conformidade por turno" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Execução por checklist" }));
    fireEvent.click(screen.getByRole("button", { name: "Restaurar padrão" }));

    expect(screen.getByRole("checkbox", { name: "Conformidade por turno" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Execução por checklist" })).toBeChecked();
  });

  it("SECTION_GROUPS continua expondo ANÁLISES (sem grupo novo)", () => {
    expect(SECTION_GROUPS.map((group) => group.label)).toEqual([
      "Indicadores",
      "Análises",
      "Rotinas",
    ]);
  });
});
