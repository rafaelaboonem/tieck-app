import { FileText, CheckCircle2, Clock, AlertTriangle } from "lucide-react";
import { buildHomeOperationalSummary, getHomeAttentionMessage } from "@/lib/home-operational-summary";
import { cn } from "@/lib/utils";

/**
 * Home 6A.1 — compact operational summary shown above the checklist list in
 * `/inicio`. Derived ONLY from the checklists already visible in this screen/
 * context (no extra query, no widened access). `/painel` remains the deep
 * operational analytics area.
 */
export function HomeOperationalSummary({ checklists }: { checklists: any[] }) {
  const summary = buildHomeOperationalSummary(checklists);
  const attention = getHomeAttentionMessage(summary);

  const cards = [
    {
      label: "Checklists",
      value: summary.total,
      Icon: FileText,
      iconClass: "bg-neutral-100 text-neutral-600",
    },
    {
      label: "Concluídos",
      value: summary.concluidos,
      Icon: CheckCircle2,
      iconClass: "bg-green-50 text-green-600",
    },
    {
      label: "Pendentes",
      value: summary.pendentes,
      Icon: Clock,
      iconClass: "bg-blue-50 text-blue-600",
    },
    {
      label: "Atrasados",
      value: summary.atrasados,
      Icon: AlertTriangle,
      iconClass: "bg-red-50 text-red-600",
    },
  ];

  return (
    <section aria-label="Visão de hoje" className="space-y-3">
      <h2 className="text-sm font-semibold text-neutral-500 uppercase tracking-wide">Visão de hoje</h2>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {cards.map(({ label, value, Icon, iconClass }) => (
          <div
            key={label}
            className="bg-white border border-neutral-200 rounded-xl p-3 sm:p-4 shadow-sm flex items-center gap-3 min-w-0"
          >
            <div className={cn("w-9 h-9 rounded-lg flex items-center justify-center shrink-0", iconClass)}>
              <Icon className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <div className="text-xl font-bold leading-tight text-neutral-900 tabular-nums">{value}</div>
              <div className="text-[11px] sm:text-xs font-medium text-neutral-500 truncate">{label}</div>
            </div>
          </div>
        ))}
      </div>
      {attention && (
        <p
          className={cn(
            "text-sm font-semibold flex items-center gap-1.5",
            summary.atrasados > 0 ? "text-red-600" : "text-blue-600"
          )}
        >
          {summary.atrasados > 0 ? <AlertTriangle className="w-4 h-4" /> : <Clock className="w-4 h-4" />}
          {attention}
        </p>
      )}
    </section>
  );
}