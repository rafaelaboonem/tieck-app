// Regra central de status para execuções de tarefas.
// Mapeia (status do banco, horário programado, horário executado) em um
// status visual único. Evita espalhar essas regras por vários componentes.

export type ExecutionDbStatus = "pending" | "done" | "late" | "skipped" | "cancelled";
export type TaskWeight = "comum" | "importante" | "critica";

export type OperationalTaskStatus =
  | "programada"
  | "atrasada"
  | "concluida_no_prazo"
  | "concluida_com_atraso"
  | "cancelada"
  | "ignorada";

export interface DeriveStatusInput {
  status: ExecutionDbStatus;
  scheduledAt: string; // ISO
  executedAt?: string | null;
  now?: Date;
}

export function deriveTaskStatus(i: DeriveStatusInput): OperationalTaskStatus {
  const now = i.now ?? new Date();
  const scheduled = new Date(i.scheduledAt);
  if (i.status === "cancelled") return "cancelada";
  if (i.status === "skipped") return "ignorada";
  if (i.status === "done") {
    if (!i.executedAt) return "concluida_no_prazo";
    const executed = new Date(i.executedAt);
    return executed.getTime() > scheduled.getTime() ? "concluida_com_atraso" : "concluida_no_prazo";
  }
  // pending / late
  if (scheduled.getTime() > now.getTime()) return "programada";
  return "atrasada";
}

export function delayMinutes(scheduledAt: string, executedAt?: string | null): number | null {
  if (!executedAt) return null;
  const diff = new Date(executedAt).getTime() - new Date(scheduledAt).getTime();
  if (diff <= 0) return null;
  return Math.round(diff / 60000);
}

export const STATUS_LABEL: Record<OperationalTaskStatus, string> = {
  programada: "Programada",
  atrasada: "Atrasada",
  concluida_no_prazo: "Concluída no prazo",
  concluida_com_atraso: "Concluída com atraso",
  cancelada: "Cancelada",
  ignorada: "Ignorada",
};

// Tokens Tailwind — texto claro além de cor, para não depender só de matiz.
export const STATUS_STYLES: Record<
  OperationalTaskStatus,
  { badge: string; dot: string }
> = {
  programada: { badge: "bg-blue-50 text-blue-700 border-blue-200", dot: "bg-blue-500" },
  atrasada: { badge: "bg-amber-50 text-amber-800 border-amber-200", dot: "bg-amber-500" },
  concluida_no_prazo: {
    badge: "bg-emerald-50 text-emerald-700 border-emerald-200",
    dot: "bg-emerald-500",
  },
  concluida_com_atraso: {
    badge: "bg-amber-50 text-amber-800 border-amber-200",
    dot: "bg-amber-600",
  },
  cancelada: { badge: "bg-neutral-100 text-neutral-600 border-neutral-200", dot: "bg-neutral-400" },
  ignorada: { badge: "bg-neutral-100 text-neutral-600 border-neutral-200", dot: "bg-neutral-400" },
};

export const WEIGHT_LABEL: Record<TaskWeight, string> = {
  comum: "Comum",
  importante: "Importante",
  critica: "Crítica",
};

export function isCriticalFailure(
  weight: TaskWeight,
  status: OperationalTaskStatus,
): boolean {
  if (weight !== "critica") return false;
  return status === "atrasada"; // vencida e não concluída
}