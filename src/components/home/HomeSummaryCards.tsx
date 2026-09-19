import { AlertTriangle, Clock, FileText } from "lucide-react";
import { Card } from "@/components/dashboard/kit/ui/card";
import { buildHomeOperationalSummary } from "@/lib/home-operational-summary";
import "./home-light.css";

/**
 * Home 6B.2L — três cards compactos, anatomia da referência aprovada:
 *
 *   [ tile do ícone ] Título
 *
 *   VALOR
 *   helper
 *
 * Ícone à ESQUERDA do título (não canto direito), tile neutro ~28px sem cor
 * semântica, título pequeno muted ao lado, valor maior em destaque e helper
 * muted na base — sem seta, sem ação, sem clique: os cards são puramente
 * informativos e NÃO controlam o filtro da seção (que segue só no Select).
 * Hover = microinteração visual do `/painel` (grupo `.ti-hover-kpi` replicado
 * em `home-light.css`) — refinamento, não affordance de navegação.
 *
 * FONTE ÚNICA: `buildHomeOperationalSummary` — a MESMA função que a Home já
 * usava. Nada é recontado aqui, nada vem de `checklist_execution_occurrences`
 * (rotinas agendadas continuam sendo outro domínio) e nenhum número é
 * hardcoded: `total`/`pendentes`/`atrasados` saem do sumário real.
 */
export function HomeSummaryCards({ checklists }: { checklists: any[] }) {
  const summary = buildHomeOperationalSummary(checklists);

  const cards = [
    {
      key: "checklists",
      label: "Checklists",
      value: summary.total,
      helper: "disponíveis neste contexto",
      Icon: FileText,
    },
    {
      key: "pendentes",
      label: "Pendentes",
      value: summary.pendentes,
      helper: "aguardando conclusão",
      Icon: Clock,
    },
    {
      key: "atrasados",
      label: "Atrasados",
      value: summary.atrasados,
      helper: "exigem atenção",
      Icon: AlertTriangle,
    },
  ];

  return (
    <section
      aria-label="Resumo dos checklists"
      data-testid="home-summary-cards"
      className="tieck-home grid grid-cols-1 gap-4 sm:grid-cols-3"
    >
      {cards.map(({ key, label, value, helper, Icon }) => (
        <Card
          key={key}
          data-testid={`home-summary-card-${key}`}
          data-value={value}
          className="ti-hover-kpi gap-0 rounded-xl border-neutral-200 py-0 shadow-none"
        >
          <div className="flex flex-col p-5">
            <div className="flex items-center gap-2.5">
              <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg border border-neutral-200 bg-neutral-50 text-neutral-500">
                <Icon className="h-3.5 w-3.5" />
              </span>
              <p className="text-xs font-medium text-neutral-500">{label}</p>
            </div>

            <p className="mt-4 text-3xl font-semibold tabular-nums leading-none text-neutral-900">
              {value}
            </p>
            <p className="mt-2.5 text-[11px] text-neutral-400">{helper}</p>
          </div>
        </Card>
      ))}
    </section>
  );
}
