/*
 * ==================== ATIVIDADE DOS CHECKLISTS (REAL) =====================
 *
 * Gráfico temporal com DUAS séries: tarefas programadas e tarefas concluídas por
 * dia, no recorte atual do painel.
 *
 * SHELL VISUAL: o mesmo `ChartAreaInteractive` aprovado na vitrine
 * (Card + `AreaChart` com gradientes verticais, grid horizontal, tooltip com
 * indicador "dot" e eixo X formatado por data). O que NÃO veio do template:
 *
 *   • o seletor de intervalo (30/15/7 dias) — o recorte de período do painel é a
 *     toolbar (`/painel?startDate=…&endDate=…`). Um segundo seletor aqui seria
 *     um filtro paralelo, capaz de discordar do resto da página; por isso ele foi
 *     removido em vez de ficar inerte;
 *   • as duas áreas NÃO são empilhadas: "concluídas" é subconjunto de
 *     "programadas" — empilhar inflaria o total e sugeriria um número falso;
 *   • LEGENDA discreta no header (ponto + rótulo), alimentada pela MESMA config
 *     das séries — a cor da legenda, da curva e do tooltip é uma só;
 *   • INTERPOLAÇÃO `linear`: a série é de contagens DIÁRIAS discretas, então a
 *     curva passa exatamente pelos pontos do dia. `monotone`/`natural`
 *     arredondavam as quinas e davam aparência de onda contínua que o dado não
 *     tem (os valores e a quantidade de pontos são os mesmos — muda só o traço);
 *   • RESPIRO horizontal no plot (`margin` esquerda/direita): o primeiro e o
 *     último ponto do recorte deixam de encostar na borda, sem remover nenhum
 *     ponto nem aumentar o card.
 *
 * SEMÂNTICA: a fonte é `analytics_unit_daily_compliance`, o mesmo domínio dos
 * KPIs de tarefa. As séries se chamam "Programadas" e "Concluídas"; nunca
 * "Respondidas" — isto NÃO é resposta de checklist nem ocorrência de rotina.
 *
 * ESTADOS: loading (esqueleto no lugar do gráfico) → erro (com retry) → vazio
 * honesto quando o recorte inteiro é zero. Nenhum gráfico zerado é desenhado
 * para "parecer" que há dado, e nenhum número vem de fixture: este componente
 * recebe a série pronta.
 * =========================================================================
 */

import * as React from "react";
import { Area, AreaChart, CartesianGrid, XAxis } from "recharts";

import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "../kit/ui/card";
import {
  type ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "../kit/ui/chart";
import { formatShortDay } from "../panel/filters";
import type { ChecklistActivityDay } from "@/lib/checklist-activity";

/**
 * Configuração das séries (rótulos do tooltip). Exportada para que os testes
 * possam provar que o vocabulário é de TAREFA e que nenhum rótulo diz
 * "Respondidas".
 */
export const CHECKLIST_ACTIVITY_CHART_CONFIG = {
  scheduled: {
    label: "Programadas",
    color: "var(--chart-5)",
  },
  completed: {
    label: "Concluídas",
    color: "var(--primary)",
  },
} satisfies ChartConfig;

const chartConfig = CHECKLIST_ACTIVITY_CHART_CONFIG;

/** Séries na ordem da legenda (mesma ordem das áreas desenhadas). */
const LEGEND_SERIES = ["scheduled", "completed"] as const;

/**
 * Legenda compacta do header: ponto colorido + rótulo, sem caixa. Cor e texto
 * vêm da MESMA config das séries, então legenda, curva e tooltip nunca divergem.
 */
function ActivityLegend() {
  return (
    <div
      data-testid="checklist-activity-legend"
      className="text-muted-foreground flex items-center gap-3 text-xs font-medium"
    >
      {LEGEND_SERIES.map((key) => (
        <span key={key} className="flex items-center gap-1.5">
          <span
            aria-hidden="true"
            className="size-2 shrink-0 rounded-full"
            style={{ backgroundColor: chartConfig[key].color }}
          />
          {chartConfig[key].label}
        </span>
      ))}
    </div>
  );
}

export function RealChecklistActivity({
  data,
  loading = false,
  error = false,
  onRetry,
  title = "Atividade dos checklists",
  description = "Tarefas programadas e concluídas por dia",
  empty,
  className,
}: {
  /** Série diária REAL do recorte (um ponto por dia civil, incluindo zeros). */
  data: ChecklistActivityDay[];
  loading?: boolean;
  error?: boolean;
  onRetry?: () => void;
  title?: string;
  description?: string;
  /** Sem atividade no período — vazio explícito em vez de gráfico zerado. */
  empty?: { title: string; helper: string } | null;
  className?: string;
}) {
  const hasData = data.some((day) => day.scheduled > 0 || day.completed > 0);
  // Recortes curtos (a semana padrão do painel tem 7 dias) mostram TODOS os dias
  // no eixo; recortes longos deixam o recharts espaçar os rótulos.
  const denseTicks = data.length <= 8;

  return (
    <Card className={["h-fit", className].filter(Boolean).join(" ")}>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
        {/* Legenda só quando há gráfico: ela descreve as séries desenhadas. */}
        {!loading && !error && hasData && (
          <CardAction>
            <ActivityLegend />
          </CardAction>
        )}
      </CardHeader>
      <CardContent className="px-2 pt-2 sm:px-6 sm:pt-4">
        {loading ? (
          <Skeleton data-testid="checklist-activity-loading" className="h-[280px] w-full" />
        ) : error ? (
          <div
            data-testid="checklist-activity-error"
            className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-rose-200 bg-rose-50/60 px-4 py-3"
          >
            <p className="text-sm text-rose-700">Não foi possível carregar a atividade.</p>
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
        ) : !hasData ? (
          <div
            data-testid="checklist-activity-empty"
            className="flex h-[180px] w-full flex-col items-center justify-center rounded-lg border border-dashed text-center"
          >
            <p className="text-sm font-medium">{empty?.title ?? "Sem atividade no período"}</p>
            <p className="text-muted-foreground mt-1 text-xs">
              {empty?.helper ?? "Nenhuma tarefa foi programada no recorte selecionado."}
            </p>
          </div>
        ) : (
          <ChartContainer config={chartConfig} className="aspect-auto h-[280px] w-full">
            <AreaChart data={data} margin={{ top: 8, right: 20, bottom: 0, left: 20 }}>
              <defs>
                <linearGradient id="fillScheduled" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="var(--color-scheduled)" stopOpacity={0.6} />
                  <stop offset="95%" stopColor="var(--color-scheduled)" stopOpacity={0.05} />
                </linearGradient>
                <linearGradient id="fillCompleted" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="var(--color-completed)" stopOpacity={0.7} />
                  <stop offset="95%" stopColor="var(--color-completed)" stopOpacity={0.05} />
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} />
              <XAxis
                dataKey="date"
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                // 30 dias em ~700px: ~10 rótulos espaçados pelo recharts; TODOS os
                // pontos continuam na série (nada é amostrado).
                interval={denseTicks ? 0 : "preserveEnd"}
                minTickGap={denseTicks ? 0 : 32}
                // Dia civil formatado por componentes da string (nunca `new Date`):
                // o rótulo não pode mudar de dia por causa de fuso.
                tickFormatter={(value) => formatShortDay(String(value))}
              />
              <ChartTooltip
                cursor={false}
                content={
                  <ChartTooltipContent
                    labelFormatter={(value) => formatShortDay(String(value))}
                    indicator="dot"
                  />
                }
              />
              <Area
                dataKey="scheduled"
                type="linear"
                fill="url(#fillScheduled)"
                stroke="var(--color-scheduled)"
              />
              <Area
                dataKey="completed"
                type="linear"
                fill="url(#fillCompleted)"
                stroke="var(--color-completed)"
              />
            </AreaChart>
          </ChartContainer>
        )}
      </CardContent>
    </Card>
  );
}
