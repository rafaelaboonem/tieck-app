/*
 * ====================== FILTRO "ESCALA" DO /painel =======================
 *
 * A escala é o filtro-PAI da dimensão operacional. Hoje ele cobre uma dimensão
 * real: TURNO (horário operacional), alimentado por `useShiftOptions` — os turnos
 * do workspace ou da unidade escolhida.
 *
 * POR QUE SÓ TURNO: a segunda dimensão prevista (EQUIPE — o grupo responsável,
 * 12x36, equipes A/B/C) ainda NÃO tem contrato real no produto: não existe tabela
 * nem consulta que devolva equipes. Mostrar "Todas as equipes / Equipe A" aqui
 * seria fixture fingindo ser dado de produção, então a dimensão fica fora até o
 * contrato existir. A estrutura está pronta para recebê-la: `DIMENSIONS` é a
 * lista de dimensões e cada uma traz suas opções — acrescentar Equipe é
 * acrescentar uma entrada e a fonte real dela.
 *
 * Um único trigger mostra o valor ativo (`[ Noite ▾ ]`, `[ Todos os turnos ▾ ]`),
 * com o rótulo acessível completo ("Escala — Turno: Noite"). Escolher um turno
 * grava `shiftId` no MESMO recorte (`DashboardFilters`) que o resto do painel
 * já usa — inclusive o drill-down por unidade.
 *
 * Sem turnos cadastrados no escopo, o popover mostra um estado vazio honesto em
 * vez de uma lista inventada. "Todos os turnos" continua sempre disponível.
 */
import * as React from "react";
import { Check, ChevronDown, Layers } from "lucide-react";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

import {
  ALL_OPTION_VALUE,
  scaleTriggerDescription,
  scaleTriggerLabel,
  type PanelFilterOption,
} from "./filters";

/** Dimensões da escala. Hoje só Turno — ver o cabeçalho para o porquê. */
const DIMENSIONS = [{ id: "turno", label: "Turno", icon: Layers }] as const;

export function ScaleFilter({
  shiftId,
  shiftOptions,
  onChange,
  className,
}: {
  /** Turno aplicado (`undefined` = todos). */
  shiftId?: string;
  /** Turnos REAIS do escopo atual (workspace/unidade). */
  shiftOptions: readonly PanelFilterOption[];
  onChange: (shiftId: string | undefined) => void;
  className?: string;
}) {
  const [open, setOpen] = React.useState(false);

  const filters = { shiftId } as { shiftId?: string };
  const options: PanelFilterOption[] = [
    { id: ALL_OPTION_VALUE, name: "Todos os turnos" },
    ...shiftOptions,
  ];
  const active = shiftId ?? ALL_OPTION_VALUE;

  return (
    <div className={className}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-label={scaleTriggerDescription(filters, shiftOptions)}
            aria-haspopup="dialog"
            aria-expanded={open}
            className={cn(
              "flex h-8 cursor-pointer items-center gap-2 whitespace-nowrap rounded-md border border-input bg-transparent px-3 text-sm shadow-xs transition-[color,box-shadow,border-color] outline-none",
              "hover:border-ring/60 focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50",
              open && "border-ring",
            )}
          >
            <Layers className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            <span className="max-w-[150px] truncate">
              {scaleTriggerLabel(filters, shiftOptions)}
            </span>
            <ChevronDown className="size-4 shrink-0 opacity-50" aria-hidden="true" />
          </button>
        </PopoverTrigger>

        <PopoverContent align="end" className="w-64 p-0">
          <p className="border-b px-3 py-2 text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
            Escala
          </p>

          {/* Dimensão: uma por vez (hoje só Turno — Equipe entra quando existir
              contrato real de equipes). */}
          {DIMENSIONS.length > 1 && (
            <div className="border-b p-2">
              <div
                role="tablist"
                aria-label="Dimensão da escala"
                className="flex gap-0.5 rounded-lg bg-muted p-0.5"
              >
                {DIMENSIONS.map((item) => (
                  <span
                    key={item.id}
                    className="flex flex-1 items-center justify-center gap-1.5 rounded-md bg-background px-2 py-1.5 text-[13px] font-medium shadow-xs"
                  >
                    {item.label}
                  </span>
                ))}
              </div>
            </div>
          )}

          <div role="listbox" aria-label="Escala — Turno" className="p-1">
            {options.map((option) => {
              const isSelected = active === option.id;
              return (
                <button
                  key={option.id}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  onClick={() => {
                    onChange(option.id === ALL_OPTION_VALUE ? undefined : option.id);
                    setOpen(false);
                  }}
                  className={cn(
                    "flex w-full cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors",
                    isSelected ? "text-primary font-medium" : "hover:bg-muted",
                  )}
                >
                  <Check
                    className={cn("size-4 shrink-0", isSelected ? "text-primary" : "opacity-0")}
                    aria-hidden="true"
                  />
                  <span className="truncate">{option.name}</span>
                </button>
              );
            })}
          </div>

          {shiftOptions.length === 0 && (
            <p className="border-t px-3 py-2 text-[11px] text-muted-foreground">
              Nenhum turno cadastrado neste escopo.
            </p>
          )}
        </PopoverContent>
      </Popover>
    </div>
  );
}
