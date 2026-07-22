// Regra centralizada de status operacional — usada por cards, tabela e gráfico.
// Precedência: Sem atividade → Crítico → Atenção → No padrão.

export type OperationalStatus = "sem_atividade" | "critico" | "atencao" | "padrao";

export interface OperationalStatusInput {
  dueCompliancePercentage: number | null;
  dueWeightTotal: number;
  criticalFailures: number;
  overdueOpenTasks: number;
  completedLate: number;
}

export function getOperationalStatus(i: OperationalStatusInput): OperationalStatus {
  if (!i.dueWeightTotal || i.dueWeightTotal <= 0) return "sem_atividade";
  const pct = i.dueCompliancePercentage;
  if (i.criticalFailures > 0) return "critico";
  if (pct !== null && pct < 70) return "critico";
  if (pct !== null && pct < 90) return "atencao";
  if (i.overdueOpenTasks > 0 || i.completedLate > 0) return "atencao";
  return "padrao";
}

export const STATUS_META: Record<
  OperationalStatus,
  { label: string; tone: "neutral" | "success" | "warning" | "error"; dot: string; order: number }
> = {
  critico: { label: "Crítico", tone: "error", dot: "bg-rose-500", order: 0 },
  atencao: { label: "Atenção", tone: "warning", dot: "bg-amber-500", order: 1 },
  padrao: { label: "No padrão", tone: "success", dot: "bg-emerald-500", order: 2 },
  sem_atividade: { label: "Sem atividade", tone: "neutral", dot: "bg-neutral-300", order: 3 },
};

// Agregação ponderada correta: somar pesos e reaplicar a fórmula.
// Nunca fazer média simples de porcentagens.
export function aggregateWeighted(
  rows: Array<{ weightDone: number; weightTotal: number }>,
): number | null {
  let done = 0;
  let total = 0;
  for (const r of rows) {
    done += r.weightDone ?? 0;
    total += r.weightTotal ?? 0;
  }
  if (total <= 0) return null;
  return Math.round((1000 * done) / total) / 10;
}
