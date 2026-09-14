import { Clock, User } from "lucide-react";
import { Badge } from "@/components/tremor/ui/Badge";
import {
  deriveOccurrenceDashboardStatus,
  formatOccurrenceDashboardStatus,
  occurrenceStatusBadgeVariant,
  type WorkspaceExecutionOccurrence,
} from "@/lib/occurrence-dashboard";

/**
 * 6B.2D — the "Rotinas" tab rows.
 *
 * Occurrences are rendered with their OWN model: they are never converted into
 * an `OperationalExecution` nor appended to the task list, so the four routine
 * states cannot be confused with the task statuses.
 *
 * The lifecycle is the 5E truth (via lib/occurrence-dashboard): completed
 * on-time and completed-late are different outcomes, and `started_at` never
 * means completed.
 */
function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

function fmtDate(isoDate: string): string {
  const [y, m, d] = isoDate.split("-");
  return `${d}/${m}/${y}`;
}

export function OperationalOccurrenceList({
  occurrences,
  loading,
  now,
  emptyMessage = "Nenhuma rotina agendada no período.",
}: {
  occurrences: WorkspaceExecutionOccurrence[];
  loading?: boolean;
  now?: Date;
  emptyMessage?: string;
}) {
  if (loading && occurrences.length === 0) {
    return (
      <div className="py-8 text-center text-sm text-neutral-500" role="status">
        Carregando rotinas…
      </div>
    );
  }

  if (occurrences.length === 0) {
    return (
      <div className="py-8 text-center text-sm text-neutral-500" data-testid="occurrences-empty">
        {emptyMessage}
      </div>
    );
  }

  return (
    <ul className="space-y-2" data-testid="occurrence-list">
      {occurrences.map((occurrence) => {
        const status = deriveOccurrenceDashboardStatus(occurrence, now);
        return (
          <li
            key={occurrence.occurrenceId}
            data-testid={`occurrence-item-${occurrence.occurrenceId}`}
            data-occurrence-status={status}
            className="border border-neutral-200 rounded-lg p-3 bg-white"
          >
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium text-neutral-900 truncate">
                    {occurrence.checklistTitle}
                  </span>
                  <span className="text-[11px] px-1.5 py-0.5 rounded bg-neutral-100 text-neutral-600 border border-neutral-200 tabular-nums">
                    {fmtDate(occurrence.occurrenceDate)}
                  </span>
                </div>
                <div className="mt-1 flex items-center gap-3 text-xs text-neutral-500 flex-wrap">
                  <span className="inline-flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    vence {fmtTime(occurrence.dueAt)}
                    {occurrence.completedAt && (
                      <span className="text-neutral-400">
                        → concluída {fmtTime(occurrence.completedAt)}
                      </span>
                    )}
                    {!occurrence.completedAt && occurrence.startedAt && (
                      <span className="text-neutral-400">
                        · iniciada {fmtTime(occurrence.startedAt)}
                      </span>
                    )}
                  </span>
                  {occurrence.shiftName && <span>· {occurrence.shiftName}</span>}
                  {occurrence.responsibleName && (
                    <span className="inline-flex items-center gap-1">
                      <User className="w-3 h-3" />
                      {occurrence.responsibleName}
                    </span>
                  )}
                </div>
              </div>
              <Badge variant={occurrenceStatusBadgeVariant(status)} className="whitespace-nowrap">
                {formatOccurrenceDashboardStatus(status)}
              </Badge>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
