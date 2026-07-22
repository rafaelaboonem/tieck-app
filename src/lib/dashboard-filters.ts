// Helpers puros dos filtros do painel — sem dependências de UI.

export type PeriodPreset = "hoje" | "7d" | "30d" | "custom";

export interface DashboardFilters {
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
  unitId?: string;
}

export function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

export function daysAgoISO(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
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
  return { startDate: start, endDate: end, unitId };
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
