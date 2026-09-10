/**
 * Execution 5E.1.1 — pure UI helpers for the "Alertas de Prazo" configuration
 * (responsible picker + deadline entry).
 *
 * These helpers are UX-only: the canonical persisted state remains
 * `checklist_assignments.due_at` (an absolute ISO timestamp). "Em dias" is a
 * convenient entry mode, NOT a recurrence rule — only the computed absolute
 * due_at is ever saved.
 */
import { toLocalISO, fromLocalISO } from "@/utils/date-helpers";

export type DeadlineMode = "date" | "days";

export interface WorkspaceMemberLike {
  id: string;
  role?: string | null;
  user_id?: string | null;
  email_normalized?: string | null;
  profiles?: {
    display_name?: string | null;
    first_name?: string | null;
    last_name?: string | null;
  } | null;
  [key: string]: unknown;
}

// ─────────────────────────────────────────────────────────────────────────────
// Human member label (§3)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Best-effort human label for a workspace member.
 * Priority: display_name → "First Last" → email_normalized → "Membro".
 * Never shows the generic fallback when a usable name or e-mail exists.
 */
export function getWorkspaceMemberLabel(member: WorkspaceMemberLike | null | undefined): string {
  if (!member) return "Membro";
  const displayName = member.profiles?.display_name?.trim();
  if (displayName) return displayName;
  const first = member.profiles?.first_name?.trim();
  const last = member.profiles?.last_name?.trim();
  const fullName = [first, last].filter(Boolean).join(" ").trim();
  if (fullName) return fullName;
  const email = member.email_normalized?.trim();
  if (email) return email;
  return "Membro";
}

// ─────────────────────────────────────────────────────────────────────────────
// Who can be a "Responsável" (§4)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The Responsável field is whoever will EXECUTE the checklist — the
 * owner/creator is the alert recipient, never an assignable executor.
 * Excludes role === "owner" and the checklist creator by user_id. The input
 * array is never mutated; only a filtered copy is returned.
 */
export function getAssignableWorkspaceMembers<T extends WorkspaceMemberLike>(
  members: T[] | null | undefined,
  checklistOwnerUserId: string | null | undefined
): T[] {
  if (!Array.isArray(members)) return [];
  return members.filter((member) => {
    if (member.role === "owner") return false;
    if (checklistOwnerUserId && member.user_id === checklistOwnerUserId) return false;
    return true;
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Time entry: HH:mm digitable field (§8)
// ─────────────────────────────────────────────────────────────────────────────

/** Display formatting while typing: keeps digits only, renders "1337" → "13:37". */
export function formatTimeDigits(raw: string): string {
  const digits = raw.replace(/\D/g, "").slice(0, 4);
  if (digits.length <= 2) return digits;
  return `${digits.slice(0, 2)}:${digits.slice(2)}`;
}

/**
 * Strict normalization/validation of a complete time: 4 digits required,
 * hour 00–23, minute 00–59. "2460"/"24:00"/"12:60" → null (invalid).
 */
export function normalizeDeadlineTime(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const digits = raw.replace(/\D/g, "").slice(0, 4);
  if (digits.length !== 4) return null;
  const h = Number(digits.slice(0, 2));
  const m = Number(digits.slice(2));
  if (h < 0 || h > 23 || m < 0 || m > 59) return null;
  return `${digits.slice(0, 2)}:${digits.slice(2)}`;
}

export function isValidDeadlineTime(raw: string | null | undefined): boolean {
  return normalizeDeadlineTime(raw) !== null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Date entry: DD / MM / AAAA (§6)
// ─────────────────────────────────────────────────────────────────────────────

/** Initial year for a NEW deadline: the current local year (never hardcoded). */
export function getLocalYear(): number {
  return new Date().getFullYear();
}

/** Real calendar validation — 31/02 fails, leap years respected. */
export function isValidDayMonth(day: string, month: string, year: number): boolean {
  const d = Number(day);
  const m = Number(month);
  if (!Number.isInteger(d) || !Number.isInteger(m)) return false;
  if (d < 1 || d > 31 || m < 1 || m > 12) return false;
  const probe = new Date(year, m - 1, d);
  return probe.getFullYear() === year && probe.getMonth() === m - 1 && probe.getDate() === d;
}

/**
 * DATE MODE → absolute due_at ISO. Day/month must be complete (2 digits) and
 * a real calendar date; time must be a valid HH:mm. Anything incomplete or
 * invalid yields null (no valid due_at → save is blocked with an error).
 */
export function buildAssignmentDueAtFromDate(
  day: string,
  month: string,
  year: number | string,
  time: string
): string | null {
  const yearStr = String(year ?? "");
  if (!/^\d{2}$/.test(day) || !/^\d{2}$/.test(month) || !/^\d{4}$/.test(yearStr)) return null;
  const normalizedTime = normalizeDeadlineTime(time);
  if (!normalizedTime || !isValidDayMonth(day, month, Number(yearStr))) return null;
  return fromLocalISO(`${yearStr}-${month}-${day}T${normalizedTime}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// Days entry: 1–30 calendar days (§7)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * DAYS MODE → absolute due_at ISO. `days` must be an integer 1–30; the target
 * is `now` + N calendar days (local), preserving the chosen time. Month/year
 * rollover is handled by local calendar arithmetic. Not a recurrence rule —
 * the result is a single absolute timestamp.
 */
export function buildAssignmentDueAtFromDays(
  days: number,
  time: string,
  now: Date = new Date()
): string | null {
  if (!Number.isInteger(days) || days < 1 || days > 30) return null;
  const normalizedTime = normalizeDeadlineTime(time);
  if (!normalizedTime) return null;
  const [h, min] = normalizedTime.split(":").map(Number);
  const target = new Date(now.getFullYear(), now.getMonth(), now.getDate() + days, h, min, 0, 0);
  return fromLocalISO(toLocalISO(target));
}

// ─────────────────────────────────────────────────────────────────────────────
// Hydration of an existing assignment (§10)
// ─────────────────────────────────────────────────────────────────────────────

export interface DeadlineDateParts {
  day: string;
  month: string;
  year: string;
  time: string;
}

/**
 * Hydrates the visual controls from an absolute due_at (local time). Without
 * a due_at: empty day/month, current local year, default 23:59 (mode starts
 * as "date" — decided by the caller).
 */
export function hydrateDeadlinePartsFromDueAt(dueAtIso: string | null | undefined): DeadlineDateParts {
  if (!dueAtIso) {
    return { day: "", month: "", year: String(getLocalYear()), time: "23:59" };
  }
  const d = new Date(dueAtIso);
  const pad = (n: number) => n.toString().padStart(2, "0");
  return {
    day: pad(d.getDate()),
    month: pad(d.getMonth() + 1),
    year: String(d.getFullYear()),
    time: `${pad(d.getHours())}:${pad(d.getMinutes())}`,
  };
}
