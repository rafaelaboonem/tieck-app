/*
 * ============ EXECUÇÃO POR CHECKLIST (REAL, 6B.2J) =========================
 *
 * Card DIREITO da seção "Insights da operação": UMA linha por checklist REAL do
 * recorte (o grão chega pronto da RPC — um checklist que executa em várias
 * unidades/turnos é UMA linha, somando as suas ocorrências; dois checklists com
 * o mesmo título permanecem DUAS linhas, identidade é o id).
 *
 * MÉTRICA ÚNICA E CANÔNICA: taxa de execução das OCORRÊNCIAS DEVIDAS —
 *   due_completed_occurrences / due_occurrences × 100
 * (helper `dueExecutionRate`). NUNCA completed/total: obrigação ainda futura
 * dentro do recorte não pode reduzir artificialmente a performance do checklist.
 * `dueOccurrences === 0` → "—" com "Ainda sem ocorrências devidas": NUNCA 0%.
 *
 * SEM CLASSIFICAÇÃO INVENTADA: nenhum rótulo Excelente/Bom/Crítico e nenhuma
 * cor de threshold — a meta operacional de TAREFAS não é meta de ROTINAS, e
 * ainda não existe regra canônica de status para essa taxa. A leitura é
 * factual: barra neutra/primary, contadores reais, exceções só quando > 0.
 *
 * Sem Supabase aqui: recebe `metrics` pronto (parser fail-closed do hook) e
 * apresenta. Loading/erro/vazio explícitos; quando `onOpenChecklist` existe, o
 * NOME do checklist é o controle de navegação (id REAL, nunca o título) — sem
 * handler, o título é texto normal e nenhuma ação falsa é oferecida.
 * =========================================================================
 */

import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import {
  checklistMetricTitle,
  dueExecutionRate,
  sortChecklistMetricsByTitle,
  type ChecklistExecutionMetric,
} from "@/lib/checklist-execution-metrics";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../kit/ui/card";

/** Percentual com uma casa decimal, no padrão do painel ("94,7%"). */
function fmtPct(value: number | null): string {
  return value === null ? "—" : `${value.toFixed(1).replace(".", ",")}%`;
}

/**
 * Contexto discreto de unidade/turno: apenas o que EXISTE de verdade na linha.
 * Sem unidade → nada; unidade sem turno → só a unidade; com ambos → "Unidade · Turno".
 */
function metricContext(metric: ChecklistExecutionMetric): string {
  return [metric.unitName, metric.shiftName].filter(Boolean).join(" · ");
}

export function RealChecklistExecutionInsights({
  metrics = [],
  loading = false,
  error = false,
  onRetry,
  onOpenChecklist,
  title = "Execução por checklist",
  description = "Ocorrências devidas concluídas no período selecionado",
  className,
}: {
  /** Grão real da RPC 6B.2J: uma linha por checklist_id (nada deduzido aqui). */
  metrics: ChecklistExecutionMetric[];
  loading?: boolean;
  error?: boolean;
  onRetry?: () => void;
  /** Navegação pelo id REAL do checklist (`/checklist?id=<checklistId>`). */
  onOpenChecklist?: (checklistId: string) => void;
  title?: string;
  description?: string;
  className?: string;
}) {
  // Ordem estável aprovada: alfabética por título, id desempata (não é ranking).
  const ordered = sortChecklistMetricsByTitle(metrics);
  const empty = !loading && !error && ordered.length === 0;

  return (
    <Card
      data-testid="checklist-execution-insights"
      data-count={ordered.length}
      className={["h-fit", className].filter(Boolean).join(" ")}
    >
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="px-6">
        {loading ? (
          <div className="flex flex-col gap-3">
            <Skeleton data-testid="checklist-execution-loading" className="h-20 w-full" />
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-20 w-full" />
          </div>
        ) : error ? (
          <div
            data-testid="checklist-execution-error"
            className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-rose-200 bg-rose-50/60 px-4 py-3"
          >
            <p className="text-sm text-rose-700">Falha ao carregar execução por checklist.</p>
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
            data-testid="checklist-execution-empty"
            className="flex h-[180px] w-full flex-col items-center justify-center rounded-lg border border-dashed text-center"
          >
            <p className="text-sm font-medium">Sem execuções de checklist no período</p>
            <p className="text-muted-foreground mt-1 text-xs">
              Nenhuma rotina agendada foi encontrada para o recorte selecionado.
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {ordered.map((metric) => {
              const rate = dueExecutionRate(metric);
              const context = metricContext(metric);
              const barWidth = Math.max(0, Math.min(100, rate ?? 0));
              const isInteractive = !!onOpenChecklist;

              return (
                <div
                  key={metric.checklistId}
                  data-testid="checklist-execution-row"
                  data-checklist-id={metric.checklistId}
                  data-rate={rate ?? ""}
                  data-due={metric.dueOccurrences}
                  data-due-completed={metric.dueCompletedOccurrences}
                  className="rounded-lg border px-4 py-3"
                >
                  <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                    {/* O NOME é o controle de navegação (sem linha extra "Ver
                        Checklist"): com handler, botão discreto — hover/focus
                        com sublinhado — que envia o checklistId REAL; sem
                        handler, texto normal. */}
                    {isInteractive ? (
                      <button
                        type="button"
                        data-testid="checklist-execution-title"
                        onClick={() => onOpenChecklist(metric.checklistId)}
                        className="cursor-pointer rounded-sm text-left text-sm font-medium underline-offset-2 hover:underline focus-visible:underline focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
                      >
                        {checklistMetricTitle(metric)}
                      </button>
                    ) : (
                      <p className="text-sm font-medium" data-testid="checklist-execution-title">
                        {checklistMetricTitle(metric)}
                      </p>
                    )}
                    {/* "—" quando nada é devido ainda: 0% seria semanticamente falso. */}
                    <span
                      className="text-sm font-semibold tabular-nums"
                      data-testid="checklist-execution-rate"
                    >
                      {fmtPct(rate)}
                    </span>
                  </div>

                  {context && (
                    <p className="text-muted-foreground mt-0.5 text-xs">{context}</p>
                  )}

                  {/* Barra neutra/primary — sem threshold, sem cor de status. */}
                  <div className="bg-muted mt-2 h-1.5 w-full overflow-hidden rounded-full">
                    <div
                      role="progressbar"
                      aria-label={`Execução devidas — ${checklistMetricTitle(metric)}`}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-valuenow={rate ?? 0}
                      aria-valuetext={
                        rate === null
                          ? "Ainda sem ocorrências devidas"
                          : fmtPct(rate)
                      }
                      className="bg-primary/80 h-full rounded-full"
                      style={{ width: `${barWidth}%` }}
                    />
                  </div>

                  <p className="text-muted-foreground mt-1 text-[11px]">
                    {rate === null
                      ? "Ainda sem ocorrências devidas"
                      : `${metric.dueCompletedOccurrences} de ${metric.dueOccurrences} devidas concluídas`}
                    {metric.overdueOpenOccurrences > 0 && (
                      <span className="text-amber-700" data-testid="checklist-execution-overdue">
                        {" "}· {metric.overdueOpenOccurrences} abertas em atraso
                      </span>
                    )}
                  </p>

                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
