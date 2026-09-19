import { describe, expect, it } from "vitest";
import {
  HOME_CHECKLIST_FILTERS,
  HOME_CHECKLIST_FILTER_DEFAULT,
  checklistAssignmentStatuses,
  filterHomeChecklists,
  matchesHomeChecklistFilter,
} from "../home-checklist-filter";

/**
 * Home 6B.2L — filtro local da seção "Checklists".
 * Regras determinísticas sobre o array JÁ carregado: is_published real para
 * publicação e `getAssignmentStatus` (helper canônico) para os filtros
 * operacionais — nenhuma segunda regra, nenhuma query, nenhuma heurística.
 */

const atrasado = { id: "a1", due_at: "2020-01-01T12:00:00.000Z", completed_at: null };
const pendente = { id: "a2", due_at: "2100-01-01T12:00:00.000Z", completed_at: null };
const concluido = { id: "a3", due_at: "2100-01-01T12:00:00.000Z", completed_at: "2026-09-01T12:00:00.000Z" };

const CHECKLISTS = [
  { id: "c1", title: "Só atrasado", is_published: true, checklist_assignments: [atrasado] },
  { id: "c2", title: "Só pendente", is_published: false, checklist_assignments: [pendente] },
  { id: "c3", title: "Misto", is_published: true, checklist_assignments: [pendente, concluido] },
  { id: "c4", title: "Sem atribuição", is_published: false, checklist_assignments: [] },
  { id: "c5", title: "Sem array", is_published: true },
];

describe("home-checklist-filter (6B.2L)", () => {
  it("opções e default são exatamente as aprovadas", () => {
    expect(HOME_CHECKLIST_FILTERS.map((f) => f.label)).toEqual([
      "Todos",
      "Publicados",
      "Não publicados",
      "Pendentes",
      "Atrasados",
      "Concluídos",
    ]);
    expect(HOME_CHECKLIST_FILTER_DEFAULT).toBe("todos");
  });

  it("Todos devolve a MESMA lista, sem reordenar", () => {
    expect(filterHomeChecklists(CHECKLISTS, "todos")).toBe(CHECKLISTS);
  });

  it("Publicados / Não publicados usam is_published real", () => {
    expect(filterHomeChecklists(CHECKLISTS, "publicados").map((c) => c.id)).toEqual(["c1", "c3", "c5"]);
    expect(filterHomeChecklists(CHECKLISTS, "nao_publicados").map((c) => c.id)).toEqual(["c2", "c4"]);
    // Sem is_published (undefined) NÃO é publicado — sem inventar estado.
    expect(matchesHomeChecklistFilter({ id: "x" }, "nao_publicados")).toBe(true);
    expect(matchesHomeChecklistFilter({ id: "x", is_published: null }, "publicados")).toBe(false);
  });

  it("filtros operacionais usam os valores REAIS de getAssignmentStatus", () => {
    expect(filterHomeChecklists(CHECKLISTS, "atrasados").map((c) => c.id)).toEqual(["c1"]);
    expect(filterHomeChecklists(CHECKLISTS, "pendentes").map((c) => c.id)).toEqual(["c2", "c3"]);
    expect(filterHomeChecklists(CHECKLISTS, "concluidos").map((c) => c.id)).toEqual(["c3"]);
    expect(checklistAssignmentStatuses(CHECKLISTS[2])).toEqual(["pendente", "concluido"]);
  });

  it("um checklist com assignments em estados diferentes aparece nos dois filtros (sem dedupe por heurística)", () => {
    expect(matchesHomeChecklistFilter(CHECKLISTS[2], "pendentes")).toBe(true);
    expect(matchesHomeChecklistFilter(CHECKLISTS[2], "concluidos")).toBe(true);
  });

  it("checklist sem assignments nunca entra em filtro operacional", () => {
    for (const filter of ["pendentes", "atrasados", "concluidos"] as const) {
      expect(filterHomeChecklists(CHECKLISTS, filter)).not.toContainEqual(CHECKLISTS[3]);
    }
  });
});
