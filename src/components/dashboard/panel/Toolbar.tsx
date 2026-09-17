/*
 * ====================== TOOLBAR DO PAINEL OFICIAL ========================
 *
 * Composição: PERÍODO · UNIDADE · ESCALA · personalizar filtros.
 *
 * • Período fica atrás de um trigger compacto (ícone de calendário) que expande
 *   os presets no próprio header; "Personalizado" abre o calendário de intervalo
 *   no primeiro clique. Os presets escrevem DATAS REAIS (`startDate`/`endDate`)
 *   via `presetToRange` — a mesma função pura usada pelo resto do produto.
 * • Unidade é um select simples, alimentado pelas unidades REAIS do workspace.
 * • Escala é o filtro-pai da dimensão operacional (hoje só Turno, com os turnos
 *   reais — ver `ScaleFilter`).
 * • O último botão abre o personalizador de filtros visíveis: ele nunca pode ser
 *   ocultado, e esconder um filtro devolve o valor dele ao padrão antes de tirar
 *   o controle da tela.
 *
 * O componente é CONTROLADO: o recorte vive na URL (é o `DashboardFilters` de
 * sempre), então a toolbar não guarda estado de filtro — só o estado de
 * interface (aberto/fechado).
 *
 * A toolbar é a MESMA para todos: ela não lê banco, fixture nem contexto. Quem
 * resolve unidades e turnos é a rota, que passa as opções reais.
 */
import * as React from "react";
import { CalendarDays, MapPin } from "lucide-react";
import { ptBR } from "date-fns/locale";
import type { DateRange } from "react-day-picker";

import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { presetToRange, type DashboardFilters, type PeriodPreset } from "@/lib/dashboard-filters";
import { cn } from "@/lib/utils";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../kit/ui/select";
import {
  ALL_OPTION_VALUE,
  DEFAULT_VISIBLE_FILTERS,
  normalizeVisibleFilters,
  panelPeriodPreset,
  resetFilterValue,
  type PanelFilterId,
  type PanelFilterOption,
} from "./filters";
import { FilterCustomizer } from "./FilterCustomizer";
import { ScaleFilter } from "./ScaleFilter";

const PERIODS: ReadonlyArray<{ id: PeriodPreset; label: string }> = [
  { id: "hoje", label: "Hoje" },
  { id: "7d", label: "7 dias" },
  { id: "30d", label: "30 dias" },
];

const PRESETS_ID = "panel-period-presets";

/** Layers do Radix (popover/select) não contam como "clique fora" nem Escape fora. */
function isInsideRadixLayer(target: EventTarget | null) {
  if (!(target instanceof Element)) return false;
  return Boolean(
    target.closest(
      "[data-radix-popper-content-wrapper],[role=listbox],[role=dialog],[data-radix-menu-content]",
    ),
  );
}

/** ISO (YYYY-MM-DD) → Date no fuso LOCAL: o calendário não pode pular um dia. */
function parseLocalDate(iso: string) {
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(year, month - 1, day);
}

/** Date do calendário → ISO usando o dia LOCAL (evita o deslocamento de UTC). */
function toIsoDate(date: Date) {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

/** Intervalo atual do calendário: exatamente as datas aplicadas no recorte. */
function resolveRange(filters: DashboardFilters): DateRange {
  return {
    from: parseLocalDate(filters.startDate),
    to: parseLocalDate(filters.endDate),
  };
}

/**
 * Envelope que colapsa um filtro inteiro quando ele é escondido no
 * personalizador. A animação é de largura (grid 1fr→0fr) + opacidade + um
 * translateX pequeno, e o `margin-inline-end` negativo cancela o gap do flex —
 * a toolbar se recompõe sozinha, sem buraco no meio nem scroll horizontal.
 *
 * Enquanto está oculto o conteúdo fica `inert`: nada de foco de teclado ou
 * clique em controle que não aparece mais.
 */
function FilterSlot({
  id,
  visible,
  children,
}: {
  id: PanelFilterId;
  visible: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      data-filter-slot={id}
      data-visible={visible ? "true" : "false"}
      aria-hidden={visible ? undefined : true}
      inert={visible ? undefined : true}
      className={cn("ti-filter-slot min-w-0", visible ? "ti-filter-slot--on" : "ti-filter-slot--off")}
    >
      <div className="min-w-0 overflow-hidden">{children}</div>
    </div>
  );
}

/** Trigger compacto do período + presets expansíveis (grupo "PERÍODO"). */
function PeriodControl({
  filters,
  onChange,
  presetsOpen,
  setPresetsOpen,
  calendarOpen,
  setCalendarOpen,
  range,
  presetClass,
  activePreset,
}: {
  filters: DashboardFilters;
  onChange: (next: DashboardFilters) => void;
  presetsOpen: boolean;
  setPresetsOpen: React.Dispatch<React.SetStateAction<boolean>>;
  calendarOpen: boolean;
  setCalendarOpen: React.Dispatch<React.SetStateAction<boolean>>;
  range: DateRange;
  presetClass: (active: boolean) => string;
  activePreset: PeriodPreset;
}) {
  return (
    <div className="flex items-center gap-2">
      <TooltipProvider delayDuration={200}>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              aria-label="Período"
              aria-expanded={presetsOpen}
              aria-controls={PRESETS_ID}
              onClick={() => setPresetsOpen((open) => !open)}
              className={cn(
                "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border transition-colors cursor-pointer",
                "focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none",
                presetsOpen
                  ? "bg-muted text-foreground border-border"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              <CalendarDays className="h-4 w-4" aria-hidden="true" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom">Período</TooltipContent>
        </Tooltip>
      </TooltipProvider>

      {/* Presets: expandem no próprio header, sem empurrar o título */}
      <div
        id={PRESETS_ID}
        aria-hidden={!presetsOpen}
        className={cn(
          "grid transition-[grid-template-columns,opacity] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]",
          presetsOpen ? "grid-cols-[1fr] opacity-100" : "grid-cols-[0fr] opacity-0",
        )}
      >
        <div className="min-w-0 overflow-hidden">
          <div
            role="group"
            aria-label="Período"
            className="ml-2 flex items-center gap-0.5 rounded-lg bg-muted p-0.5"
          >
            {PERIODS.map((item) => (
              <button
                key={item.id}
                type="button"
                tabIndex={presetsOpen ? 0 : -1}
                onClick={() => {
                  const rangeForPreset = presetToRange(item.id);
                  if (!rangeForPreset) return;
                  onChange({
                    ...filters,
                    startDate: rangeForPreset.startDate,
                    endDate: rangeForPreset.endDate,
                  });
                }}
                aria-pressed={activePreset === item.id}
                className={presetClass(activePreset === item.id)}
              >
                {item.label}
              </button>
            ))}

            {/* Personalizado: primeira interação já abre o calendário */}
            <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  tabIndex={presetsOpen ? 0 : -1}
                  aria-pressed={activePreset === "custom"}
                  className={presetClass(activePreset === "custom")}
                >
                  Personalizado
                </button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-auto p-0">
                <Calendar
                  mode="range"
                  locale={ptBR}
                  defaultMonth={range.from}
                  selected={range}
                  numberOfMonths={1}
                  autoFocus
                  onSelect={(next) => {
                    if (!next?.from) return;
                    onChange({
                      ...filters,
                      startDate: toIsoDate(next.from),
                      endDate: toIsoDate(next.to ?? next.from),
                    });
                    // Intervalo completo: fecha de forma natural.
                    if (next.to) setCalendarOpen(false);
                  }}
                />
                <p className="border-t px-3 py-2 text-xs text-muted-foreground">
                  Selecione a data inicial e a final
                </p>
              </PopoverContent>
            </Popover>
          </div>
        </div>
      </div>
    </div>
  );
}

export function PanelToolbar({
  filters,
  onChange,
  /** Valor de fábrica dos filtros (do produto, não da toolbar). */
  defaults,
  visibleFilters = DEFAULT_VISIBLE_FILTERS,
  onVisibilityChange,
  unitOptions,
  shiftOptions,
  trailingSlot,
  className,
}: {
  filters: DashboardFilters;
  onChange: (next: DashboardFilters) => void;
  defaults: DashboardFilters;
  /** Quais filtros aparecem na toolbar (personalizador). */
  visibleFilters?: PanelFilterId[];
  onVisibilityChange?: (next: PanelFilterId[]) => void;
  /** Unidades REAIS do workspace. */
  unitOptions: readonly PanelFilterOption[];
  /** Turnos REAIS do escopo atual. */
  shiftOptions: readonly PanelFilterOption[];
  /** Controle extra no fim da toolbar (aqui entra o "Personalizar painel"). */
  trailingSlot?: React.ReactNode;
  className?: string;
}) {
  const [presetsOpen, setPresetsOpen] = React.useState(false);
  const [calendarOpen, setCalendarOpen] = React.useState(false);
  const containerRef = React.useRef<HTMLDivElement>(null);

  const range = resolveRange(filters);
  const activePreset = panelPeriodPreset(filters);

  const showPeriod = visibleFilters.includes("period");
  const showUnit = visibleFilters.includes("unit");
  const showScale = visibleFilters.includes("scale");

  /**
   * Filtro escondido não pode continuar valendo: antes de sair da toolbar o
   * valor volta ao padrão (Unidade Norte → Todas as unidades; Noite → Todos os
   * turnos; intervalo personalizado → período padrão do produto).
   */
  function handleVisibilityChange(next: PanelFilterId[]) {
    const hidden = visibleFilters.filter((id) => !next.includes(id));
    onVisibilityChange?.(next);
    if (hidden.length > 0) {
      onChange(hidden.reduce((acc, id) => resetFilterValue(acc, id, defaults), filters));
    }
    if (hidden.includes("period")) setPresetsOpen(false);
  }

  /** Restaurar padrão: tudo visível e o recorte de fábrica do produto. */
  function handleRestore() {
    setPresetsOpen(false);
    onVisibilityChange?.(DEFAULT_VISIBLE_FILTERS);
    onChange({ ...defaults });
  }

  // Clique fora recolhe o grupo — exceto com um popover aberto ou quando o
  // clique acontece dentro de um layer do Radix (dia do calendário, opção da
  // escala, item de unidade, personalizador).
  React.useEffect(() => {
    if (!presetsOpen) return;
    function onPointerDown(event: PointerEvent) {
      if (calendarOpen) return;
      if (isInsideRadixLayer(event.target)) return;
      if (containerRef.current?.contains(event.target as Node)) return;
      setPresetsOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [presetsOpen, calendarOpen]);

  function handleKeyDown(event: React.KeyboardEvent) {
    if (event.key !== "Escape" || !presetsOpen) return;
    // Um popover aberto (calendário, escala, personalizador) consome o Escape
    // primeiro; os eventos de um portal sobem pela árvore do React, então a
    // checagem é explícita no elemento de origem.
    if (calendarOpen || isInsideRadixLayer(event.target as Element)) return;
    event.stopPropagation();
    setPresetsOpen(false);
  }

  const presetClass = (active: boolean) =>
    cn(
      "h-8 rounded-md px-3 text-[13px] font-medium transition-colors duration-150 cursor-pointer",
      active ? "bg-background text-foreground shadow-xs" : "text-muted-foreground hover:text-foreground",
    );

  // O valor selecionado precisa existir na lista, senão o trigger apareceria
  // vazio (o Select mostra o valor cru). A unidade atual entra como opção, sem
  // inventar nome: o rótulo é o próprio id enquanto os nomes não chegam.
  const unitValue = filters.unitId ?? ALL_OPTION_VALUE;
  const unitItems = React.useMemo(() => {
    const items = unitOptions.map((unit) => ({ id: unit.id, name: unit.name }));
    if (filters.unitId && !items.some((item) => item.id === filters.unitId)) {
      items.push({ id: filters.unitId, name: filters.unitId });
    }
    return items;
  }, [unitOptions, filters.unitId]);

  const visible = normalizeVisibleFilters(visibleFilters);

  return (
    <div ref={containerRef} className={className} onKeyDown={handleKeyDown}>
      <div className="flex flex-wrap items-center justify-end gap-2">
        <FilterSlot id="period" visible={showPeriod}>
          <PeriodControl
            filters={filters}
            onChange={onChange}
            presetsOpen={presetsOpen}
            setPresetsOpen={setPresetsOpen}
            calendarOpen={calendarOpen}
            setCalendarOpen={setCalendarOpen}
            range={range}
            presetClass={presetClass}
            activePreset={activePreset}
          />
        </FilterSlot>

        <FilterSlot id="unit" visible={showUnit}>
          <Select
            value={unitValue}
            onValueChange={(next) =>
              onChange({ ...filters, unitId: next === ALL_OPTION_VALUE ? undefined : next })
            }
          >
            <SelectTrigger size="sm" className="w-[190px] cursor-pointer" aria-label="Unidade">
              <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent align="end">
              <SelectItem value={ALL_OPTION_VALUE} className="cursor-pointer">
                Todas as unidades
              </SelectItem>
              {unitItems.map((unit) => (
                <SelectItem key={unit.id} value={unit.id} className="cursor-pointer">
                  {unit.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FilterSlot>

        <FilterSlot id="scale" visible={showScale}>
          <ScaleFilter
            shiftId={filters.shiftId}
            shiftOptions={shiftOptions}
            onChange={(shiftId) => onChange({ ...filters, shiftId })}
          />
        </FilterSlot>

        {/* Nunca ocultável: é ele que traz os outros filtros de volta. */}
        <FilterCustomizer
          visible={visible}
          onChange={handleVisibilityChange}
          onRestore={handleRestore}
        />

        {trailingSlot}
      </div>
    </div>
  );
}
