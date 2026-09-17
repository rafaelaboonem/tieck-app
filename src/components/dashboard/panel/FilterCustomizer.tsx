/*
 * ============== PERSONALIZAÇÃO DOS FILTROS VISÍVEIS (/painel) ==============
 *
 * Controla APENAS quais filtros globais aparecem na toolbar do `/painel`. Não
 * tem nada a ver com o valor de cada filtro: escolher "Unidade Norte" continua
 * sendo responsabilidade do select de unidade.
 *
 * O registro (`FILTER_DEFINITIONS`), o estado e a persistência vivem em
 * `./filters` — aqui só mora a apresentação do popover. Acrescentar um filtro no
 * futuro é acrescentar uma entrada no registro e o controle correspondente na
 * toolbar; nada de três blocos hardcoded.
 *
 * A REGRA de "filtro oculto não pode continuar valendo" é aplicada por quem
 * esconde (a toolbar chama `resetFilterValue` antes de o controle sair da tela).
 *
 * Acessibilidade: trigger é `<button>` com `aria-label`, `aria-expanded` e
 * `aria-haspopup`; os itens são checkboxes reais com linha inteira clicável,
 * foco visível e Escape/clique-fora pelo Radix.
 */
import * as React from "react";
import { Check, RotateCcw, SlidersHorizontal } from "lucide-react";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

import { FILTER_DEFINITIONS, type PanelFilterId } from "./filters";

export function FilterCustomizer({
  visible,
  onChange,
  onRestore,
}: {
  visible: PanelFilterId[];
  onChange: (next: PanelFilterId[]) => void;
  onRestore: () => void;
}) {
  const [open, setOpen] = React.useState(false);
  // Tooltip SEMPRE controlado: com o painel aberto ele se fecha (e nunca fica
  // sob o popover), sem alternar entre controlado e não-controlado.
  const [tooltipOpen, setTooltipOpen] = React.useState(false);
  const hiddenCount = FILTER_DEFINITIONS.length - visible.length;

  const toggle = (id: PanelFilterId) => {
    onChange(visible.includes(id) ? visible.filter((item) => item !== id) : [...visible, id]);
  };

  const triggerClass = cn(
    "relative flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border transition-colors cursor-pointer",
    "focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none",
    open
      ? "bg-muted text-foreground border-border"
      : "text-muted-foreground hover:bg-muted hover:text-foreground",
  );

  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip open={tooltipOpen && !open} onOpenChange={setTooltipOpen}>
        <Popover open={open} onOpenChange={setOpen}>
          <TooltipTrigger asChild>
            <PopoverTrigger asChild>
              <button
                type="button"
                aria-label="Personalizar filtros"
                aria-expanded={open}
                aria-haspopup="dialog"
                className={triggerClass}
              >
                <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />
                {/* Marca discreta de que há filtro escondido — sem badge colorido. */}
                {hiddenCount > 0 && (
                  <span
                    aria-hidden="true"
                    className="absolute -top-0.5 -right-0.5 size-1.5 rounded-full bg-primary"
                  />
                )}
              </button>
            </PopoverTrigger>
          </TooltipTrigger>

          <PopoverContent align="end" className="w-[264px] p-0">
            <div className="border-b px-3 py-2.5">
              <p className="text-[13px] font-semibold">Personalizar filtros</p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                Escolha quais filtros aparecem no painel.
              </p>
            </div>

            <div className="p-1">
              {FILTER_DEFINITIONS.map((definition) => {
                const checked = visible.includes(definition.id);
                return (
                  <label
                    key={definition.id}
                    className="flex w-full cursor-pointer items-center gap-2.5 rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-muted"
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggle(definition.id)}
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
                    <span className="truncate">{definition.label}</span>
                  </label>
                );
              })}
            </div>

            <div className="border-t p-1">
              <button
                type="button"
                onClick={onRestore}
                className="flex w-full cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <RotateCcw className="size-3.5" aria-hidden="true" />
                Restaurar padrão
              </button>
            </div>

            {visible.length === 0 && (
              <p className="border-t px-3 py-2 text-[11px] text-muted-foreground">
                Nenhum filtro visível — a toolbar mostra só este botão.
              </p>
            )}
          </PopoverContent>
        </Popover>
        <TooltipContent side="bottom">Personalizar filtros</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
