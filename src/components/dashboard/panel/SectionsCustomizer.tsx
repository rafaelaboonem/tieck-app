/*
 * ============== PERSONALIZAÇÃO DOS MÓDULOS DO PAINEL ================
 *
 * Segundo personalizador do `/painel`: controla quais MÓDULOS aparecem (cards,
 * gráficos, tabelas, seções). O outro — "Personalizar filtros" — cuida só dos
 * filtros globais e é independente deste.
 *
 * Tudo deriva de `DASHBOARD_SECTIONS`: a UI do popover, a ordem dos itens e o
 * que o dashboard renderiza. Acrescentar um widget no futuro é acrescentar uma
 * entrada aqui e envolver o componente em `<CollapsibleSection id="...">` —
 * nenhuma lista paralela para manter em sincronia.
 *
 * VISIBILIDADE NÃO É DADO: esconder um módulo não reseta filtro nenhum e não
 * muda o recorte dos outros. É só apresentação.
 *
 * PERSISTÊNCIA: `localStorage` (chave `tieck:dashboard:visible-sections`), só do
 * navegador. Nada de Supabase, perfil ou workspace.
 *
 * Este componente não sabe de onde os dados vêm: ele é usado pela composição
 * oficial do `/painel` e pela vitrine DEV, sem nenhuma lógica de fixture aqui.
 * =========================================================================
 */

import * as React from "react";
import { Check, LayoutDashboard, RotateCcw } from "lucide-react";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export type DashboardSectionId =
  /* indicadores (KPIs independentes) */
  | "scheduled"
  | "answered"
  | "on-time"
  | "overdue"
  /* análises */
  | "checklist-activity"
  | "unit-compliance"
  | "period-execution"
  | "recent-executions"
  | "attention-points"
  | "unit-performance"
  | "operation-insights"
  /* rotinas (domínio separado) */
  | "scheduled-routines"
  | "routines-by-unit";

export type DashboardSectionGroup = "metrics" | "analytics" | "routines";

/** Grupos exibidos no popover, na ordem. */
export const SECTION_GROUPS: ReadonlyArray<{ id: DashboardSectionGroup; label: string }> = [
  { id: "metrics", label: "Indicadores" },
  { id: "analytics", label: "Análises" },
  { id: "routines", label: "Rotinas" },
];

/**
 * Registro central. `id` é estável (é a chave persistida); `label` é o texto do
 * popover; `group` posiciona o item na lista.
 */
export const DASHBOARD_SECTIONS: ReadonlyArray<{
  id: DashboardSectionId;
  label: string;
  group: DashboardSectionGroup;
}> = [
  { id: "scheduled", label: "Programados", group: "metrics" },
  { id: "answered", label: "Respondidos", group: "metrics" },
  { id: "on-time", label: "No prazo", group: "metrics" },
  { id: "overdue", label: "Em atraso", group: "metrics" },

  { id: "checklist-activity", label: "Atividade dos checklists", group: "analytics" },
  { id: "unit-compliance", label: "Conformidade por unidade", group: "analytics" },
  { id: "period-execution", label: "Execução do período", group: "analytics" },
  { id: "recent-executions", label: "Últimas execuções", group: "analytics" },
  { id: "attention-points", label: "Pontos de atenção", group: "analytics" },
  { id: "unit-performance", label: "Desempenho por unidade", group: "analytics" },
  { id: "operation-insights", label: "Insights da operação", group: "analytics" },

  { id: "scheduled-routines", label: "Rotinas agendadas", group: "routines" },
  { id: "routines-by-unit", label: "Rotinas por unidade", group: "routines" },
];

export const VISIBLE_SECTIONS_STORAGE_KEY = "tieck:dashboard:visible-sections";

/** Estado padrão: o dashboard completo aprovado (tudo visível). */
export const DEFAULT_VISIBLE_SECTIONS: DashboardSectionId[] = DASHBOARD_SECTIONS.map(
  (section) => section.id,
);

/** Duração da animação de aparecer/sumir (acompanha o CSS). */
export const SECTION_ANIMATION_MS = 260;

/** Ordem canônica — ligar/desligar nunca reordena o dashboard. */
export function normalizeVisibleSections(
  ids: readonly DashboardSectionId[],
): DashboardSectionId[] {
  const set = new Set(ids);
  return DASHBOARD_SECTIONS.filter((section) => set.has(section.id)).map((section) => section.id);
}

export function isSectionVisible(
  visible: readonly DashboardSectionId[],
  id: DashboardSectionId,
): boolean {
  return visible.includes(id);
}

function readStoredSections(): DashboardSectionId[] {
  if (typeof window === "undefined") return DEFAULT_VISIBLE_SECTIONS;
  try {
    const raw = window.localStorage.getItem(VISIBLE_SECTIONS_STORAGE_KEY);
    if (!raw) return DEFAULT_VISIBLE_SECTIONS;
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return DEFAULT_VISIBLE_SECTIONS;
    const known = new Set<string>(DASHBOARD_SECTIONS.map((section) => section.id));
    // Lista vazia é escolha válida ("nenhum módulo"), então não cai no padrão.
    return normalizeVisibleSections(
      parsed.filter((id): id is DashboardSectionId => typeof id === "string" && known.has(id)),
    );
  } catch {
    return DEFAULT_VISIBLE_SECTIONS;
  }
}

/** Estado de visibilidade dos módulos + persistência local (só o navegador). */
export function useVisibleSections() {
  const [visible, setVisible] = React.useState<DashboardSectionId[]>(readStoredSections);

  const update = React.useCallback((next: readonly DashboardSectionId[]) => {
    const normalized = normalizeVisibleSections(next);
    setVisible(normalized);
    try {
      window.localStorage.setItem(VISIBLE_SECTIONS_STORAGE_KEY, JSON.stringify(normalized));
    } catch {
      /* modo privado/armazenamento cheio: a escolha vale só nesta sessão */
    }
  }, []);

  return [visible, update] as const;
}

/**
 * Envelope de um módulo: colapsa suavemente quando o módulo é ocultado e, ao
 * terminar a saída, DEIXA DE RENDERIZAR o conteúdo — gráfico, tabela ou chart
 * oculto não continua montado consumindo recursos.
 *
 * O `overflow: hidden` do clip vale só durante a animação: em repouso o módulo
 * fica sem clip, para não quebrar o header sticky da DataTable.
 *
 * `gap` é o vão do container (`gap-4` = 1rem, `gap-6` = 1.5rem): o estado
 * oculto desconta esse vão por margem negativa, senão um item de tamanho zero
 * deixaria um buraco no meio do dashboard.
 */
export function CollapsibleSection({
  id,
  visible,
  gap = "1.5rem",
  className,
  children,
}: {
  id: DashboardSectionId;
  visible: boolean;
  /** Vão do container em que o módulo está (default 1.5rem = gap-6). */
  gap?: string;
  className?: string;
  children: React.ReactNode;
}) {
  const [rendered, setRendered] = React.useState(visible);
  const [expanded, setExpanded] = React.useState(visible);
  const [animating, setAnimating] = React.useState(false);

  React.useEffect(() => {
    if (visible) {
      setRendered(true);
      setAnimating(true);
      const open = window.setTimeout(() => setExpanded(true), 20);
      const settle = window.setTimeout(() => setAnimating(false), SECTION_ANIMATION_MS);
      return () => {
        window.clearTimeout(open);
        window.clearTimeout(settle);
      };
    }
    setAnimating(true);
    setExpanded(false);
    const close = window.setTimeout(() => {
      setRendered(false);
      setAnimating(false);
    }, SECTION_ANIMATION_MS);
    return () => window.clearTimeout(close);
  }, [visible]);

  if (!rendered) return null;

  return (
    <div
      data-section-slot={id}
      data-visible={visible ? "true" : "false"}
      style={{ "--ti-slot-gap": gap } as React.CSSProperties}
      className={cn(
        "ti-section-slot",
        expanded ? "ti-section-slot--on" : "ti-section-slot--off",
        animating && "ti-section-slot--animating",
        className,
      )}
    >
      <div className="min-w-0">{children}</div>
    </div>
  );
}

export function SectionsCustomizer({
  visible,
  onChange,
  open,
  onOpenChange,
}: {
  visible: DashboardSectionId[];
  onChange: (next: DashboardSectionId[]) => void;
  open: boolean;
  onOpenChange: (next: boolean) => void;
}) {
  const [tooltipOpen, setTooltipOpen] = React.useState(false);
  const hiddenCount = DASHBOARD_SECTIONS.length - visible.length;

  /*
   * Devolver o foco ao gatilho ao fechar de teclado. O Radix já faz isso quando
   * o conteúdo desmonta, mas a desmontagem depende do `animationend` da animação
   * de saída — que não chega em webviews que não compõem frames. Como o popover
   * é controlado, o foco volta na hora em que `open` vira falso; só em Escape,
   * para não roubar o foco de quem clicou fora para fechar.
   */
  const triggerRef = React.useRef<HTMLButtonElement>(null);
  const closedByEscape = React.useRef(false);

  React.useEffect(() => {
    if (open) return;
    if (closedByEscape.current && triggerRef.current) triggerRef.current.focus();
    closedByEscape.current = false;
  }, [open]);

  const toggle = (id: DashboardSectionId) => {
    onChange(visible.includes(id) ? visible.filter((item) => item !== id) : [...visible, id]);
  };

  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip open={tooltipOpen && !open} onOpenChange={setTooltipOpen}>
        <Popover open={open} onOpenChange={onOpenChange}>
          <TooltipTrigger asChild>
            <PopoverTrigger asChild>
              <button
                type="button"
                ref={triggerRef}
                aria-label="Personalizar painel"
                aria-expanded={open}
                aria-haspopup="dialog"
                className={cn(
                  "relative flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border transition-colors cursor-pointer",
                  "focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none",
                  open
                    ? "bg-muted text-foreground border-border"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                <LayoutDashboard className="h-4 w-4" aria-hidden="true" />
                {hiddenCount > 0 && (
                  <span
                    aria-hidden="true"
                    className="absolute -top-0.5 -right-0.5 size-1.5 rounded-full bg-primary"
                  />
                )}
              </button>
            </PopoverTrigger>
          </TooltipTrigger>

          <PopoverContent
            align="end"
            data-testid="panel-customizer-popover"
            className="w-[272px] p-0"
            onEscapeKeyDown={() => {
              closedByEscape.current = true;
            }}
          >
            <div className="border-b px-3 py-2.5">
              <p className="text-[13px] font-semibold">Personalizar painel</p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                Escolha quais informações aparecem no dashboard.
              </p>
            </div>

            <div className="max-h-[320px] overflow-y-auto p-1">
              {SECTION_GROUPS.map((group) => (
                <div key={group.id} className="pb-1 last:pb-0">
                  <p className="px-2 pt-2 pb-1 text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">
                    {group.label}
                  </p>
                  {DASHBOARD_SECTIONS.filter((section) => section.group === group.id).map(
                    (section) => {
                      const checked = visible.includes(section.id);
                      return (
                        <label
                          key={section.id}
                          className="flex w-full cursor-pointer items-center gap-2.5 rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-muted"
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggle(section.id)}
                            className="peer sr-only"
                          />
                          <span
                            aria-hidden="true"
                            className={cn(
                              "flex size-4 shrink-0 items-center justify-center rounded-[4px] border transition-colors",
                              "peer-focus-visible:ring-[3px] peer-focus-visible:ring-ring/50",
                              checked ? "border-primary bg-primary text-primary-foreground" : "border-input",
                            )}
                          >
                            {checked && <Check className="size-3" />}
                          </span>
                          <span className="truncate">{section.label}</span>
                        </label>
                      );
                    },
                  )}
                </div>
              ))}
            </div>

            <div className="border-t p-1">
              <button
                type="button"
                onClick={() => onChange(DEFAULT_VISIBLE_SECTIONS)}
                className="flex w-full cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <RotateCcw className="size-3.5" aria-hidden="true" />
                Restaurar padrão
              </button>
            </div>
          </PopoverContent>
        </Popover>
        <TooltipContent side="bottom">Personalizar painel</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
