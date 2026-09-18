/*
 * ============== CONFORMIDADE POR TURNO — AGREGAÇÃO PURA (6B.2I) ===========
 *
 * Segunda agregação sobre a MESMA resposta de `analytics_unit_daily_compliance`
 * que `useUnitCompliance` já busca: a view tem grão
 *
 *     organization_id × unit_id × shift_id × reference_date
 *
 * e o hook já agrega POR UNIDADE (`aggregateByUnit`). Aqui a mesma lista de
 * linhas é agrupada POR TURNO — nenhuma consulta nova, nenhum canal novo, o
 * mesmo instante de atualização. Se painel e insights divergissem, seria por
 * request diferente; não existe esse caminho.
 *
 * REGRAS (as mesmas do resto do dashboard, não regras novas):
 *   • SOMAR, nunca mediar. Conformidade é ponderada:
 *        100 × Σ due_weight_done / Σ due_weight_total
 *     com uma casa decimal; denominador zero → `null` (não é 0%, é "sem
 *     denominador"). Média de `due_compliance_percentage` seria um número falso;
 *   • `completionPercentage` é outra métrica: conclusão simples
 *        completed / scheduled × 100, e `null` quando não houve programação.
 *     Ela NUNCA substitui a conformidade ponderada;
 *   • `shift_id NULL` é uma PARTIÇÃO REAL (execuções sem turno definido). Vira
 *     um bucket próprio, com `shiftId = null` — nenhum id fake é inventado;
 *   • o agrupamento é pelo ID, não pelo nome: dois turnos diferentes com o mesmo
 *     nome continuam separados (o nome é só rótulo).
 *
 * ESCOPO DO TURNO: no modelo, `shifts` pertence ao WORKSPACE
 * (`shifts.workspace_id`), não à unidade — não existe `shifts.unit_id` nem
 * constraint ligando `checklists.shift_id` a `checklists.unit_id`. Dentro de um
 * workspace o id identifica o turno; nomes repetidos são permitidos, por isso a
 * chave do agrupamento é o id.
 */

/** Uma linha por turno REAL do recorte (inclui o bucket de turno ausente). */
export interface ShiftComplianceRow {
  /** `shift_id` real; `null` = execuções sem turno definido. */
  shiftId: string | null;
  /** `shift_name` real; `null` quando o turno não existe (ou não tem nome). */
  shiftName: string | null;

  totalScheduledTasks: number;
  completedTasks: number;
  completedOnTime: number;
  completedLate: number;
  overdueOpenTasks: number;
  criticalFailures: number;
  pendingEvidences: number;

  dueWeightTotal: number;
  dueWeightDone: number;
  /** Conformidade PONDERADA (null sem denominador). */
  dueCompliancePercentage: number | null;
  /** Conclusão simples (null sem programação). */
  completionPercentage: number | null;
}

/** Colunas que a agregação usa (subconjunto estrutural da linha da view). */
export interface ShiftAggregationRow {
  shift_id: string | null;
  shift_name: string | null;
  total_scheduled_tasks: number;
  completed_tasks: number;
  completed_on_time: number;
  completed_late: number;
  overdue_open_tasks: number;
  critical_failures: number;
  pending_evidences: number;
  due_weight_total: number;
  due_weight_done: number;
}

/** Rótulo do bucket sem turno — o valor REAL continua `null`. */
export const NO_SHIFT_LABEL = "Sem turno definido";

function num(value: number | null | undefined): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

/** Percentual com uma casa decimal; denominador zero → null (nunca 0%). */
export function ratioPercentage(part: number, total: number): number | null {
  if (!Number.isFinite(total) || total <= 0) return null;
  return Math.round((1000 * num(part)) / total) / 10;
}

/**
 * Agrupa as linhas da view por `shift_id` e reaplica a fórmula ponderada.
 * A soma dos campos por turno reproduz exatamente os totais por unidade (e os
 * KPIs do recorte) — invariável coberta por teste.
 */
export function aggregateByShift(rows: readonly ShiftAggregationRow[]): ShiftComplianceRow[] {
  const buckets = new Map<
    string | null,
    {
      shiftName: string | null;
      total: number;
      completed: number;
      onTime: number;
      late: number;
      overdueOpen: number;
      critical: number;
      pendingEv: number;
      dueWeightTotal: number;
      dueWeightDone: number;
    }
  >();

  for (const row of rows) {
    const key = row.shift_id ?? null;
    const current = buckets.get(key) ?? {
      shiftName: row.shift_id ? (row.shift_name ?? null) : null,
      total: 0,
      completed: 0,
      onTime: 0,
      late: 0,
      overdueOpen: 0,
      critical: 0,
      pendingEv: 0,
      dueWeightTotal: 0,
      dueWeightDone: 0,
    };
    current.total += num(row.total_scheduled_tasks);
    current.completed += num(row.completed_tasks);
    current.onTime += num(row.completed_on_time);
    current.late += num(row.completed_late);
    current.overdueOpen += num(row.overdue_open_tasks);
    current.critical += num(row.critical_failures);
    current.pendingEv += num(row.pending_evidences);
    current.dueWeightTotal += num(row.due_weight_total);
    current.dueWeightDone += num(row.due_weight_done);
    buckets.set(key, current);
  }

  return Array.from(buckets, ([shiftId, b]) => ({
    shiftId,
    shiftName: shiftId ? b.shiftName : null,
    totalScheduledTasks: b.total,
    completedTasks: b.completed,
    completedOnTime: b.onTime,
    completedLate: b.late,
    overdueOpenTasks: b.overdueOpen,
    criticalFailures: b.critical,
    pendingEvidences: b.pendingEv,
    dueWeightTotal: b.dueWeightTotal,
    dueWeightDone: b.dueWeightDone,
    dueCompliancePercentage: ratioPercentage(b.dueWeightDone, b.dueWeightTotal),
    completionPercentage: ratioPercentage(b.completed, b.total),
  }));
}

/** Nome exibível: turno sem nome cai no id; bucket nulo → rótulo explícito. */
export function shiftDisplayName(row: Pick<ShiftComplianceRow, "shiftId" | "shiftName">): string {
  if (!row.shiftId) return NO_SHIFT_LABEL;
  return row.shiftName && row.shiftName.length > 0 ? row.shiftName : row.shiftId;
}

/**
 * Ordem estável de apresentação: nome alfabético, com o bucket "sem turno"
 * SEMPRE por último. Empate de nome é desempatado pelo id, para a ordem não
 * depender da ordem de chegada das linhas. Não é ranking por desempenho.
 */
export function sortShiftRows(rows: readonly ShiftComplianceRow[]): ShiftComplianceRow[] {
  return [...rows].sort((a, b) => {
    if (!a.shiftId && b.shiftId) return 1;
    if (a.shiftId && !b.shiftId) return -1;
    const byName = shiftDisplayName(a).localeCompare(shiftDisplayName(b), "pt-BR");
    if (byName !== 0) return byName;
    return (a.shiftId ?? "").localeCompare(b.shiftId ?? "");
  });
}

/**
 * Nada a mostrar: nenhuma partição no recorte OU todas sem movimento. Evita
 * renderizar blocos de zeros como se fossem informação.
 */
export function isShiftInsightsEmpty(rows: readonly ShiftComplianceRow[]): boolean {
  return rows.every(
    (row) =>
      row.totalScheduledTasks === 0 &&
      row.completedTasks === 0 &&
      row.overdueOpenTasks === 0 &&
      row.criticalFailures === 0 &&
      row.pendingEvidences === 0 &&
      row.dueWeightTotal === 0,
  );
}
