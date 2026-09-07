import { getAssignmentStatus } from "@/utils/assignment-status";

/**
 * Home 6A.1 — compact operational summary for `/inicio`.
 *
 * Every checklist counts EXACTLY ONCE in the summary, resolved from its
 * `checklist_assignments` with priority:
 *
 *   atrasado > pendente > concluido > sem_status
 */

export type ChecklistOperationalStatus = "sem_status" | "concluido" | "pendente" | "atrasado";

export type HomeOperationalSummary = {
  total: number;
  concluidos: number;
  pendentes: number;
  atrasados: number;
};

/**
 * Resolve the single operational status of one checklist.
 * - at least one atrasado assignment  → "atrasado"
 * - else at least one pendente         → "pendente"
 * - else at least one concluido        → "concluido"
 * - else (no assignments or only sem_prazo) → "sem_status"
 */
export function resolveChecklistOperationalStatus(checklist: any): ChecklistOperationalStatus {
  const assignments = checklist?.checklist_assignments;
  if (!Array.isArray(assignments) || assignments.length === 0) return "sem_status";

  let hasPendente = false;
  let hasConcluido = false;

  for (const a of assignments) {
    const status = getAssignmentStatus(a?.due_at ?? null, a?.completed_at ?? null);
    if (status === "atrasado") return "atrasado";
    if (status === "pendente") hasPendente = true;
    if (status === "concluido") hasConcluido = true;
  }

  if (hasPendente) return "pendente";
  if (hasConcluido) return "concluido";
  return "sem_status";
}

/**
 * Count the visible checklists by operational status. Each checklist is
 * counted at most once. `sem_status` is never counted in the buckets.
 */
export function buildHomeOperationalSummary(checklists: any[]): HomeOperationalSummary {
  const summary: HomeOperationalSummary = { total: checklists.length, concluidos: 0, pendentes: 0, atrasados: 0 };

  for (const checklist of checklists) {
    const status = resolveChecklistOperationalStatus(checklist);
    if (status === "concluido") summary.concluidos++;
    else if (status === "pendente") summary.pendentes++;
    else if (status === "atrasado") summary.atrasados++;
  }

  return summary;
}

/**
 * Compact attention message, prioritizing atrasado over pendente.
 * Returns null when there is nothing demanding attention.
 */
export function getHomeAttentionMessage(summary: HomeOperationalSummary): string | null {
  if (summary.atrasados === 1) return "1 checklist está atrasado";
  if (summary.atrasados > 1) return `${summary.atrasados} checklists estão atrasados`;
  if (summary.pendentes === 1) return "1 checklist está pendente";
  if (summary.pendentes > 1) return `${summary.pendentes} checklists estão pendentes`;
  return null;
}