/**
 * Execution 5E.2A / 6B.2B / 6B.2C — the SINGLE definition of occurrence state.
 *
 * 5E.2A deliberately persists no status column: the truth lives in the
 * timestamps.
 *
 *   completed → completed_at IS NOT NULL
 *   overdue   → completed_at IS NULL AND now() > due_at
 *   started   → completed_at IS NULL AND now() <= due_at AND started_at IS NOT NULL
 *   pending   → otherwise
 *
 * This module is PURE (no client, no network) so every surface — the executor's
 * occurrence bridge, the Home priorities, the dashboard — projects the same
 * rule instead of re-deriving it. `started_at` is a real distinction (the
 * obligation was opened) but it NEVER means completed.
 */
export type OccurrenceExecutionState = "pending" | "started" | "overdue" | "completed";

export type OccurrenceLifecycleTimestamps = {
  startedAt: string | null;
  completedAt: string | null;
  dueAt: string;
};

/**
 * Canonical state derived ONLY from the 5E.2A timestamps.
 * Canonical order: completed > overdue > started > pending.
 */
export function deriveOccurrenceState(
  timestamps: OccurrenceLifecycleTimestamps,
  now: Date = new Date(),
): OccurrenceExecutionState {
  if (timestamps.completedAt) return "completed";
  const due = Date.parse(timestamps.dueAt);
  if (!Number.isNaN(due) && now.getTime() > due) return "overdue";
  if (timestamps.startedAt) return "started";
  return "pending";
}

/**
 * Actionable projection used by operational surfaces (Home priorities,
 * obligation counters). Same truth as `deriveOccurrenceState`, collapsed to the
 * three states a person acts on:
 *
 *   completed                  → "concluida"
 *   open and past due_at       → "atrasada"
 *   open and not past due_at   → "pendente"   (started or not — see above)
 */
export type OccurrenceActionStatus = "pendente" | "atrasada" | "concluida";

export function deriveOccurrenceActionStatus(
  timestamps: OccurrenceLifecycleTimestamps,
  now: Date = new Date(),
): OccurrenceActionStatus {
  const state = deriveOccurrenceState(timestamps, now);
  if (state === "completed") return "concluida";
  if (state === "overdue") return "atrasada";
  return "pendente";
}

/** An obligation still demanding action (not fulfilled). */
export function isOpenOccurrence(
  timestamps: Pick<OccurrenceLifecycleTimestamps, "completedAt">,
): boolean {
  return !timestamps.completedAt;
}
