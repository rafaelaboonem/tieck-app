import { AlertTriangle, CalendarClock } from "lucide-react";
import type { HomeOpenOccurrenceCounts } from "@/lib/home-execution-occurrences";
import { cn } from "@/lib/utils";

/**
 * Home 6B.2C — recurring scheduled obligations, reported SEPARATELY.
 *
 * A `checklist_execution_occurrence` is not a `checklist_assignment`: there is
 * no provable equivalence between them, so the figures are never merged into
 * the checklist summary and never deduplicated by heuristic. This block is its
 * own labelled group, which is also why it is its own component instead of an
 * extra prop on HomeOperationalSummary.
 *
 * Rendered only when there is something to report: `occurrenceCounts` is
 * omitted when the read is off (personal context / unresolved workspace) or
 * failed, so a failure is never presented as a real zero.
 */
export function HomeOccurrenceSummary({
  occurrenceCounts,
}: {
  occurrenceCounts?: HomeOpenOccurrenceCounts;
}) {
  if (!occurrenceCounts || occurrenceCounts.total <= 0) return null;

  const cards = [
    {
      label: "Rotinas atrasadas",
      value: occurrenceCounts.atrasadas,
      Icon: AlertTriangle,
      iconClass: "bg-red-50 text-red-600",
    },
    {
      label: "Rotinas pendentes",
      value: occurrenceCounts.pendentes,
      Icon: CalendarClock,
      iconClass: "bg-blue-50 text-blue-600",
    },
  ];

  return (
    <div className="space-y-2" data-testid="home-occurrence-summary">
      <h3 className="text-xs font-semibold text-neutral-400 uppercase tracking-wide">
        Rotinas agendadas{" "}
        <span className="normal-case font-medium tracking-normal">
          (contadas à parte dos checklists)
        </span>
      </h3>
      <div className="grid grid-cols-2 gap-3">
        {cards.map(({ label, value, Icon, iconClass }) => (
          <div
            key={label}
            className="bg-white border border-neutral-200 rounded-xl p-3 shadow-sm flex items-center gap-3 min-w-0"
          >
            <div
              className={cn(
                "w-9 h-9 rounded-lg flex items-center justify-center shrink-0",
                iconClass,
              )}
            >
              <Icon className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <div className="text-xl font-bold leading-tight text-neutral-900 tabular-nums">
                {value}
              </div>
              <div className="text-[11px] sm:text-xs font-medium text-neutral-500 truncate">
                {label}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
