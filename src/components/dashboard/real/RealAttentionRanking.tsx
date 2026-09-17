/*
 * ===================== ATENÇÃO OPERACIONAL (RANKING) =======================
 *
 * Shell do `TopProducts` do template MIT
 * `shadcn-dashboard-landing-template` (app/dashboard-2): Card, header,
 * tile de posição `#N`, linha com título + Badge, linha secundária de
 * contexto, valor à direita, Badge de destaque e barra de `Progress`.
 *
 * Adapter real (sem linguagem comercial e sem ranking competitivo):
 *   product.name      → categoria real de exceção (Falhas críticas,
 *                       Abertas em atraso, Evidências aguardando)
 *   product.category  → severidade real (Crítico / Atenção / Evidência)
 *   product.rating    → ícone semântico de severidade (o template usa uma
 *                       estrela amarela; aqui a cor precisa significar algo)
 *   product.sales     → registro real da linha
 *   product.revenue   → contagem real
 *   product.growth    → participação real no total de exceções
 *   product.stock     → participação na barra de Progress
 *
 * A ordenação é por severidade operacional real (a mesma classificação de
 * `lib/operational-status`), não por "melhores produtos".
 *
 * O botão "View All" do template foi removido: não existe rota real de
 * listagem de exceções nesta etapa.
 * =========================================================================
 */

import { CircleCheckBig } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { Badge } from "../kit/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../kit/ui/card";
import { Progress } from "../kit/ui/progress";

export type AttentionTone = "critical" | "warning" | "neutral";

export type AttentionRow = {
  key: string;
  label: string;
  severity: string;
  tone: AttentionTone;
  count: number;
  /** Texto real da linha secundária (ex.: "tarefas vencidas sem execução"). */
  detail: string;
  /** Participação real no total de exceções abertas. */
  share: number | null;
  icon: LucideIcon;
};

const TONE_TEXT: Record<AttentionTone, string> = {
  critical: "text-rose-600 dark:text-rose-400",
  warning: "text-amber-600 dark:text-amber-400",
  neutral: "text-muted-foreground",
};

const TONE_BADGE: Record<AttentionTone, string> = {
  critical: "text-rose-600 border-rose-200 dark:text-rose-400 dark:border-rose-500/30",
  warning: "text-amber-600 border-amber-200 dark:text-amber-400 dark:border-amber-500/30",
  neutral: "text-muted-foreground",
};

export function RealAttentionRanking({
  rows,
  description,
  title = "Atenção operacional",
  healthyLabel,
  healthyHelper,
  className,
}: {
  rows: AttentionRow[];
  description: string;
  /** Título do card (o painel real usa o default; o preview usa "Pontos de atenção"). */
  title?: string;
  /** Classe extra no Card (ex.: microinteração de hover do preview). */
  className?: string;
  /** Todos os indicadores em zero: estado saudável compacto, sem três zeros. */
  healthyLabel: string;
  healthyHelper: string;
}) {
  const total = rows.reduce((acc, row) => acc + row.count, 0);

  return (
    <Card className={["cursor-pointer", className].filter(Boolean).join(" ")}>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
        <div>
          <CardTitle>{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {total === 0 ? (
          <div role="status" className="flex items-center gap-2 p-3 rounded-lg border">
            <CircleCheckBig className="text-green-600 dark:text-green-400 h-4 w-4" />
            <div className="min-w-0">
              <p className="text-sm font-medium">{healthyLabel}</p>
              <p className="text-xs text-muted-foreground">{healthyHelper}</p>
            </div>
          </div>
        ) : (
          rows.map((row, index) => {
            const Icon = row.icon;
            const progress = row.share === null ? 0 : Math.min(100, row.share);
            return (
              <div key={row.key} className="flex items-center p-3 rounded-lg border gap-2">
                <div className="flex items-center justify-center w-8 h-8 rounded-full bg-primary/10 text-primary font-semibold text-sm">
                  #{index + 1}
                </div>
                <div className="flex gap-2 items-center justify-between space-x-3 flex-1 flex-wrap">
                  <div className="">
                    <div className="flex items-center space-x-2">
                      <p className="text-sm font-medium truncate">{row.label}</p>
                      <Badge variant="outline" className="text-xs">
                        {row.severity}
                      </Badge>
                    </div>
                    <div className="flex items-center space-x-2 mt-1">
                      <div className="flex items-center space-x-1">
                        <Icon className={`h-3 w-3 ${TONE_TEXT[row.tone]}`} />
                        <span className="text-xs text-muted-foreground">{row.detail}</span>
                      </div>
                      <span className="text-xs text-muted-foreground">•</span>
                      <span className="text-xs text-muted-foreground">
                        {row.share === null ? "—" : `${row.share.toFixed(1)}% do total`}
                      </span>
                    </div>
                  </div>
                  <div className="text-right space-y-1">
                    <div className="flex items-center space-x-2">
                      <p className="text-sm font-medium tabular-nums">{row.count}</p>
                      <Badge variant="outline" className={`text-xs ${TONE_BADGE[row.tone]}`}>
                        {row.share === null ? "—" : `${row.share.toFixed(1)}%`}
                      </Badge>
                    </div>
                    <div className="flex items-center space-x-2">
                      <span className="text-xs text-muted-foreground">
                        {row.detail}
                      </span>
                      <Progress value={progress} className="w-12 h-1" />
                    </div>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}
