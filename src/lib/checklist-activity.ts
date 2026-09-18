/*
 * ============ ATIVIDADE DOS CHECKLISTS — CONTRATO (SÉRIE DIÁRIA) ==========
 *
 * Fonte REAL: `public.analytics_unit_daily_compliance`. A view tem grão
 *
 *     organization_id × unit_id × shift_id × reference_date
 *
 * e é a MESMA fonte dos KPIs de tarefa do painel (Programados / Respondidos /
 * No prazo / Em atraso). Este módulo não consulta nada: ele transforma as linhas
 * da view na série diária que o gráfico desenha.
 *
 * SEMÂNTICA — não negociável:
 *   • `total_scheduled_tasks` = TAREFAS programadas no dia (`task_executions`);
 *   • `completed_tasks`       = TAREFAS concluídas no dia.
 * Isso NÃO é resposta de checklist (`checklist_responses`) e não é ocorrência de
 * rotina (`checklist_execution_occurrences`, domínio da seção "Rotinas
 * agendadas"). Por isso as séries se chamam "Programadas" e "Concluídas" — e
 * nunca "Respondidas".
 *
 * AGREGAÇÃO — somar, nunca mediar. A view está particionada por unidade E por
 * turno; a série diária do recorte é a SOMA de todas as partições do dia. Uma
 * linha por (unidade, turno, dia) entra exatamente UMA vez:
 *   • todos os turnos → cada partição de turno soma uma vez;
 *   • turno específico → o recorte já vem da consulta (`.eq("shift_id", …)`);
 *   • todas as unidades → cada unidade soma uma vez;
 *   • unidade específica → idem.
 * O total da série reproduz `kpis.scheduled` e `kpis.done` do MESMO recorte —
 * invariável coberta por teste (`checklist-activity-6b2h`).
 *
 * DATA CIVIL — `reference_date` JÁ é o dia civil calculado pela view com o
 * timezone da unidade. Aqui ele é tratado como data civil "YYYY-MM-DD" puro: o
 * eixo é caminhado por aritmética de calendário (`addDaysISO`) e formatado por
 * componentes da string. Nada é reconvertido para UTC nem para o fuso do
 * navegador — um dia civil nunca pode virar outro por causa do fuso de quem
 * abriu o painel.
 */
import { addDaysISO } from "./unit-day-range";

/** Linha crua da view — só os campos que esta série usa. */
export interface ChecklistActivityRow {
  reference_date: string;
  total_scheduled_tasks: number;
  completed_tasks: number;
}

/** Ponto da série diária já agregado (um por dia civil do recorte). */
export interface ChecklistActivityDay {
  /** Dia civil `YYYY-MM-DD` — o mesmo `reference_date` da view. */
  date: string;
  scheduled: number;
  completed: number;
}

/** Contadores ausentes/ inválidos valem 0 — nunca `NaN` no eixo. */
function count(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

/** Data civil válida (formato apenas: a semântica é do calendário). */
export function isCivilDateISO(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

/**
 * Parse fail-closed do payload da view: linha sem `reference_date` válido é
 * descartada (e não vira "dia indefinido" no gráfico). Contadores ausentes viram
 * 0 — a view só devolve inteiros, então isso é defesa, não regra de negócio.
 */
export function parseChecklistActivityRows(raw: unknown): ChecklistActivityRow[] {
  if (!Array.isArray(raw)) return [];
  const rows: ChecklistActivityRow[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    if (!isCivilDateISO(row.reference_date)) continue;
    rows.push({
      reference_date: row.reference_date,
      total_scheduled_tasks: count(row.total_scheduled_tasks),
      completed_tasks: count(row.completed_tasks),
    });
  }
  return rows;
}

export interface ActivityRange {
  startDate: string;
  endDate: string;
}

/**
 * Série diária do recorte, em ordem cronológica CRESCENTE.
 *
 * Eixo contínuo: todo dia entre `startDate` e `endDate` aparece, inclusive os que
 * não têm linha nenhuma na view (`scheduled = 0`, `completed = 0`) — um dia sem
 * atividade é informação, não um buraco no gráfico. O recorte pedido é
 * preservado integralmente (nada é truncado em silêncio).
 *
 * Linhas fora do recorte são ignoradas: a consulta já as exclui, e contar uma
 * linha de fora inflaria a série em relação ao KPI.
 */
export function buildDailyActivitySeries(
  rows: readonly ChecklistActivityRow[],
  range: ActivityRange,
): ChecklistActivityDay[] {
  const { startDate, endDate } = range;
  if (!isCivilDateISO(startDate) || !isCivilDateISO(endDate) || startDate > endDate) {
    return [];
  }

  const byDay = new Map<string, { scheduled: number; completed: number }>();
  for (const row of rows) {
    if (row.reference_date < startDate || row.reference_date > endDate) continue;
    const current = byDay.get(row.reference_date) ?? { scheduled: 0, completed: 0 };
    current.scheduled += count(row.total_scheduled_tasks);
    current.completed += count(row.completed_tasks);
    byDay.set(row.reference_date, current);
  }

  const series: ChecklistActivityDay[] = [];
  for (let cursor = startDate; cursor <= endDate; cursor = addDaysISO(cursor, 1)) {
    const day = byDay.get(cursor);
    series.push({
      date: cursor,
      scheduled: day?.scheduled ?? 0,
      completed: day?.completed ?? 0,
    });
  }
  return series;
}

/** Totais da série — usados para provar a equivalência com os KPIs do recorte. */
export function checklistActivityTotals(days: readonly ChecklistActivityDay[]): {
  scheduled: number;
  completed: number;
} {
  let scheduled = 0;
  let completed = 0;
  for (const day of days) {
    scheduled += day.scheduled;
    completed += day.completed;
  }
  return { scheduled, completed };
}

/**
 * Período inteiramente sem atividade. Sem dias (recorte inválido) também é
 * "sem atividade": nenhum gráfico deve ser desenhado com base inexistente.
 */
export function isChecklistActivityEmpty(days: readonly ChecklistActivityDay[]): boolean {
  return days.every((day) => day.scheduled === 0 && day.completed === 0);
}

/**
 * A janela inclui "hoje"? Única definição usada pelo realtime deste hook — o dia
 * de hoje é a DATA CIVIL LOCAL (`todayISO`), nunca o dia UTC.
 */
export function activityRangeIncludesToday(range: ActivityRange, today: string): boolean {
  return range.startDate <= today && today <= range.endDate;
}
