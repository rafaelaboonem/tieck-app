// Fórmulas oficiais dos indicadores operacionais.
// Todas as funções são puras — plugue com dados reais quando o schema de tarefas/turnos existir.

export type TaskPriority = "comum" | "importante" | "critica";
export const TASK_WEIGHT: Record<TaskPriority, number> = {
  comum: 1,
  importante: 2,
  critica: 5,
};

export interface TaskExecution {
  priority: TaskPriority;
  done: boolean;
  onTime?: boolean; // realizada dentro do prazo
}

/**
 * Índice de conformidade ponderado.
 * (Σ peso das tarefas concluídas) ÷ (Σ peso de todas as tarefas programadas) × 100
 */
export function conformityIndex(tasks: TaskExecution[]): number {
  if (tasks.length === 0) return 0;
  let done = 0;
  let total = 0;
  for (const t of tasks) {
    const w = TASK_WEIGHT[t.priority];
    total += w;
    if (t.done) done += w;
  }
  return total > 0 ? (done / total) * 100 : 0;
}

/**
 * Uma tarefa crítica não realizada bloqueia o status "no padrão",
 * mesmo com pontuação alta.
 */
export function unitStatus(
  tasks: TaskExecution[],
  thresholds = { padrao: 90, atencao: 75 },
): "padrao" | "atencao" | "critico" {
  const hasCriticalMissing = tasks.some((t) => t.priority === "critica" && !t.done);
  if (hasCriticalMissing) return "critico";
  const score = conformityIndex(tasks);
  if (score >= thresholds.padrao) return "padrao";
  if (score >= thresholds.atencao) return "atencao";
  return "critico";
}

/** Taxa de execução no horário = feitas no prazo ÷ feitas */
export function onTimeRate(tasks: TaskExecution[]): number {
  const done = tasks.filter((t) => t.done);
  if (done.length === 0) return 0;
  const onTime = done.filter((t) => t.onTime).length;
  return (onTime / done.length) * 100;
}

/** Taxa de evidência aprovada = fotos aprovadas ÷ fotos analisadas */
export function evidenceApprovalRate(approved: number, analyzed: number): number {
  return analyzed > 0 ? (approved / analyzed) * 100 : 0;
}

/** Cobertura operacional = turnos iniciados ÷ turnos programados */
export function operationalCoverage(started: number, scheduled: number): number {
  return scheduled > 0 ? (started / scheduled) * 100 : 0;
}

export interface NonConformity {
  unitId: string;
  standardId: string; // padrão descumprido
  at: Date;
}

/**
 * Índice de reincidência: padrões descumpridos pela mesma unidade
 * mais de uma vez no período (dias).
 */
export function recurrenceCount(events: NonConformity[], windowDays: 7 | 15 | 30): number {
  const cutoff = Date.now() - windowDays * 86_400_000;
  const map = new Map<string, number>();
  for (const e of events) {
    if (e.at.getTime() < cutoff) continue;
    const key = `${e.unitId}:${e.standardId}`;
    map.set(key, (map.get(key) ?? 0) + 1);
  }
  let recurring = 0;
  for (const n of map.values()) if (n > 1) recurring++;
  return recurring;
}

export interface CorrectionRecord {
  registeredAt: Date; // não conformidade registrada
  correctedAt: Date; // correção efetivada
}

/** Tempo médio de correção em minutos. */
export function avgCorrectionMinutes(records: CorrectionRecord[]): number {
  if (records.length === 0) return 0;
  const total = records.reduce(
    (acc, r) => acc + (r.correctedAt.getTime() - r.registeredAt.getTime()),
    0,
  );
  return total / records.length / 60_000;
}

export function formatMinutes(mins: number): string {
  if (!isFinite(mins) || mins <= 0) return "—";
  if (mins < 60) return `${Math.round(mins)}min`;
  const h = Math.floor(mins / 60);
  const m = Math.round(mins % 60);
  return m === 0 ? `${h}h` : `${h}h ${m}min`;
}