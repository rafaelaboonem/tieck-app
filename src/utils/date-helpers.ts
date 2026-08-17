/**
 * Helpers for UTC/Local conversions for native <input type="date|time">
 */
export const toLocalISO = (date: Date) => {
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

export const fromLocalISO = (localISO: string) => {
  if (!localISO) return null;
  // Date constructor with YYYY-MM-DDTHH:mm uses local timezone
  return new Date(localISO).toISOString();
};
