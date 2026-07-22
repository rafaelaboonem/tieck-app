import { Camera, AlertOctagon, Clock } from "lucide-react";
import {
  deriveTaskStatus,
  delayMinutes,
  isCriticalFailure,
  STATUS_LABEL,
  STATUS_STYLES,
  WEIGHT_LABEL,
} from "@/lib/task-execution-status";
import type { OperationalExecution } from "@/hooks/useUnitOperationalDetails";

interface Props {
  execution: OperationalExecution;
  onClick?: (e: OperationalExecution) => void;
  now?: Date;
}

function fmtTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

export function OperationalTaskItem({ execution, onClick, now }: Props) {
  const status = deriveTaskStatus({
    status: execution.status,
    scheduledAt: execution.scheduledAt,
    executedAt: execution.executedAt,
    now,
  });
  const delay = delayMinutes(execution.scheduledAt, execution.executedAt);
  const critical = isCriticalFailure(execution.weight, status);
  const styles = STATUS_STYLES[status];

  return (
    <button
      type="button"
      onClick={() => onClick?.(execution)}
      className="w-full text-left border border-neutral-200 rounded-lg p-3 bg-white hover:bg-neutral-50 focus:outline-none focus:ring-2 focus:ring-[#FF007F]/40 transition-colors"
      aria-label={`${execution.taskTitle} — ${STATUS_LABEL[status]}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium text-neutral-900 truncate">{execution.taskTitle}</span>
            {critical && (
              <span
                className="inline-flex items-center gap-1 text-[11px] px-1.5 py-0.5 rounded bg-rose-50 text-rose-700 border border-rose-200"
                aria-label="Falha crítica"
              >
                <AlertOctagon className="w-3 h-3" /> Crítica
              </span>
            )}
            {execution.weight !== "comum" && !critical && (
              <span className="inline-flex text-[11px] px-1.5 py-0.5 rounded bg-neutral-100 text-neutral-700 border border-neutral-200">
                {WEIGHT_LABEL[execution.weight]}
              </span>
            )}
          </div>
          <div className="mt-1 flex items-center gap-3 text-xs text-neutral-500 flex-wrap">
            <span className="inline-flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {fmtTime(execution.scheduledAt)}
              {execution.executedAt && (
                <span className="text-neutral-400">→ {fmtTime(execution.executedAt)}</span>
              )}
            </span>
            {execution.shiftName && <span>· {execution.shiftName}</span>}
            {execution.executedByName && <span>· {execution.executedByName}</span>}
            {delay !== null && delay > 0 && (
              <span className="text-amber-700">· atraso {delay} min</span>
            )}
            {execution.evidenceCount > 0 && (
              <span className="inline-flex items-center gap-1">
                <Camera className="w-3 h-3" />
                {execution.evidenceCount}
                {execution.pendingEvidences > 0 && (
                  <span className="text-amber-700">({execution.pendingEvidences} pend.)</span>
                )}
              </span>
            )}
          </div>
          {execution.notes && (
            <p className="text-xs text-neutral-500 mt-1 line-clamp-2">{execution.notes}</p>
          )}
        </div>
        <span
          className={`shrink-0 inline-flex items-center gap-1.5 text-[11px] px-2 py-1 rounded border ${styles.badge}`}
        >
          <span className={`w-1.5 h-1.5 rounded-full ${styles.dot}`} aria-hidden />
          {STATUS_LABEL[status]}
        </span>
      </div>
    </button>
  );
}