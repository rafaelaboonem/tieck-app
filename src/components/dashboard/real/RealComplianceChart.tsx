/*
 * ==================== CONFORMIDADE POR UNIDADE (REAL) ======================
 *
 * Shell do `SalesChart` do template MIT `shadcn-dashboard-landing-template`
 * (app/dashboard-2), preservando Card, header, ChartContainer, gradientes,
 * grid, tooltip e a linha de meta tracejada.
 *
 * Adapter (permitido por escopo): a série real do Tieck é POR UNIDADE, não
 * mensal —
 *   salesData.month  → unitName da unidade
 *   salesData.sales  → due_compliance_percentage (tarefas cujo horário chegou)
 *   salesData.target → meta operacional real (90%) — linha tracejada do template
 *
 * Os dois controles do template (Select de período 3/6/12 meses e botão
 * "Export") NÃO existem aqui: o recorte de período real é a toolbar do
 * dashboard (URL) e não há exportação real. Colocar controles inertes seria
 * pior que remover.
 *
 * O YAxis do template formata moeda ($); aqui formata percentual. Nenhuma
 * outra classe/estrutura do componente original foi alterada.
 * =========================================================================
 */

import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../kit/ui/card";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "../kit/ui/chart";

export type CompliancePoint = {
  unit: string;
  /** `due_compliance_percentage` — null quando não há denominador real. */
  compliance: number | null;
  target: number;
};

const chartConfig = {
  compliance: {
    label: "Conformidade",
    color: "var(--primary)",
  },
  target: {
    label: "Meta",
    color: "var(--primary)",
  },
} satisfies ChartConfig;

export function RealComplianceChart({
  data,
  description,
  empty,
  className,
}: {
  data: CompliancePoint[];
  description: string;
  /** Sem base real no período: estado vazio honesto dentro do MESMO Card. */
  empty: { title: string; helper: string } | null;
  /** Classe extra no Card (ex.: microinteração de hover do preview). */
  className?: string;
}) {
  return (
    <Card className={["cursor-pointer", className].filter(Boolean).join(" ")}>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <div>
          <CardTitle>Conformidade por unidade</CardTitle>
          <CardDescription>{description}</CardDescription>
        </div>
      </CardHeader>
      <CardContent className="p-0 pt-6">
        <div className="px-6 pb-6">
          {/* Sem dado real: estado vazio COMPACTO — não reserva os 350px do
              gráfico (evita área morta enorme no painel, regra já aprovada). */}
          {empty ? (
            <div className="flex h-[180px] w-full flex-col items-center justify-center rounded-lg border border-dashed text-center">
              <p className="text-sm font-medium">{empty.title}</p>
              <p className="text-muted-foreground mt-1 text-xs">{empty.helper}</p>
            </div>
          ) : (
            <ChartContainer config={chartConfig} className="h-[350px] w-full">
              <AreaChart data={data} margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorCompliance" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="var(--color-compliance)" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="var(--color-compliance)" stopOpacity={0.05} />
                  </linearGradient>
                  <linearGradient id="colorTarget" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="var(--color-target)" stopOpacity={0.2} />
                    <stop offset="95%" stopColor="var(--color-target)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted/30" />
                <XAxis
                  dataKey="unit"
                  axisLine={false}
                  tickLine={false}
                  className="text-xs"
                  tick={{ fontSize: 12 }}
                />
                <YAxis
                  axisLine={false}
                  tickLine={false}
                  className="text-xs"
                  tick={{ fontSize: 12 }}
                  domain={[0, 100]}
                  tickFormatter={(value) => `${value}%`}
                />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Area
                  type="monotone"
                  dataKey="target"
                  stackId="1"
                  stroke="var(--color-target)"
                  fill="url(#colorTarget)"
                  strokeDasharray="5 5"
                  strokeWidth={1}
                />
                <Area
                  type="monotone"
                  dataKey="compliance"
                  stackId="2"
                  stroke="var(--color-compliance)"
                  fill="url(#colorCompliance)"
                  strokeWidth={1}
                />
              </AreaChart>
            </ChartContainer>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
