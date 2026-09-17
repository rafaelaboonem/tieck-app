/*
 * ================== EXECUÇÃO DO PERÍODO (BREAKDOWN REAL) ==================
 *
 * Shell do `RevenueBreakdown` do template MIT
 * `shadcn-dashboard-landing-template` (app/dashboard-2): Card com `ChartStyle`,
 * Select de categoria, DONUT com `activeShape` e Label central, e a lista
 * lateral de categorias. Markup preservado.
 *
 * Adapter real:
 *   revenueData.category → resultado da execução ("no-prazo" / "com-atraso")
 *   revenueData.amount   → contagem real de tarefas concluídas
 *   revenueData.value    → participação (%) calculada só a partir das fatias
 *                          que compõem o donut (parte ÷ total do próprio donut)
 *   "Revenue" central    → "Concluídas" (soma real das duas fatias)
 *
 * Regra respeitada: o donut só recebe categorias MUTUAMENTE EXCLUSIVAS que
 * somam o mesmo total (tarefas concluídas = no prazo + com atraso). As demais
 * métricas do período (programadas, deveriam ter sido feitas, concluídas) são
 * contexto e vão na descrição do card — nunca como fatia.
 *
 * O botão "Export" do template foi removido: não existe exportação real.
 * =========================================================================
 */

import * as React from "react";
import { Label, Pie, PieChart, Sector } from "recharts";
import type { PieSectorDataItem } from "recharts/types/polar/Pie";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../kit/ui/card";
import {
  ChartContainer,
  ChartStyle,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "../kit/ui/chart";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../kit/ui/select";

export type BreakdownSlice = {
  key: string;
  label: string;
  color: string;
  amount: number;
  /** Participação real dentro do total do donut. null quando total = 0. */
  share: number | null;
};

export function RealExecutionBreakdown({
  slices,
  centerValue,
  centerLabel,
  description,
  contextLine,
  className,
}: {
  slices: BreakdownSlice[];
  centerValue: string;
  centerLabel: string;
  description: string;
  /**
   * Contexto do período (programadas / deveriam / concluídas). Fica em uma
   * linha própria dentro do CardContent: como `CardDescription` ele competia
   * com o Select do header, que quebrava o texto em duas linhas.
   */
  contextLine?: string;
  /** Classe extra no Card (ex.: microinteração de hover do preview). */
  className?: string;
}) {
  const id = "execucao-periodo";
  const [activeCategory, setActiveCategory] = React.useState(slices[0]?.key ?? "");

  React.useEffect(() => {
    if (!slices.some((slice) => slice.key === activeCategory) && slices[0]) {
      setActiveCategory(slices[0].key);
    }
  }, [slices, activeCategory]);

  const chartConfig = React.useMemo(() => {
    const config: ChartConfig = { amount: { label: "Tarefas" } };
    for (const slice of slices) {
      config[slice.key] = { label: slice.label, color: slice.color };
    }
    return config;
  }, [slices]);

  const activeIndex = React.useMemo(
    () => slices.findIndex((item) => item.key === activeCategory),
    [activeCategory, slices],
  );

  const categories = React.useMemo(() => slices.map((item) => item.key), [slices]);

  return (
    <Card data-chart={id} className={["flex flex-col cursor-pointer", className].filter(Boolean).join(" ")}>
      <ChartStyle id={id} config={chartConfig} />
      <CardHeader className="flex flex-col space-y-2 sm:flex-row sm:items-center sm:justify-between sm:space-y-0 pb-2">
        <div>
          <CardTitle>Execução do período</CardTitle>
          <CardDescription>{description}</CardDescription>
        </div>
        <div className="flex items-center space-x-2">
          <Select value={activeCategory} onValueChange={setActiveCategory}>
            <SelectTrigger
              className="w-[175px] rounded-lg cursor-pointer"
              aria-label="Selecionar um resultado"
            >
              <SelectValue placeholder="Selecionar resultado" />
            </SelectTrigger>
            <SelectContent align="end" className="rounded-lg">
              {categories.map((key) => {
                const config = chartConfig[key as keyof typeof chartConfig];
                if (!config) return null;
                return (
                  <SelectItem
                    key={key}
                    value={key}
                    className="rounded-md [&_span]:flex cursor-pointer"
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className="flex h-3 w-3 shrink-0 "
                        style={{ backgroundColor: `var(--color-${key})` }}
                      />
                      {config.label}
                    </div>
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col justify-center">
        {contextLine && (
          <p className="text-muted-foreground pb-2 text-sm">{contextLine}</p>
        )}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 w-full">
          <div className="flex justify-center">
            <ChartContainer
              id={id}
              config={chartConfig}
              className="mx-auto aspect-square w-full max-w-[300px]"
            >
              <PieChart>
                <ChartTooltip cursor={false} content={<ChartTooltipContent hideLabel />} />
                <Pie
                  data={slices}
                  dataKey="amount"
                  nameKey="key"
                  innerRadius={60}
                  strokeWidth={5}
                  activeShape={({ outerRadius = 0, ...props }: PieSectorDataItem) => (
                    <g>
                      <Sector {...props} outerRadius={outerRadius + 10} />
                      <Sector
                        {...props}
                        outerRadius={outerRadius + 25}
                        innerRadius={outerRadius + 12}
                      />
                    </g>
                  )}
                >
                  <Label
                    content={({ viewBox }) => {
                      if (viewBox && "cx" in viewBox && "cy" in viewBox) {
                        return (
                          <text
                            x={viewBox.cx}
                            y={viewBox.cy}
                            textAnchor="middle"
                            dominantBaseline="middle"
                          >
                            <tspan
                              x={viewBox.cx}
                              y={viewBox.cy}
                              className="fill-foreground text-3xl font-bold"
                            >
                              {centerValue}
                            </tspan>
                            <tspan
                              x={viewBox.cx}
                              y={(viewBox.cy || 0) + 24}
                              className="fill-muted-foreground"
                            >
                              {centerLabel}
                            </tspan>
                          </text>
                        );
                      }
                      return null;
                    }}
                  />
                </Pie>
              </PieChart>
            </ChartContainer>
          </div>

          <div className="flex flex-col justify-center space-y-4">
            {slices.map((item, index) => {
              const config = chartConfig[item.key as keyof typeof chartConfig];
              const isActive = index === activeIndex;

              return (
                <div
                  key={item.key}
                  className={`flex items-center justify-between p-3 rounded-lg transition-colors cursor-pointer ${
                    isActive ? "bg-muted" : "hover:bg-muted/50"
                  }`}
                  onClick={() => setActiveCategory(item.key)}
                >
                  <div className="flex items-center gap-3">
                    <span
                      className="flex h-3 w-3 shrink-0 rounded-full"
                      style={{ backgroundColor: `var(--color-${item.key})` }}
                    />
                    <span className="font-medium">{config?.label}</span>
                  </div>
                  <div className="text-right">
                    <div className="font-bold">{item.amount}</div>
                    <div className="text-sm text-muted-foreground">
                      {item.share === null ? "—" : `${item.share.toFixed(1)}%`}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
