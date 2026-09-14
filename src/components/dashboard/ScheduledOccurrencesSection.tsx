import React from "react";
import { Badge } from "@/components/tremor/ui/Badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/tremor/ui/Card";
import { CalendarClock, CheckCircle2, Clock, Hourglass, ListChecks } from "lucide-react";
import type { OccurrenceKpis, UnitOccurrenceRow } from "@/lib/occurrence-dashboard";

/**
 * 6B.2D — "Rotinas agendadas": the recurring-routine surface of /painel.
 *
 * Deliberately a SEPARATE section from the task KPIs. Recurring routines
 * (checklist_execution_occurrences) and programmed task executions
 * (task_executions) are different entities, so they are counted, labelled and
 * rendered apart: the cards above this section never include a routine, and
 * these cards never include a task. Merging them would double count the same
 * real-world obligation; deduplicating by heuristic would be a guess.
 */
export function ScheduledOccurrencesSection({
  rows,
  kpis,
  loading,
  error,
  onRetry,
  onUnitClick,
}: {
  rows: UnitOccurrenceRow[];
  kpis: OccurrenceKpis;
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
  onUnitClick?: (unitId: string) => void;
}) {
  const empty = !loading && !error && rows.length === 0;

  return (
    <section aria-labelledby="occurrences-title" data-testid="scheduled-occurrences-section">
      <div className="flex items-baseline justify-between mb-3 gap-3 flex-wrap">
        <div>
          <h2 id="occurrences-title" className="text-sm font-semibold text-neutral-700">
            Rotinas agendadas
          </h2>
          <p className="text-xs text-neutral-400">
            Contadas à parte das tarefas programadas — uma rotina recorrente gera uma obrigação por
            dia.
          </p>
        </div>
        <Badge variant="neutral">{rows.length} unidades</Badge>
      </div>

      {error && (
        <Card>
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm text-rose-600">{error}</p>
            {onRetry && (
              <Button variant="outline" size="sm" onClick={() => onRetry()}>
                Tentar novamente
              </Button>
            )}
          </div>
        </Card>
      )}

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 mt-3">
        <OccurrenceMetricCard
          label="Previstas"
          value={kpis.total}
          hint="Obrigações materializadas no período."
          icon={<CalendarClock className="w-4 h-4" />}
          accent="bg-blue-50 text-blue-600"
          loading={loading}
        />
        <OccurrenceMetricCard
          label="Concluídas"
          value={kpis.completed}
          hint={`${kpis.completedOnTime} no prazo · ${kpis.completedLate} com atraso`}
          icon={<CheckCircle2 className="w-4 h-4" />}
          accent="bg-emerald-50 text-emerald-600"
          loading={loading}
        />
        <OccurrenceMetricCard
          label="Abertas em atraso"
          value={kpis.overdueOpen}
          hint="Vencidas e ainda não concluídas."
          icon={<Clock className="w-4 h-4" />}
          accent="bg-amber-50 text-amber-700"
          loading={loading}
        />
        <OccurrenceMetricCard
          label="Pendentes"
          value={kpis.pendingOpen}
          hint="Abertas dentro do prazo."
          icon={<ListChecks className="w-4 h-4" />}
          accent="bg-neutral-100 text-neutral-700"
          loading={loading}
        />
        <OccurrenceMetricCard
          label="Deveriam ter ocorrido"
          value={kpis.due}
          hint="Vencidas até agora, concluídas ou não."
          icon={<Hourglass className="w-4 h-4" />}
          accent="bg-amber-50 text-amber-600"
          loading={loading}
        />
      </div>

      <div className="flex items-baseline justify-between mt-6 mb-3">
        <h3 className="text-sm font-semibold text-neutral-700">Rotinas por unidade</h3>
        <p className="text-xs text-neutral-400">Sem rotina agendada, a unidade não aparece aqui.</p>
      </div>

      <Card>
        {loading && rows.length === 0 ? (
          <div className="py-10 text-center text-sm text-neutral-500" role="status">
            Carregando rotinas…
          </div>
        ) : empty ? (
          <div className="py-10 text-center">
            <p className="text-sm font-semibold text-neutral-700">
              Sem rotinas agendadas no período
            </p>
            <p className="text-xs text-neutral-500 mt-1">
              Nenhuma obrigação recorrente foi materializada para as unidades no período
              selecionado.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[640px]" data-testid="occurrences-unit-table">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-neutral-500 border-b border-neutral-200">
                  <th className="py-2 pr-4 font-medium">Unidade</th>
                  <th className="py-2 pr-4 font-medium">Previstas</th>
                  <th className="py-2 pr-4 font-medium">Concluídas</th>
                  <th className="py-2 pr-4 font-medium">Em atraso</th>
                  <th className="py-2 pr-4 font-medium">Pendentes</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr
                    key={row.unitId}
                    tabIndex={onUnitClick ? 0 : -1}
                    onClick={() => onUnitClick?.(row.unitId)}
                    onKeyDown={(e) => {
                      if ((e.key === "Enter" || e.key === " ") && onUnitClick) {
                        e.preventDefault();
                        onUnitClick(row.unitId);
                      }
                    }}
                    className={`border-b border-neutral-100 last:border-b-0 ${
                      onUnitClick ? "cursor-pointer hover:bg-neutral-50 focus:bg-neutral-50" : ""
                    }`}
                    data-testid={`occurrence-unit-row-${row.unitId}`}
                  >
                    <td className="py-2 pr-4 font-medium text-neutral-800">{row.unitName}</td>
                    <td className="py-2 pr-4 tabular-nums">{row.totalOccurrences}</td>
                    <td className="py-2 pr-4 tabular-nums">
                      {row.completedOccurrences}
                      {row.completedLate > 0 && (
                        <span className="text-[11px] text-neutral-400 ml-1">
                          ({row.completedLate} com atraso)
                        </span>
                      )}
                    </td>
                    <td className="py-2 pr-4 tabular-nums">{row.overdueOpenOccurrences}</td>
                    <td className="py-2 pr-4 tabular-nums">{row.pendingOpenOccurrences}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </section>
  );
}

function OccurrenceMetricCard({
  label,
  value,
  icon,
  accent,
  hint,
  loading,
}: {
  label: string;
  value: number | string;
  icon: React.ReactNode;
  accent: string;
  hint?: string;
  loading?: boolean;
}) {
  return (
    <div className="bg-white border border-neutral-200/70 rounded-xl p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-neutral-500">{label}</span>
        <span className={`w-7 h-7 rounded-lg flex items-center justify-center ${accent}`}>
          {icon}
        </span>
      </div>
      {loading ? (
        <div
          className="mt-2 h-7 w-20 rounded bg-neutral-100 animate-pulse"
          aria-label="Carregando"
        />
      ) : (
        <div className="mt-2 text-2xl font-bold text-neutral-900">{value}</div>
      )}
      {hint && <p className="text-[11px] text-neutral-400 mt-1 leading-snug">{hint}</p>}
    </div>
  );
}
