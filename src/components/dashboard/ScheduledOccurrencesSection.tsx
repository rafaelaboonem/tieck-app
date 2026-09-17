import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tracker } from "@/components/tremor/ui/Tracker";
import type { OccurrenceKpis, UnitOccurrenceRow } from "@/lib/occurrence-dashboard";
import { cn } from "@/lib/utils";

/**
 * 6B.2D — "Rotinas agendadas": the recurring-routine surface of /painel.
 *
 * Deliberately a SEPARATE section from the task KPIs. Recurring routines
 * (checklist_execution_occurrences) and programmed task executions
 * (task_executions) are different entities, so they are counted, labelled and
 * rendered apart: the tiles above this table never include a task, and these
 * numbers never include a routine. Merging them would double count the same
 * real-world obligation; deduplicating by heuristic would be a guess.
 *
 * Apresentação transplantada do `CustomerInsights`/`TopProducts` do
 * shadcn-dashboard-landing-template (MIT): Card com header próprio, tiles de
 * métrica `rounded-lg border p-4`, faixa de situação (Tracker do Tremor) e
 * tabela dentro de `rounded-lg border` com hover por linha.
 *
 * `showSummary` e `showByUnit` existem para o preview DEV, que permite esconder
 * os dois blocos separadamente ("Rotinas agendadas" × "Rotinas por unidade").
 * No /painel real nada muda: ambos continuam ligados por padrão.
 */
export function ScheduledOccurrencesSection({
  rows,
  kpis,
  loading,
  error,
  onRetry,
  onUnitClick,
  className,
  showSummary = true,
  showByUnit = true,
}: {
  rows: UnitOccurrenceRow[];
  kpis: OccurrenceKpis;
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
  onUnitClick?: (unitId: string) => void;
  /** Classe extra no Card (ex.: microinteração de hover do preview). */
  className?: string;
  /** Resumo (tiles + situação por unidade). */
  showSummary?: boolean;
  /** Tabela "Rotinas por unidade". */
  showByUnit?: boolean;
}) {
  const empty = !loading && !error && rows.length === 0;

  const trackerData = rows.map((row) => {
    const overdue = row.overdueOpenOccurrences > 0;
    const pending = row.pendingOpenOccurrences > 0;
    const finished = !overdue && !pending && row.totalOccurrences > 0;
    return {
      key: row.unitId,
      color: overdue
        ? "bg-rose-500"
        : pending
          ? "bg-amber-400"
          : finished
            ? "bg-emerald-500"
            : "bg-neutral-200",
      tooltip: `${row.unitName} · ${row.completedOccurrences}/${row.totalOccurrences} concluídas${
        overdue ? ` · ${row.overdueOpenOccurrences} em atraso` : ""
      }`,
    };
  });

  return (
    <Card
      className={cn("flex flex-col shadow-xs", className)}
      data-testid="scheduled-occurrences-section"
      aria-labelledby="occurrences-title"
    >
      <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-4">
        <div>
          <CardTitle className="text-base">
            <h2 id="occurrences-title">Rotinas agendadas</h2>
          </CardTitle>
          <CardDescription>
            Contadas à parte das tarefas programadas — uma rotina recorrente gera uma obrigação por
            dia.
          </CardDescription>
        </div>
        {rows.length > 0 && (
          <Badge variant="outline" className="font-normal text-muted-foreground">
            {rows.length} unidades
          </Badge>
        )}
      </CardHeader>

      <CardContent className="flex-1">
        {error && (
          <div className="mb-4 flex items-center justify-between gap-3 rounded-lg border border-rose-200 bg-rose-50/60 px-3.5 py-3">
            <p className="text-sm text-rose-700">{error}</p>
            {onRetry && (
              <Button variant="outline" size="sm" onClick={() => onRetry()}>
                Tentar novamente
              </Button>
            )}
          </div>
        )}

        {showSummary && (
          <>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <OccurrenceTile
                label="Previstas"
                value={kpis.total}
                hint="Obrigações no período"
                loading={loading}
              />
              <OccurrenceTile
                label="Concluídas"
                value={kpis.completed}
                hint={`${kpis.completedOnTime} no prazo · ${kpis.completedLate} com atraso`}
                loading={loading}
              />
              <OccurrenceTile
                label="Abertas em atraso"
                value={kpis.overdueOpen}
                hint="Vencidas e não concluídas"
                loading={loading}
                tone={kpis.overdueOpen > 0 ? "warning" : "neutral"}
              />
              <OccurrenceTile
                label="Pendentes"
                value={kpis.pendingOpen}
                hint="Abertas dentro do prazo"
                loading={loading}
              />
              <OccurrenceTile
                label="Deveriam ter ocorrido"
                value={kpis.due}
                hint="Vencidas até agora"
                loading={loading}
              />
            </div>

            {trackerData.length >= 5 && (
              <div className="mt-5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-medium text-muted-foreground">Situação por unidade</p>
                  <div className="flex items-center gap-4">
                    <Legend color="bg-emerald-500" label="Em dia" />
                    <Legend color="bg-amber-400" label="Pendente" />
                    <Legend color="bg-rose-500" label="Em atraso" />
                  </div>
                </div>
                <Tracker
                  data={trackerData}
                  defaultBackgroundColor="bg-neutral-200"
                  hoverEffect
                  className="mt-2 h-9 max-w-[560px]"
                  aria-label="Situação das rotinas por unidade"
                />
              </div>
            )}
          </>
        )}

        {showByUnit && (
          <>
            <div className={cn("mb-3 flex items-baseline justify-between gap-3", showSummary && "mt-6")}>
              <h3 className="text-sm font-semibold">
                Rotinas por unidade
              </h3>
              <p className="text-xs text-muted-foreground">
                Sem rotina agendada, a unidade não aparece aqui.
              </p>
            </div>

            {loading && rows.length === 0 ? (
              <div className="rounded-lg border py-6 text-center text-sm text-muted-foreground">
                Carregando rotinas…
              </div>
            ) : empty ? (
              <div className="rounded-lg border border-dashed py-6 text-center">
                <p className="text-sm font-medium">Sem rotinas agendadas no período</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Nenhuma obrigação recorrente foi materializada para as unidades no período
                  selecionado.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto rounded-lg border">
                <table className="w-full min-w-[540px] text-sm" data-testid="occurrences-unit-table">
                  <thead>
                    <tr className="border-b bg-muted/50 text-left">
                      <th className="px-3 py-2.5 text-xs font-semibold text-muted-foreground">
                        Unidade
                      </th>
                      <th className="px-3 py-2.5 text-right text-xs font-semibold text-muted-foreground">
                        Previstas
                      </th>
                      <th className="px-3 py-2.5 text-right text-xs font-semibold text-muted-foreground">
                        Concluídas
                      </th>
                      <th className="px-3 py-2.5 text-right text-xs font-semibold text-muted-foreground">
                        Em atraso
                      </th>
                      <th className="px-3 py-2.5 text-right text-xs font-semibold text-muted-foreground">
                        Pendentes
                      </th>
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
                        className={cn(
                          "border-b last:border-b-0 transition-colors",
                          onUnitClick
                            ? "cursor-pointer hover:bg-muted/30 focus:bg-muted/30 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#FF007F]/40 focus-visible:ring-inset"
                            : "",
                        )}
                        data-testid={`occurrence-unit-row-${row.unitId}`}
                      >
                        <td className="px-3 py-2.5 font-medium">{row.unitName}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground">
                          {row.totalOccurrences}
                        </td>
                        <td className="px-3 py-2.5 text-right tabular-nums">
                          {row.completedOccurrences}
                        </td>
                        <td
                          className={cn(
                            "px-3 py-2.5 text-right tabular-nums",
                            row.overdueOpenOccurrences > 0
                              ? "font-semibold text-amber-700"
                              : "text-muted-foreground",
                          )}
                        >
                          {row.overdueOpenOccurrences}
                        </td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground">
                          {row.pendingOpenOccurrences}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
      <span aria-hidden="true" className={cn("h-2 w-2 rounded-full", color)} />
      {label}
    </span>
  );
}

function OccurrenceTile({
  label,
  value,
  hint,
  loading,
  tone = "neutral",
}: {
  label: string;
  value: number | string;
  hint: string;
  loading?: boolean;
  tone?: "neutral" | "warning";
}) {
  return (
    <div className="rounded-lg border p-4">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p
        className={cn(
          "mt-1 text-2xl font-bold tabular-nums",
          tone === "warning" && !loading ? "text-amber-700" : undefined,
        )}
      >
        {loading ? "—" : value}
      </p>
      <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
    </div>
  );
}
