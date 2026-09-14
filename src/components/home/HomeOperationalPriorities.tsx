import { AlertTriangle, Clock, ChevronRight, ScanEye, CalendarClock } from "lucide-react";
import {
  buildHomeOperationalPriorities,
  formatDueDateShort,
} from "@/lib/home-operational-summary";
import {
  buildHomeOccurrencePriorities,
  formatOccurrencePriorityStatus,
  type HomeExecutionOccurrence,
  type HomeOccurrencePriorityItem,
} from "@/lib/home-execution-occurrences";
import { formatNonApprovedVerificationLabel, type HomeCameraAttentionByChecklist } from "@/lib/home-camera-attention";
import { cn } from "@/lib/utils";

/** Kind of action the priority row should trigger in the route. */
export type HomePriorityOpenKind = "deadline" | "camera";

/**
 * Home 6A.2 / 6A.3 — actionable "Prioridades" section for `/inicio`.
 *
 * Shown ONLY when at least one visible checklist demands attention (atrasado,
 * pendente, and/or Camera AI rejection in the latest submission). Derived
 * exclusively from the `checklists` array the route already loaded plus the
 * Camera AI attention map resolved for those same ids — no new query, no
 * widened access. The open callback keeps the navigation rule explicit in the
 * route (deadline: Viewer → /executar/$id, others → /checklist?id=...;
 * camera: → /checklist?id=...&settings=true (abre Configurações, aba Envios).
 *
 * Home 6B.2C — scheduled occurrences are rendered FIRST, as their own rows.
 * A recurring routine is a different entity from a legacy assignment, so the
 * two are never collapsed: each occurrence is one actionable obligation with
 * its own occurrenceId (yesterday's overdue and today's obligation are both
 * reachable), and its open callback deliberately does NOT depend on the role —
 * the member is fulfilling something attributed to them.
 */
export function HomeOperationalPriorities({
  checklists,
  attentionByChecklist = {},
  occurrences = [],
  onOpen,
  onOpenOccurrence,
}: {
  checklists: any[];
  attentionByChecklist?: HomeCameraAttentionByChecklist;
  /** Open scheduled occurrences of the authenticated responsible member. */
  occurrences?: HomeExecutionOccurrence[];
  onOpen: (checklistId: string, kind: HomePriorityOpenKind) => void;
  onOpenOccurrence?: (occurrence: HomeOccurrencePriorityItem) => void;
}) {
  const { items, remaining } = buildHomeOperationalPriorities(checklists, {
    attention: attentionByChecklist,
  });
  const occurrencePriorities = buildHomeOccurrencePriorities(occurrences);

  if (items.length === 0 && occurrencePriorities.items.length === 0) return null;

  return (
    <section aria-label="Prioridades" className="space-y-2">
      <h2 className="text-sm font-semibold text-neutral-500 uppercase tracking-wide">Prioridades</h2>
      <div className="bg-white border border-neutral-200 rounded-xl shadow-sm divide-y divide-neutral-100 overflow-hidden">
        {occurrencePriorities.items.map((item) => {
          const atrasada = item.status === "atrasada";
          const due = formatDueDateShort(item.dueAt);
          return (
            <button
              key={item.occurrenceId}
              type="button"
              data-testid="home-occurrence-priority"
              data-occurrence-id={item.occurrenceId}
              onClick={() => onOpenOccurrence?.(item)}
              className="w-full flex items-center gap-3 px-3 sm:px-4 py-3 text-left cursor-pointer hover:bg-neutral-50 transition-colors group"
            >
              <span
                className={cn(
                  "w-8 h-8 rounded-lg flex items-center justify-center shrink-0",
                  atrasada ? "bg-red-50 text-red-600" : "bg-blue-50 text-blue-600"
                )}
              >
                {atrasada ? <AlertTriangle className="w-4 h-4" /> : <Clock className="w-4 h-4" />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-semibold text-sm text-neutral-900 truncate group-hover:text-pink-500 transition-colors">
                  {item.checklistTitle}
                </span>
                <span className="block text-xs text-neutral-500">
                  {formatOccurrencePriorityStatus(item.status)}
                  {due && <span className="opacity-70"> · prazo {due}</span>}
                </span>
                <span className="mt-0.5 inline-flex items-center gap-1 text-[11px] font-medium text-neutral-400">
                  <CalendarClock className="w-3.5 h-3.5 shrink-0" />
                  Rotina agendada · {item.occurrenceDate}
                </span>
              </span>
              <span className="flex items-center gap-1 text-xs font-medium text-neutral-500 shrink-0">
                Executar
                <ChevronRight className="w-3.5 h-3.5" />
              </span>
            </button>
          );
        })}
        {occurrencePriorities.remaining > 0 && (
          <div className="px-3 sm:px-4 py-2.5 text-xs text-neutral-500">
            + {occurrencePriorities.remaining}{" "}
            {occurrencePriorities.remaining === 1 ? "outra rotina agendada" : "outras rotinas agendadas"}
          </div>
        )}
        {items.map((item) => {
          const atrasado = item.status === "atrasado";
          const pendente = item.status === "pendente";
          const hasIaRejection = item.rejectedCount > 0;
          const due = formatDueDateShort(item.dueAt);
          const openKind: HomePriorityOpenKind = hasIaRejection ? "camera" : "deadline";
          return (
            <button
              key={item.checklistId}
              type="button"
              onClick={() => onOpen(item.checklistId, openKind)}
              className="w-full flex items-center gap-3 px-3 sm:px-4 py-3 text-left cursor-pointer hover:bg-neutral-50 transition-colors group"
            >
              <span
                className={cn(
                  "w-8 h-8 rounded-lg flex items-center justify-center shrink-0",
                  atrasado || (!pendente && hasIaRejection)
                    ? "bg-red-50 text-red-600"
                    : "bg-blue-50 text-blue-600"
                )}
              >
                {atrasado || (!pendente && hasIaRejection) ? (
                  <AlertTriangle className="w-4 h-4" />
                ) : (
                  <Clock className="w-4 h-4" />
                )}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-semibold text-sm text-neutral-900 truncate group-hover:text-pink-500 transition-colors">
                  {item.title}
                </span>
                {item.status && (
                  <span className="block text-xs text-neutral-500">
                    {atrasado ? "Atrasado" : "Pendente"}
                    {due && <span className="opacity-70"> · prazo {due}</span>}
                  </span>
                )}
                {hasIaRejection && (
                  <span className="mt-0.5 inline-flex items-center gap-1 text-xs font-medium text-red-600">
                    <ScanEye className="w-3.5 h-3.5 shrink-0" />
                    {formatNonApprovedVerificationLabel(item.rejectedCount)}
                  </span>
                )}
              </span>
              <span className="flex items-center gap-1 text-xs font-medium text-neutral-500 shrink-0">
                {hasIaRejection ? "Ver envio" : "Abrir"}
                <ChevronRight className="w-3.5 h-3.5" />
              </span>
            </button>
          );
        })}
        {remaining > 0 && (
          <div className="px-3 sm:px-4 py-2.5 text-xs text-neutral-500">
            + {remaining} {remaining === 1 ? "outra prioridade" : "outras prioridades"}
          </div>
        )}
      </div>
    </section>
  );
}