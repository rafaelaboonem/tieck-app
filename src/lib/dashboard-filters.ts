// Helpers puros dos filtros do painel — sem dependências de UI.

export type PeriodPreset = "hoje" | "7d" | "30d" | "custom";

export interface DashboardFilters {
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
  unitId?: string;
  /**
   * Turno global (6B.3). Ausente = TODOS os turnos, inclusive execuções/
   * occurrences sem turno — nunca se usa NULL como sinônimo de "todos".
   */
  shiftId?: string;
}

/**
 * Data CIVIL LOCAL no formato `YYYY-MM-DD`.
 *
 * Nunca usar `toISOString()` para obter "o dia de hoje": ele devolve o dia
 * UTC, então às 21h de um fuso UTC-3 o recorte "Hoje" já apontaria para
 * amanhã. Aqui o dia vem dos componentes locais do navegador — exatamente o
 * que o calendário produz quando o usuário clica num dia (`toIsoDate` da
 * toolbar usa a mesma conversão, então preset e calendário concordam).
 */
export function toCivilDateISO(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

/**
 * "Hoje" na data civil LOCAL. Aceita um instante injetado para testes.
 */
export function todayISO(now: Date = new Date()): string {
  return toCivilDateISO(now);
}

/**
 * Data civil local N dias atrás.
 *
 * Parte da meia-noite LOCAL do dia e subtrai pelo calendário (`setDate`), de
 * modo que o resultado é sempre um dia civil — somar/subtrair milissegundos
 * erraria o dia em viradas de horário de verão.
 */
export function daysAgoISO(days: number, now: Date = new Date()): string {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  d.setDate(d.getDate() - days);
  return toCivilDateISO(d);
}

export function defaultFilters(): DashboardFilters {
  return { startDate: daysAgoISO(6), endDate: todayISO() };
}

export function sanitizeFilters(raw: Partial<DashboardFilters>): DashboardFilters {
  const isDate = (v: unknown): v is string =>
    typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v));
  const def = defaultFilters();
  let start = isDate(raw.startDate) ? raw.startDate : def.startDate;
  let end = isDate(raw.endDate) ? raw.endDate : def.endDate;
  if (start > end) [start, end] = [end, start];
  const unitId = typeof raw.unitId === "string" && raw.unitId.length > 0 ? raw.unitId : undefined;
  // Turno é opcional e fail-safe: string vazia, ausente ou de tipo errado sai do
  // estado (nunca vira um filtro impossível).
  const shiftId =
    typeof raw.shiftId === "string" && raw.shiftId.length > 0 ? raw.shiftId : undefined;
  return { startDate: start, endDate: end, unitId, shiftId };
}

/**
 * Turno a ser efetivamente aplicado. Só aplica um turno quando ele é válido no
 * escopo atual; enquanto as opções do escopo ainda não resolveram, o turno
 * selecionado é mantido (é um filtro legítimo, não uma combinação impossível).
 */
export function resolveEffectiveShiftId(opts: {
  shiftId?: string;
  availableShiftIds: string[];
  optionsResolved: boolean;
}): string | undefined {
  if (!opts.shiftId) return undefined;
  if (!opts.optionsResolved) return opts.shiftId;
  return opts.availableShiftIds.includes(opts.shiftId) ? opts.shiftId : undefined;
}

/**
 * Um turno selecionado que não existe no escopo atual é uma combinação
 * impossível: precisa ser limpo (nunca consultar a unidade B com o turno X da
 * unidade A). Só decide depois que as opções do escopo resolveram.
 */
export function shouldClearShiftId(opts: {
  shiftId?: string;
  availableShiftIds: string[];
  optionsResolved: boolean;
}): boolean {
  if (!opts.shiftId) return false;
  if (!opts.optionsResolved) return false;
  return !opts.availableShiftIds.includes(opts.shiftId);
}

export function detectPreset(f: DashboardFilters): PeriodPreset {
  const t = todayISO();
  if (f.startDate === t && f.endDate === t) return "hoje";
  if (f.endDate === t && f.startDate === daysAgoISO(6)) return "7d";
  if (f.endDate === t && f.startDate === daysAgoISO(29)) return "30d";
  return "custom";
}

export function presetToRange(p: PeriodPreset): { startDate: string; endDate: string } | null {
  const t = todayISO();
  if (p === "hoje") return { startDate: t, endDate: t };
  if (p === "7d") return { startDate: daysAgoISO(6), endDate: t };
  if (p === "30d") return { startDate: daysAgoISO(29), endDate: t };
  return null;
}
