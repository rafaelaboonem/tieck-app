// 6B.2A — Dia civil operacional de uma unidade.
//
// A agregação (`analytics_unit_daily_compliance`) baldeia cada execução pelo
// dia civil da UNIDADE:
//   (date_trunc('day', scheduled_at AT TIME ZONE u.timezone))::date
//
// O detalhe operacional precisa consultar exatamente o mesmo conjunto, então os
// filtros de data não podem ser calculados em UTC. Este módulo converte uma
// data civil (YYYY-MM-DD) + timezone IANA no intervalo UTC [start, end] que
// representa aquele dia na timezone da unidade.
//
// Nada aqui usa offset fixo: o deslocamento é derivado via Intl para o instante
// em questão, portanto horário de verão e mudanças históricas de offset são
// respeitados.
//
// A definição é única: nenhum outro lugar deve recalcular o "dia operacional".

/** Resultado: instantes UTC inclusivos que cobrem o período solicitado. */
export interface UnitPeriodRange {
  /** Início do primeiro dia civil da unidade, em UTC (ISO com Z). */
  start: string;
  /** Fim do último dia civil da unidade, em UTC (ISO com Z). */
  end: string;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Offset da timezone (em ms) no instante UTC informado.
 * Positivo a leste de Greenwich: America/Sao_Paulo => -10800000.
 */
function timeZoneOffsetMs(utcMs: number, timeZone: string): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const parts = dtf.formatToParts(new Date(utcMs));
  const get = (type: string): number => Number(parts.find((p) => p.type === type)?.value ?? "0");
  // Alguns locales devolvem "24" para meia-noite.
  const hour = get("hour") % 24;
  const asUtc = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    hour,
    get("minute"),
    get("second"),
  );
  return asUtc - utcMs;
}

/** true se `timeZone` é uma timezone IANA aceita pelo runtime. */
export function isValidTimeZone(timeZone: string | null | undefined): boolean {
  if (!timeZone) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone });
    return true;
  } catch {
    return false;
  }
}

/** Converte uma hora de parede local (YYYY-MM-DD + hora) na timezone para UTC. */
function zonedWallTimeToUtc(dateISO: string, timeZone: string, milliseconds: number): number {
  const [y, m, d] = dateISO.split("-").map(Number);
  const wall = Date.UTC(y, m - 1, d, 0, 0, 0, milliseconds);
  let ts = wall;
  // Duas passagens bastam na prática; iteramos para garantir convergência
  // (inclui mudanças de offset dentro do mesmo dia).
  for (let i = 0; i < 4; i++) {
    const next = wall - timeZoneOffsetMs(ts, timeZone);
    if (!Number.isFinite(next) || next === ts) break;
    ts = next;
  }
  return ts;
}

/** YYYY-MM-DD + n dias (aritmética de calendário, sem timezone). */
export function addDaysISO(dateISO: string, days: number): string {
  const [y, m, d] = dateISO.split("-").map(Number);
  const t = Date.UTC(y, m - 1, d) + days * 86400000;
  return new Date(t).toISOString().slice(0, 10);
}

/**
 * Intervalo UTC de UM dia civil da unidade.
 *
 * Sem timezone válida cai em UTC (comportamento anterior), mantendo o
 * resultado determinístico em vez de lançar.
 */
export function unitDayRange(dateISO: string, timeZone?: string | null): UnitPeriodRange {
  if (!DATE_RE.test(dateISO)) {
    throw new Error(`unitDayRange: data inválida "${dateISO}"`);
  }
  if (!isValidTimeZone(timeZone)) {
    return {
      start: `${dateISO}T00:00:00.000Z`,
      end: `${dateISO}T23:59:59.999Z`,
    };
  }
  const tz = timeZone as string;
  const startMs = zonedWallTimeToUtc(dateISO, tz, 0);
  // 23:59:59.999 local == meia-noite do dia seguinte, menos 1ms.
  const endMs = zonedWallTimeToUtc(addDaysISO(dateISO, 1), tz, 0) - 1;
  return {
    start: new Date(startMs).toISOString(),
    end: new Date(endMs).toISOString(),
  };
}

/**
 * Intervalo UTC que cobre [startDate, endDate] como dias civis da unidade:
 * meia-noite local do primeiro dia até 23:59:59.999 local do último.
 */
export function unitPeriodRange(
  startDate: string,
  endDate: string,
  timeZone?: string | null,
): UnitPeriodRange {
  const first = unitDayRange(startDate, timeZone);
  const last = unitDayRange(endDate, timeZone);
  return { start: first.start, end: last.end };
}

/** Data civil "hoje" na timezone informada (YYYY-MM-DD). */
export function zonedTodayISO(timeZone?: string | null, now: Date = new Date()): string {
  if (!isValidTimeZone(timeZone)) return now.toISOString().slice(0, 10);
  const tz = timeZone as string;
  const dtf = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return dtf.format(now);
}
