/*
 * ====================== CARDS DE MÉTRICAS DO /PAINEL =======================
 *
 * MESMO markup do `MetricsOverview` do template MIT
 * `shadcn-dashboard-landing-template` (app/dashboard-2), agora alimentado
 * pelos KPIs REAIS do Tieck — que já são calculados em `/painel` a partir da
 * view `analytics_unit_daily_compliance`. Nenhuma classe visual foi
 * reinterpretada: o único adapter é o array `metrics` vir por prop em vez de
 * ficar hardcoded no componente.
 *
 * Sobre os badges: o template mostra tendência (+12.5% / -20%) porque possui a
 * série mensal. O Tieck NÃO tem essa série, então o MESMO badge carrega o
 * estado real do domínio (Saudável / Atenção / Crítico / "N no recorte") —
 * nenhuma variação percentual é inventada.
 * =========================================================================
 */

import type { LucideIcon } from "lucide-react";

import { Badge } from "../kit/ui/badge";
import {
  Card,
  CardAction,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "../kit/ui/card";

export type RealMetricTone = "neutral" | "success" | "warning" | "critical";

export type RealMetric = {
  title: string;
  value: string;
  /** Ícone do estado real — ocupa o lugar do ícone de tendência do template. */
  icon: LucideIcon;
  badgeLabel: string;
  footer: string;
  subfooter: string;
  /**
   * Micro-indicação semântica do badge (mesmo badge do template, só a cor
   * muda): sucesso/atenção/crítico. Ausente = neutro, exatamente como antes.
   */
  tone?: RealMetricTone;
  /** Sem ação real: o card permanece visualmente inerte (cursor normal). */
  onSelect?: () => void;
};

/** Apenas a cor do badge muda — nenhum tamanho, peso ou variante nova. */
const TONE_BADGE: Record<RealMetricTone, string> = {
  neutral: "",
  success: "text-emerald-600 border-emerald-200",
  warning: "text-amber-600 border-amber-200",
  critical: "text-rose-600 border-rose-200",
};

/**
 * O CARD de uma métrica — exatamente o markup do template, agora reutilizável
 * fora da faixa de quatro. Quem precisa compor a faixa de outra forma (o
 * preview, que permite esconder indicadores um a um) usa este componente sem
 * duplicar a aparência do card.
 */
export function RealMetricCard({
  metric,
  className,
}: {
  metric: RealMetric;
  /** Classe extra no card (ex.: microinteração de hover do preview). */
  className?: string;
}) {
  const Icon = metric.icon;
  return (
    <Card
      className={
        [metric.onSelect ? "cursor-pointer" : undefined, className].filter(Boolean).join(" ") ||
        undefined
      }
      onClick={metric.onSelect}
    >
      <CardHeader>
        <CardDescription>{metric.title}</CardDescription>
        <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
          {metric.value}
        </CardTitle>
        <CardAction>
          <Badge variant="outline" className={TONE_BADGE[metric.tone ?? "neutral"]}>
            <Icon className="h-4 w-4" />
            {metric.badgeLabel}
          </Badge>
        </CardAction>
      </CardHeader>
      <CardFooter className="flex-col items-start gap-1.5 text-sm">
        <div className="line-clamp-1 flex gap-2 font-medium">
          {metric.footer} <Icon className="size-4" />
        </div>
        <div className="text-muted-foreground">{metric.subfooter}</div>
      </CardFooter>
    </Card>
  );
}

export function RealMetricsOverview({
  metrics,
  cardClassName,
}: {
  metrics: RealMetric[];
  /** Classe extra em cada card (ex.: microinteração de hover do preview). */
  cardClassName?: string;
}) {
  return (
    <div className="*:data-[slot=card]:from-primary/5 *:data-[slot=card]:to-card dark:*:data-[slot=card]:bg-card *:data-[slot=card]:bg-gradient-to-t *:data-[slot=card]:shadow-xs grid gap-4 sm:grid-cols-2 @5xl:grid-cols-4">
      {metrics.map((metric) => (
        <RealMetricCard key={metric.title} metric={metric} className={cardClassName} />
      ))}
    </div>
  );
}
