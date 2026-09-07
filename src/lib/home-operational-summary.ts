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

export type HomeOperationalPriority = {
  checklistId: string;
  title: string;
  status: "atrasado" | "pendente";
  /** ISO date of the relevant due date (oldest overdue for atrasado, soonest for pendente). */
  dueAt: string | null;
};

export type HomeOperationalPriorities = {
  items: HomeOperationalPriority[];
  /** Number of priorities beyond the returned items (for "+ N outras prioridades"). */
  remaining: number;
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
 * Build the actionable "Prioridades" list for `/inicio`.
 *
 * Only checklists whose operational status is `atrasado` or `pendente` enter;
 * checklists without a relevant due date never enter. Order:
 *   1. atrasados first — oldest due date first (most overdue = highest priority)
 *   2. pendentes second — soonest due date first
 * Limited to `limit` items (default 3); the remainder is reported via `remaining`.
 */
export function buildHomeOperationalPriorities(checklists: any[], limit = 3): HomeOperationalPriorities {
  const priorities: HomeOperationalPriority[] = [];

  for (const checklist of checklists) {
    const assignments = checklist?.checklist_assignments;
    if (!Array.isArray(assignments) || assignments.length === 0) continue;

    const title =
      typeof checklist?.title === "string" && checklist.title.trim().length > 0
        ? checklist.title
        : "Checklist sem título";

    let relevantDueAt: string | null = null;
    let status: "atrasado" | "pendente" | null = null;

    for (const a of assignments) {
      const s = getAssignmentStatus(a?.due_at ?? null, a?.completed_at ?? null);
      if (s === "atrasado") {
        // The most overdue (oldest due date) among the atrasado assignments.
        if (status !== "atrasado" || (a?.due_at && (!relevantDueAt || a.due_at < relevantDueAt))) {
          status = "atrasado";
          relevantDueAt = a?.due_at ?? null;
        }
      } else if (s === "pendente" && status !== "atrasado") {
        // The soonest due date among the pendente assignments.
        if (status !== "pendente" || (a?.due_at && (!relevantDueAt || a.due_at < relevantDueAt))) {
          status = "pendente";
          relevantDueAt = a?.due_at ?? null;
        }
      }
    }

    if (!status) continue;
    // Fail-closed: a checklist without a relevant due date never enters Prioridades.
    if (!relevantDueAt) continue;

    priorities.push({ checklistId: checklist.id, title, status, dueAt: relevantDueAt });
  }

  priorities.sort((a, b) => {
    if (a.status !== b.status) return a.status === "atrasado" ? -1 : 1;
    const da = a.dueAt ?? "";
    const db = b.dueAt ?? "";
    return da < db ? -1 : da > db ? 1 : 0;
  });

  return {
    items: priorities.slice(0, limit),
    remaining: Math.max(0, priorities.length - limit),
  };
}

/**
 * Format an ISO due date as dd/MM (pt-BR). Returns null when absent/invalid.
 */
export function formatDueDateShort(dueAtIso: string | null | undefined): string | null {
  if (!dueAtIso) return null;
  const d = new Date(dueAtIso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}