/**
 * EXECUÇÃO POR CHECKLIST (6B.2J) — contrato analítico do domínio ROTINAS.
 *
 * FONTE (e só ela): occurrences de rotinas agendadas agregadas por
 * checklist_id pela RPC `list_workspace_checklist_execution_metrics`
 * (20260918120000_6b2j_checklist_execution_metrics.sql).
 *
 * A identidade estatística é a OCCURRENCE — uma obrigação real
 * (5E.2A: UNIQUE(schedule_id, occurrence_date)). Nada é deduplicado por
 * título, checklist+dia, schedule_id ou response_id; dois checklists com o
 * mesmo título permanecem SEPARADOS (o agrupamento é sempre por id).
 *
 * Este contrato pertence EXCLUSIVAMENTE às rotinas. NÃO mistura com
 * task_executions / analytics_unit_daily_compliance (domínio de TAREFAS dos
 * KPIs do /painel), com respostas avulsas/públicas (`visitor_id` não é
 * identidade) nem com a lista limitada de execuções individuais da 6B.2E —
 * que nunca é fonte estatística de período.
 *
 * TAXA: o banco devolve CONTADORES, nunca percentual. A métrica principal é
 * a TAXA DE EXECUÇÃO DAS OCORRÊNCIAS DEVIDAS:
 *
 *   dueExecutionRate = due_completed_occurrences / due_occurrences × 100
 *
 * com `due_occurrences = 0 → null` (NUNCA 0%): obrigação ainda futura dentro
 * do recorte não pode reduzir artificialmente a performance do checklist.
 * O recorte do período é a data CIVIL da obrigação (`occurrence_date`) — a
 * mesma chave de analytics_unit_daily_occurrences — nunca `due_at::date`.
 *
 * Este módulo é PURO (sem cliente, sem React): rede vive em hook futuro.
 */
import { OCCURRENCE_FALLBACK_TITLE } from "./occurrence-dashboard";

/** Raw row of public.list_workspace_checklist_execution_metrics. */
export type ChecklistExecutionMetricRow = {
  checklist_id?: string | null;
  checklist_title?: string | null;
  unit_id?: string | null;
  unit_name?: string | null;
  shift_id?: string | null;
  shift_name?: string | null;
  total_occurrences?: number | string | null;
  completed_occurrences?: number | string | null;
  completed_on_time?: number | string | null;
  completed_late?: number | string | null;
  overdue_open_occurrences?: number | string | null;
  pending_open_occurrences?: number | string | null;
  due_occurrences?: number | string | null;
  due_completed_occurrences?: number | string | null;
};

/**
 * Contrato local e estreito do cliente para a RPC 6B.2J. `supabase/types.ts`
 * continua intocado (mesma fronteira de 5E.2A/6B.2B/6B.2D/6B.2E): o cast
 * acontece uma única vez, no futuro hook.
 */
export interface ChecklistExecutionMetricsDatabase {
  public: {
    Tables: Record<string, never>;
    Views: Record<string, never>;
    Functions: {
      list_workspace_checklist_execution_metrics: {
        Args: {
          p_workspace_id: string;
          p_start_date: string;
          p_end_date: string;
          p_unit_id?: string | null;
          p_shift_id?: string | null;
        };
        Returns: ChecklistExecutionMetricRow[];
      };
    };
  };
}

/** Um checklist do recorte, com os contadores do lifecycle 5E.2A validados. */
export type ChecklistExecutionMetric = {
  checklistId: string;
  /** Sem fallback inventado: título ausente vira null (a UI decide o rótulo). */
  checklistTitle: string | null;
  unitId: string | null;
  unitName: string | null;
  shiftId: string | null;
  shiftName: string | null;

  totalOccurrences: number;
  completedOccurrences: number;
  completedOnTime: number;
  completedLate: number;
  overdueOpenOccurrences: number;
  pendingOpenOccurrences: number;

  /** Devidas: due_at <= now() — o denominador da taxa principal. */
  dueOccurrences: number;
  dueCompletedOccurrences: number;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function asUuid(value: unknown): string | null {
  const s = asString(value);
  return s && UUID_RE.test(s) ? s : null;
}

/**
 * Contador do contrato. PostgREST serializa `bigint` como string — número ou
 * dígito são aceitos; qualquer outra coisa (falta, negativo, não-inteiro,
 * NaN) é violação de contrato e derruba a linha (fail-closed, nunca 0
 * silencioso).
 */
function asCounter(value: unknown): number | null {
  const n = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  return Number.isInteger(n) && n >= 0 ? n : null;
}

/**
 * Parse fail-closed do payload da RPC.
 *
 * Obrigatórios: a identidade do checklist (o agrupamento é por id — linha sem
 * `checklist_id` não tem significado estatístico) e TODOS os contadores. Uma
 * linha malformada é DESCARTADA em vez de agregada com contador inventado.
 *
 * Opcionais: título, unidade e turno — rotina sem unidade/turno é válida
 * (shift_id NULL é partição real) e não pode derrubar a linha.
 */
export function parseChecklistExecutionMetrics(raw: unknown): ChecklistExecutionMetric[] {
  if (!Array.isArray(raw)) return [];

  const out: ChecklistExecutionMetric[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;
    const row = entry as Record<string, unknown>;

    const checklistId = asUuid(row.checklist_id);
    const totalOccurrences = asCounter(row.total_occurrences);
    const completedOccurrences = asCounter(row.completed_occurrences);
    const completedOnTime = asCounter(row.completed_on_time);
    const completedLate = asCounter(row.completed_late);
    const overdueOpenOccurrences = asCounter(row.overdue_open_occurrences);
    const pendingOpenOccurrences = asCounter(row.pending_open_occurrences);
    const dueOccurrences = asCounter(row.due_occurrences);
    const dueCompletedOccurrences = asCounter(row.due_completed_occurrences);

    if (
      !checklistId ||
      totalOccurrences === null ||
      completedOccurrences === null ||
      completedOnTime === null ||
      completedLate === null ||
      overdueOpenOccurrences === null ||
      pendingOpenOccurrences === null ||
      dueOccurrences === null ||
      dueCompletedOccurrences === null
    ) {
      continue;
    }

    out.push({
      checklistId,
      checklistTitle: asString(row.checklist_title),
      unitId: asUuid(row.unit_id),
      unitName: asString(row.unit_name),
      shiftId: asUuid(row.shift_id),
      shiftName: asString(row.shift_name),
      totalOccurrences,
      completedOccurrences,
      completedOnTime,
      completedLate,
      overdueOpenOccurrences,
      pendingOpenOccurrences,
      dueOccurrences,
      dueCompletedOccurrences,
    });
  }
  return out;
}

/**
 * TAXA DE EXECUÇÃO DAS OCORRÊNCIAS DEVIDAS, em %, com 1 casa decimal.
 *
 *   dueCompletedOccurrences / dueOccurrences × 100
 *
 * `dueOccurrences = 0 → null` — nunca 0%: um checklist cujas ocorrências do
 * período ainda não venceram não tem desempenho medível, e tratá-lo como 0%
 * mentiria sobre a operação. Não confunde com
 * `completedOccurrences / totalOccurrences` (que ignora o que ainda é
 * futuro e NÃO é a métrica principal desta etapa).
 */
export function dueExecutionRate(metric: ChecklistExecutionMetric): number | null {
  if (metric.dueOccurrences <= 0) return null;
  return Math.round((metric.dueCompletedOccurrences / metric.dueOccurrences) * 1000) / 10;
}

/**
 * Ordem estável para futura UI: alfabética por título, desempatando pelo id
 * do checklist (dois checklists com o mesmo título NUNCA se fundem nem
 * alternam de posição). Título ausente vai por último, também desempatado
 * por id. NÃO é ranking de melhor/pior.
 */
export function sortChecklistMetricsByTitle(
  metrics: ChecklistExecutionMetric[],
): ChecklistExecutionMetric[] {
  return [...metrics].sort((a, b) => {
    const titleA = a.checklistTitle;
    const titleB = b.checklistTitle;
    if (titleA === null && titleB !== null) return 1;
    if (titleA !== null && titleB === null) return -1;
    if (titleA !== null && titleB !== null && titleA !== titleB) {
      return titleA < titleB ? -1 : 1;
    }
    if (a.checklistId !== b.checklistId) {
      return a.checklistId < b.checklistId ? -1 : 1;
    }
    return 0;
  });
}

/** Rótulo de apresentação para o título ausente (mesma família do produto). */
export function checklistMetricTitle(metric: ChecklistExecutionMetric): string {
  return metric.checklistTitle ?? OCCURRENCE_FALLBACK_TITLE;
}
