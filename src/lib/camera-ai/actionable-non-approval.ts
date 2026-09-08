/**
 * Camera AI 6A.4 — shared actionable non-approval semantics.
 *
 * Single source of truth for "operational non-approval" used by:
 * - Home priorities (6A.3 / 6A.3.1);
 * - the verify runtime persistence decision (6A.4);
 * - Envios / EvidenceCard status labels (6A.3.1 / 6A.4).
 *
 * The real runtime (`src/server/camera-ai/gate.ts`) emits
 * `Decision = approved | retake | not_observable | technical_failure`. An
 * ACTIONABLE non-approval is:
 *   - legacy `completed` + `rejected`, or
 *   - `completed` + `retake` with an actionable code
 *     (`condition_not_met`, `reference_mismatch`, `target_missing`).
 *
 * `quality_failure`, `uncertain`, `not_observable`, `technical_failure`,
 * `failed`, `error` and `processing` are inconclusive/technical and NEVER
 * count as an operational non-approval.
 */

export const ACTIONABLE_RETAKE_CODES = ["condition_not_met", "reference_mismatch", "target_missing"] as const;

/** Minimal shape accepted by the predicate (attempt row or gate result). */
export type CameraNonApprovalLike = {
  status?: string | null;
  decision?: string | null;
  code?: string | null;
};

/**
 * An operational non-approval only counts when the terminal state is:
 *   - `completed` + `rejected` (legacy runtime), or
 *   - `completed` + `retake` with an actionable code.
 * Everything else (not_observable, technical_failure, failed, quality_failure,
 * uncertain, error, processing) is NOT an actionable non-approval.
 */
export function isActionableCameraNonApproval(a: CameraNonApprovalLike | undefined | null): boolean {
  if (!a) return false;
  if (a.status !== "completed") return false;
  if (a.decision === "rejected") return true; // legacy runtime
  if (a.decision === "retake") {
    return !!a.code && (ACTIONABLE_RETAKE_CODES as readonly string[]).includes(a.code);
  }
  return false;
}