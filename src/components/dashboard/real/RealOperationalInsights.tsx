/*
 * ==================== INSIGHTS DA OPERAÇÃO (REAL, 6B.2I) ==================
 *
 * Um único Card, uma linha compacta por TURNO REAL do recorte: conformidade
 * ponderada contra a meta operacional, volume concluído e as exceções que
 * existirem. Não é uma lista de frases genéricas: são os mesmos números que os
 * KPIs e a tabela mostram, lidos de outra dimensão da MESMA resposta
 * (`analytics_unit_daily_compliance` via `useUnitCompliance`).
 *
 * O QUE ESTE CARD NÃO FAZ:
 *   • não consulta nada (zero Supabase aqui) — recebe `rows` prontos;
 *   • não promete "execução por checklist": esse recorte ainda não tem contrato
 *     estatístico (a RPC 6B.2E é uma lista limitada de execuções individuais,
 *     não uma série do período), então ele não aparece na descrição;
 *   • não cria classificação paralela: o rótulo de status vem de
 *     `getOperationalStatus` + `STATUS_META`, a regra canônica do domínio;
 *   • não mostra zeros irrelevantes: "Abertas em atraso", "Falhas críticas" e
 *     "Evidências pendentes" só aparecem quando existem de verdade.
 *
 * A barra usa a MESMA meta (target) do painel e traz um marcador na posição da
 * meta, para "quanto falta" ser visual sem texto extra.
 * =========================================================================
 */

import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { STATUS_META, getOperationalStatus } from "@/lib/operational-status";
import {
  isShiftInsightsEmpty,
  shiftDisplayName,
  sortShiftRows,
  type ShiftComplianceRow,
} from "@/lib/shift-compliance";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../kit/ui/card";

const TONE_BAR: Record<string, string> = {
  success: "bg-emerald-500",
  warning: "bg-amber-500",
  error: "bg-rose-500",
  neutral: "bg-neutral-300",
};

/** Percentual com uma casa decimal, no padrão do painel. */
function fmtPct(value: number | null): string {
  return value === null ? "—" : `${value.toFixed(1).replace(".", ",")}%`;
}

export function RealOperationalInsights({
  // Default defensivo: ausência de linhas nunca pode derrubar o card (o
  // contrato é `ShiftComplianceRow[]`; isto é só uma rede de segurança).
  rows = [],
  target,
  loading = false,
  error = false,
  onRetry,
  title = "Insights da operação",
  description = "Conformidade e execução por turno no recorte selecionado",
  className,
}: {
  /** Uma linha por turno REAL (inclui o bucket sem turno, `shiftId === null`). */
  rows: ShiftComplianceRow[];
  /** Meta operacional do produto (mesma do resto do painel). */
  target: number;
  loading?: boolean;
  error?: boolean;
  onRetry?: () => void;
  title?: string;
  description?: string;
  className?: string;
}) {
  const ordered = sortShiftRows(rows);
  const empty = !loading && !error && isShiftInsightsEmpty(rows);

  return (
    <Card data-testid="operational-insights" className={["h-fit", className].filter(Boolean).join(" ")}>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="px-6">
        {loading ? (
          <div className="flex flex-col gap-3">
            <Skeleton data-testid="operational-insights-loading" className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
          </div>
        ) : error ? (
          <div
            data-testid="operational-insights-error"
            className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-rose-200 bg-rose-50/60 px-4 py-3"
          >
            <p className="text-sm text-rose-700">Não foi possível carregar os insights da operação.</p>
            {onRetry && (
              <button
                type="button"
                onClick={onRetry}
                className="cursor-pointer rounded-md border border-rose-300 px-3 py-1.5 text-[13px] font-medium text-rose-700 transition-colors hover:bg-rose-100"
              >
                Tentar novamente
              </button>
            )}
          </div>
        ) : empty ? (
          <div
            data-testid="operational-insights-empty"
            className="flex h-[180px] w-full flex-col items-center justify-center rounded-lg border border-dashed text-center"
          >
            <p className="text-sm font-medium">Sem dados por turno no período</p>
            <p className="text-muted-foreground mt-1 text-xs">
              Nenhuma tarefa programada foi encontrada para o recorte selecionado.
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {ordered.map((row) => {
              const status = getOperationalStatus({
                dueCompliancePercentage: row.dueCompliancePercentage,
                dueWeightTotal: row.dueWeightTotal,
                criticalFailures: row.criticalFailures,
                overdueOpenTasks: row.overdueOpenTasks,
                completedLate: row.completedLate,
              });
              const meta = STATUS_META[status];
              const name = shiftDisplayName(row);
              const barWidth = Math.max(0, Math.min(100, row.dueCompliancePercentage ?? 0));

              return (
                <div
                  key={row.shiftId ?? "__no-shift__"}
                  data-testid="shift-insight"
                  data-shift-id={row.shiftId ?? ""}
                  data-compliance={row.dueCompliancePercentage ?? ""}
                  data-completion={row.completionPercentage ?? ""}
                  className="rounded-lg border px-4 py-3"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-medium">{name}</p>
                    <span
                      className="text-muted-foreground flex items-center gap-1.5 text-[10px] font-semibold tracking-wide uppercase"
                      data-testid="shift-status"
                    >
                      <span aria-hidden="true" className={cn("size-1.5 rounded-full", meta.dot)} />
                      {meta.label}
                    </span>
                  </div>

                  <div className="mt-2 flex items-baseline justify-between gap-4">
                    <span className="text-muted-foreground text-xs">Conformidade</span>
                    <span className="text-sm font-semibold tabular-nums">
                      {fmtPct(row.dueCompliancePercentage)}
                    </span>
                  </div>

                  {/* Barra + marcador da meta: mesma meta operacional do painel. */}
                  <div className="relative mt-1.5">
                    <div
                      role="progressbar"
                      aria-label={`Conformidade — ${name}`}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-valuenow={row.dueCompliancePercentage ?? 0}
                      aria-valuetext={
                        row.dueCompliancePercentage === null
                          ? "Sem tarefas com prazo vencido no período"
                          : fmtPct(row.dueCompliancePercentage)
                      }
                      className="bg-muted h-1.5 w-full overflow-hidden rounded-full"
                    >
                      <div
                        className={cn("h-full rounded-full", TONE_BAR[meta.tone])}
                        style={{ width: `${barWidth}%` }}
                      />
                    </div>
                    <span
                      aria-hidden="true"
                      title={`Meta ${target}%`}
                      className="bg-foreground/25 absolute inset-y-0 w-px"
                      style={{ left: `${Math.max(0, Math.min(100, target))}%` }}
                    />
                  </div>

                  <p className="text-muted-foreground mt-1 text-[11px]">
                    Meta operacional {target}%
                  </p>

                  <div className="text-muted-foreground mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs">
                    <span>
                      Concluídas{" "}
                      <strong className="text-foreground font-medium tabular-nums">
                        {row.completedTasks}/{row.totalScheduledTasks}
                      </strong>
                      {row.completionPercentage !== null && (
                        <span className="ml-1">
                          · {fmtPct(row.completionPercentage)} do programado
                        </span>
                      )}
                    </span>
                    <span>
                      No prazo <strong className="text-foreground font-medium tabular-nums">{row.completedOnTime}</strong>
                    </span>
                    <span>
                      Com atraso <strong className="text-foreground font-medium tabular-nums">{row.completedLate}</strong>
                    </span>
                    {/* Só o que existe: zero não é informação. */}
                    {row.overdueOpenTasks > 0 && (
                      <span className="text-amber-700" data-testid="shift-overdue-open">
                        Abertas em atraso{" "}
                        <strong className="font-medium tabular-nums">{row.overdueOpenTasks}</strong>
                      </span>
                    )}
                    {row.criticalFailures > 0 && (
                      <span className="text-rose-700" data-testid="shift-critical">
                        Falhas críticas{" "}
                        <strong className="font-medium tabular-nums">{row.criticalFailures}</strong>
                      </span>
                    )}
                    {row.pendingEvidences > 0 && (
                      <span data-testid="shift-evidences">
                        Evidências pendentes{" "}
                        <strong className="text-foreground font-medium tabular-nums">
                          {row.pendingEvidences}
                        </strong>
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
