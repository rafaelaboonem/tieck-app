/**
 * Execution 5E.2A — execution schedule + occurrence contract.
 *
 * Pure types/helpers only:
 *   - NO occurrence generation (5E.2B)
 *   - NO timezone conversion (5E.2B)
 *   - NO status derivation — truth lives in the DB timestamps
 *     (completed_at / due_at / started_at / overdue_notified_at)
 *
 * NOTE: supabase types.ts is NOT edited here on purpose — the migration
 * has not been applied/generated on the Supabase side yet.
 */

export const EXECUTION_SCHEDULE_FREQUENCIES = [
  "once",
  "daily",
  "weekly",
  "specific_weekdays",
] as const;

export type ExecutionScheduleFrequency =
  (typeof EXECUTION_SCHEDULE_FREQUENCIES)[number];

/** ISO weekdays: 1 = Monday … 7 = Sunday (matches the DB CHECK). */
export const ISO_WEEKDAYS = [1, 2, 3, 4, 5, 6, 7] as const;

export type IsoWeekday = (typeof ISO_WEEKDAYS)[number];

/**
 * Mirrors public.checklist_execution_schedules (5E.2A migration).
 * due_local_time is a local `time without time zone` ("HH:mm[:ss]");
 * starts_on/ends_on are calendar dates ("YYYY-MM-DD"), inclusive.
 */
export interface ExecutionSchedule {
  id: string;
  checklist_id: string;
  workspace_member_id: string;
  frequency: ExecutionScheduleFrequency;
  weekdays: number[] | null;
  due_local_time: string;
  timezone: string;
  starts_on: string;
  ends_on: string | null;
  is_active: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Mirrors public.checklist_execution_occurrences (5E.2A migration).
 * State is derived from timestamps — never a persisted status column:
 *   completed → completed_at != null
 *   overdue   → completed_at == null && now > due_at
 *   pending   → completed_at == null && now <= due_at
 */
export interface ExecutionOccurrence {
  id: string;
  schedule_id: string;
  occurrence_date: string;
  due_at: string;
  started_at: string | null;
  completed_at: string | null;
  response_id: string | null;
  overdue_notified_at: string | null;
  created_at: string;
  updated_at: string;
}

/** True only for one of the four supported frequency literals. */
export function isExecutionScheduleFrequency(
  value: unknown,
): value is ExecutionScheduleFrequency {
  return (
    typeof value === "string" &&
    (EXECUTION_SCHEDULE_FREQUENCIES as readonly string[]).includes(value)
  );
}

/** True only for an ISO weekday: integer 1..7 (1 = Monday, 7 = Sunday). */
export function isValidIsoWeekday(value: unknown): value is IsoWeekday {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= 1 &&
    value <= 7
  );
}

/**
 * Validates the `weekdays` payload against the DB constraint:
 *   - specific_weekdays → required non-empty array (1..7 entries) of ISO weekdays
 *   - once/daily/weekly → weekdays must be absent/null
 */
export function isValidScheduleWeekdays(
  frequency: ExecutionScheduleFrequency,
  weekdays: number[] | null | undefined,
): boolean {
  if (frequency === "specific_weekdays") {
    if (!Array.isArray(weekdays) || weekdays.length < 1 || weekdays.length > 7) {
      return false;
    }
    return weekdays.every((w) => isValidIsoWeekday(w));
  }
  return weekdays === null || weekdays === undefined;
}
