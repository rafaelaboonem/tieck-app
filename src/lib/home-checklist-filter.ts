import { getAssignmentStatus, type AssignmentStatus } from "@/utils/assignment-status";

/**
 * Home 6B.2L — filtro LOCAL da seção "Checklists".
 *
 * Client-side puro sobre o array de checklists JÁ carregado pela Home: nenhuma
 * query, nenhum parâmetro de URL, nenhum estado no banco.
 *
 * Regras determinísticas (e nada de heurística):
 *   • publicados      → `is_published === true` (estado real do produto);
 *   • não publicados  → `is_published !== true` (complemento exato);
 *   • pendentes/atrasados/concluídos → o checklist aparece quando possui PELO
 *     MENOS UM assignment naquele status, resolvido pelo helper canônico
 *     `getAssignmentStatus` (nunca uma segunda regra).
 *
 * Um checklist com assignments em estados diferentes pode aparecer em mais de
 * um filtro operacional — isso é correto: os statuses reais são preservados sem
 * deduplicação por heurística.
 */

export type HomeChecklistFilterId =
  | "todos"
  | "publicados"
  | "nao_publicados"
  | "pendentes"
  | "atrasados"
  | "concluidos";

export const HOME_CHECKLIST_FILTERS: { id: HomeChecklistFilterId; label: string }[] = [
  { id: "todos", label: "Todos" },
  { id: "publicados", label: "Publicados" },
  { id: "nao_publicados", label: "Não publicados" },
  { id: "pendentes", label: "Pendentes" },
  { id: "atrasados", label: "Atrasados" },
  { id: "concluidos", label: "Concluídos" },
];

export const HOME_CHECKLIST_FILTER_DEFAULT: HomeChecklistFilterId = "todos";

/** Filtros operacionais → valor REAL devolvido por `getAssignmentStatus`. */
const OPERATIONAL_FILTER_STATUS: Partial<Record<HomeChecklistFilterId, AssignmentStatus>> = {
  pendentes: "pendente",
  atrasados: "atrasado",
  concluidos: "concluido",
};

/** Status reais dos assignments de um checklist (via helper canônico). */
export function checklistAssignmentStatuses(checklist: any): AssignmentStatus[] {
  const assignments = Array.isArray(checklist?.checklist_assignments)
    ? checklist.checklist_assignments
    : [];
  return assignments.map((assignment: any) =>
    getAssignmentStatus(assignment?.due_at ?? null, assignment?.completed_at ?? null),
  );
}

export function matchesHomeChecklistFilter(
  checklist: any,
  filterId: HomeChecklistFilterId,
): boolean {
  if (filterId === "todos") return true;
  if (filterId === "publicados") return checklist?.is_published === true;
  if (filterId === "nao_publicados") return checklist?.is_published !== true;

  const wanted = OPERATIONAL_FILTER_STATUS[filterId];
  if (!wanted) return true;
  return checklistAssignmentStatuses(checklist).includes(wanted);
}

/** Aplica o filtro preservando a ordem original (nenhum reordenamento). */
export function filterHomeChecklists(
  checklists: any[],
  filterId: HomeChecklistFilterId,
): any[] {
  if (filterId === "todos") return checklists;
  return checklists.filter((checklist) => matchesHomeChecklistFilter(checklist, filterId));
}
