/*
 * ================== FILTROS DO PAINEL OFICIAL (/painel) ===================
 *
 * Modelo dos TRÊS filtros globais do painel: Período, Unidade e Escala.
 *
 * Este arquivo é a única fonte de verdade do assunto. Ele junta:
 *
 *   1. o REGISTRO (`FILTER_DEFINITIONS`) — quem existe, com que rótulo e em que
 *      ordem. A toolbar e o personalizador iteram sobre ele; acrescentar um
 *      filtro novo é acrescentar uma entrada (mais o controle na toolbar), sem
 *      mexer em três blocos hardcoded;
 *   2. a VISIBILIDADE (`useVisibleFilters`) — quais filtros aparecem, persistida
 *      só no navegador (localStorage), nunca no Supabase;
 *   3. a PONTE COM A URL — o recorte é `DashboardFilters` (startDate, endDate,
 *      unitId, shiftId), exatamente o contrato que o resto do produto já usa
 *      (drill-down por unidade, links, /unidades/$unitId/operacao). A toolbar
 *      trabalha com presets e o modelo continua sendo datas reais.
 *
 * REGRA DE OURO: filtro oculto não pode continuar valendo. Quem esconde chama
 * `resetFilterValue`, que devolve o valor de fábrica ANTES de o controle sair da
 * toolbar — senão um recorte invisível seguiria filtrando o painel.
 *
 * Nada aqui inventa dado: as opções de unidade e de turno vêm dos contratos
 * reais (`useAccessibleUnits`, `useShiftOptions`) e são recebidas por parâmetro.
 */
import * as React from "react";

import {
  detectPreset,
  presetToRange,
  type DashboardFilters,
  type PeriodPreset,
} from "@/lib/dashboard-filters";

export type PanelFilterId = "period" | "unit" | "scale";

/**
 * Registro central dos filtros globais. `id` é a chave de visibilidade; `label`
 * é o que o personalizador mostra. A ordem aqui é a ordem da toolbar.
 */
export const FILTER_DEFINITIONS: ReadonlyArray<{ id: PanelFilterId; label: string }> = [
  { id: "period", label: "Período" },
  { id: "unit", label: "Unidade" },
  { id: "scale", label: "Escala" },
];

export const VISIBLE_FILTERS_STORAGE_KEY = "tieck:dashboard:visible-filters";

/** Estado inicial: tudo visível. */
export const DEFAULT_VISIBLE_FILTERS: PanelFilterId[] = FILTER_DEFINITIONS.map(
  (definition) => definition.id,
);

/** Mantém a ordem canônica — ligar/desligar nunca reordena a toolbar. */
export function normalizeVisibleFilters(ids: readonly PanelFilterId[]): PanelFilterId[] {
  const set = new Set(ids);
  return FILTER_DEFINITIONS.filter((definition) => set.has(definition.id)).map(
    (definition) => definition.id,
  );
}

function readStoredVisibleFilters(): PanelFilterId[] {
  if (typeof window === "undefined") return DEFAULT_VISIBLE_FILTERS;
  try {
    const raw = window.localStorage.getItem(VISIBLE_FILTERS_STORAGE_KEY);
    if (!raw) return DEFAULT_VISIBLE_FILTERS;
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return DEFAULT_VISIBLE_FILTERS;
    const known = new Set<string>(FILTER_DEFINITIONS.map((definition) => definition.id));
    // Lista vazia é uma escolha válida ("só o personalizador"), então não caímos
    // no padrão nesse caso — só quando o conteúdo guardado é inválido.
    return normalizeVisibleFilters(
      parsed.filter((id): id is PanelFilterId => typeof id === "string" && known.has(id)),
    );
  } catch {
    return DEFAULT_VISIBLE_FILTERS;
  }
}

/** Estado de visibilidade + persistência local (só o navegador). */
export function useVisibleFilters() {
  const [visible, setVisible] = React.useState<PanelFilterId[]>(readStoredVisibleFilters);

  const update = React.useCallback((next: readonly PanelFilterId[]) => {
    const normalized = normalizeVisibleFilters(next);
    setVisible(normalized);
    try {
      window.localStorage.setItem(VISIBLE_FILTERS_STORAGE_KEY, JSON.stringify(normalized));
    } catch {
      /* modo privado/armazenamento cheio: a escolha vale só nesta sessão */
    }
  }, []);

  return [visible, update] as const;
}

/**
 * Ao esconder um filtro, o valor dele volta ao padrão. `factory` é o padrão do
 * painel (o mesmo de "Restaurar padrão"), passado por quem chama para que este
 * módulo não guarde uma cópia do estado.
 */
export function resetFilterValue(
  filters: DashboardFilters,
  id: PanelFilterId,
  factory: DashboardFilters,
): DashboardFilters {
  switch (id) {
    case "period":
      return { ...filters, startDate: factory.startDate, endDate: factory.endDate };
    case "unit":
      return { ...filters, unitId: factory.unitId };
    case "scale":
      return { ...filters, shiftId: factory.shiftId };
  }
}

/** Opção de um select do painel (unidade real, turno real). */
export type PanelFilterOption = { id: string; name: string };

/** Todos = ausência do filtro. Nunca se usa id vazio como "todos". */
export const ALL_OPTION_VALUE = "all";

/** Preset exibido na toolbar: o detectado nas datas reais do recorte. */
export function panelPeriodPreset(filters: DashboardFilters): PeriodPreset {
  return detectPreset(filters);
}

/**
 * Datas de um preset. `custom` não tem datas próprias (o intervalo vem do
 * calendário), então devolve null e o chamador mantém o que já está aplicado.
 */
export function panelPresetRange(preset: PeriodPreset) {
  return presetToRange(preset);
}

const MONTHS_PT = [
  "jan",
  "fev",
  "mar",
  "abr",
  "mai",
  "jun",
  "jul",
  "ago",
  "set",
  "out",
  "nov",
  "dez",
];

/** `2026-08-19` → `19 ago`. */
export function formatShortDay(iso: string): string {
  const [, month, day] = iso.split("-");
  const monthLabel = MONTHS_PT[Number(month) - 1] ?? month;
  // Dia sem zero à esquerda: "01 set" vira "1 set".
  return `${Number(day)} ${monthLabel}`;
}

/** `2026-08-19` → `19 ago 2026`. */
export function formatShortDate(iso: string): string {
  const [year] = iso.split("-");
  return `${formatShortDay(iso)} ${year}`;
}

/**
 * Rótulo humano do período, no formato aprovado:
 *   hoje            → "17 set 2026"
 *   intervalo       → "19 ago – 17 set 2026"
 */
export function panelPeriodLabel(filters: DashboardFilters): string {
  if (filters.startDate === filters.endDate) return formatShortDate(filters.startDate);
  return `${formatShortDay(filters.startDate)} – ${formatShortDate(filters.endDate)}`;
}

/**
 * Rótulo do recorte (unidade + escala), derivado das OPÇÕES REAIS: se o id
 * selecionado não está na lista, mostra o próprio id em vez de mentir que é
 * "todas".
 */
export function panelScopeLabel(
  filters: DashboardFilters,
  unitOptions: readonly PanelFilterOption[],
  shiftOptions: readonly PanelFilterOption[],
): string {
  const unit = filters.unitId ? unitOptions.find((option) => option.id === filters.unitId) : null;
  const shift = filters.shiftId
    ? shiftOptions.find((option) => option.id === filters.shiftId)
    : null;

  const unitLabel = filters.unitId ? (unit?.name ?? filters.unitId) : "Todas as unidades";
  const shiftLabel = filters.shiftId ? (shift?.name ?? filters.shiftId) : "Todos os turnos";
  return `${unitLabel} · ${shiftLabel}`;
}

/**
 * Rótulo do filtro Escala, como o usuário lê no gatilho:
 *   sem turno → "Todos os turnos" · com turno → nome do turno.
 */
export function scaleTriggerLabel(
  filters: { shiftId?: string },
  shiftOptions: readonly PanelFilterOption[],
): string {
  if (!filters.shiftId) return "Todos os turnos";
  return shiftOptions.find((option) => option.id === filters.shiftId)?.name ?? filters.shiftId;
}

/** `aria-label`/tooltip do gatilho: "Escala — Turno: Noite". */
export function scaleTriggerDescription(
  filters: { shiftId?: string },
  shiftOptions: readonly PanelFilterOption[],
): string {
  return `Escala — Turno: ${scaleTriggerLabel(filters, shiftOptions)}`;
}
