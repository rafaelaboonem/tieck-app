/**
 * Execution 6B.2B — typed client surface for the occurrence execution bridge.
 *
 * Binds a materialized 5E occurrence (`checklist_execution_occurrences`) to the
 * authenticated execution of its checklist. ALL writes go through the two
 * audited 6B.2B RPCs:
 *
 *   - open_checklist_execution_occurrence(occurrence_id, checklist_id)   → start
 *   - complete_checklist_execution_occurrence(occurrence_id, checklist_id,
 *                                             response_id)               → complete
 *
 * There is no direct `.from("checklist_execution_occurrences").update(...)`
 * anywhere: the lifecycle is authoritative inside the database (authorization
 * from auth.uid(), idempotent guards on the timestamps).
 *
 * supabase/types.ts is intentionally NOT edited (same contract as 5E.2A/5E.2C2):
 * this module carries a local, narrow database contract and casts the client
 * exactly once at the boundary.
 */
import { supabase } from "@/integrations/supabase/client";
import type { SupabaseClient } from "@supabase/supabase-js";
import { deriveOccurrenceState } from "./occurrence-lifecycle";

// Re-exported so the bridge's public surface is unchanged; the single
// definition lives in the pure ./occurrence-lifecycle module (6B.2C).
export { deriveOccurrenceState };
export type { OccurrenceExecutionState } from "./occurrence-lifecycle";

// ─────────────────────────────────────────────────────────────────────────────
// Local narrow DB contract (types.ts untouched)
// ─────────────────────────────────────────────────────────────────────────────

export interface OccurrenceDatabase {
  public: {
    Tables: Record<string, never>;
    Views: Record<string, never>;
    Functions: {
      open_checklist_execution_occurrence: {
        Args: { p_occurrence_id: string; p_checklist_id: string };
        Returns: unknown;
      };
      complete_checklist_execution_occurrence: {
        Args: {
          p_occurrence_id: string;
          p_checklist_id: string;
          p_response_id: string;
        };
        Returns: unknown;
      };
    };
  };
}

/** Single, explicit boundary cast — never inside components. */
const occurrenceClient = supabase as unknown as SupabaseClient<OccurrenceDatabase>;

// ─────────────────────────────────────────────────────────────────────────────
// Context / state
// ─────────────────────────────────────────────────────────────────────────────

export interface OccurrenceExecutionContext {
  occurrenceId: string;
  checklistId: string;
  scheduleId: string;
  workspaceId: string;
  workspaceMemberId: string;
  /** Civil date of the obligation (YYYY-MM-DD). */
  occurrenceDate: string;
  dueAt: string;
  startedAt: string | null;
  completedAt: string | null;
  responseId: string | null;
}

/** Identity of the occurrence as understood by the database row. */
export type OccurrenceIdentity = {
  occurrenceId: string;
  checklistId: string;
  scheduleId: string;
  workspaceId: string;
  workspaceMemberId: string;
};

/**
 * Failure reasons. Denials are kept separate from technical failures so the UI
 * can collapse them into one generic answer (never revealing whether an
 * occurrence exists in another workspace / checklist / member).
 */
export type OccurrenceBridgeFailure =
  | "invalid_argument"
  | "not_found"
  | "checklist_mismatch"
  | "not_assignee"
  | "response_required"
  | "response_not_found"
  | "response_mismatch"
  | "response_not_submitted"
  | "invalid_payload"
  | "unavailable";

export type OccurrenceBridgeResult =
  | { ok: true; context: OccurrenceExecutionContext }
  | { ok: false; reason: OccurrenceBridgeFailure };

/** Denials that must be indistinguishable from each other in the interface. */
const DENIAL_REASONS: readonly OccurrenceBridgeFailure[] = [
  "not_found",
  "checklist_mismatch",
  "not_assignee",
];

/**
 * A denial may not be distinguished from a plain "not found": an executor must
 * never learn that an occurrence exists in another checklist, workspace or
 * under another responsible member.
 */
export function isOccurrenceDenial(reason: OccurrenceBridgeFailure): boolean {
  return DENIAL_REASONS.includes(reason);
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value);
}

function asOptionalString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function asRequiredString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

/**
 * Validates the jsonb payload returned by the 6B.2B RPCs.
 * Fail-closed: anything unexpected (missing/typed-wrong identity fields) is
 * rejected instead of being rendered as a partially valid occurrence.
 */
export function parseOccurrenceContext(raw: unknown): OccurrenceExecutionContext | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const row = raw as Record<string, unknown>;

  const occurrenceId = asRequiredString(row.occurrence_id);
  const checklistId = asRequiredString(row.checklist_id);
  const scheduleId = asRequiredString(row.schedule_id);
  const workspaceId = asRequiredString(row.workspace_id);
  const workspaceMemberId = asRequiredString(row.workspace_member_id);
  const occurrenceDate = asRequiredString(row.occurrence_date);
  const dueAt = asRequiredString(row.due_at);

  if (
    !isUuid(occurrenceId) ||
    !isUuid(checklistId) ||
    !isUuid(scheduleId) ||
    !isUuid(workspaceId) ||
    !isUuid(workspaceMemberId) ||
    !occurrenceDate ||
    !dueAt ||
    Number.isNaN(Date.parse(dueAt))
  ) {
    return null;
  }

  const startedAt = asOptionalString(row.started_at);
  const completedAt = asOptionalString(row.completed_at);
  if (startedAt && Number.isNaN(Date.parse(startedAt))) return null;
  if (completedAt && Number.isNaN(Date.parse(completedAt))) return null;

  return {
    occurrenceId,
    checklistId,
    scheduleId,
    workspaceId,
    workspaceMemberId,
    occurrenceDate,
    dueAt,
    startedAt,
    completedAt,
    responseId: asOptionalString(row.response_id),
  };
}

/**
 * `finalize_public_response` returns a TABLE (array) in supabase-js, but the
 * response id is also accepted as a bare object so the bridge never depends on
 * a single transport shape.
 */
export function extractFinalizedResponseId(data: unknown): string | null {
  if (!data) return null;
  const row = Array.isArray(data) ? data[0] : data;
  if (!row || typeof row !== "object") return null;
  return asOptionalString((row as Record<string, unknown>).response_id);
}

// ─────────────────────────────────────────────────────────────────────────────
// Error classification (never leaks SQL/schema/table to the interface)
// ─────────────────────────────────────────────────────────────────────────────

const ERROR_REASON_MAP: ReadonlyArray<[string, OccurrenceBridgeFailure]> = [
  ["occurrence_not_found", "not_found"],
  ["occurrence_checklist_mismatch", "checklist_mismatch"],
  ["occurrence_checklist_not_found", "not_found"],
  ["occurrence_not_assignee", "not_assignee"],
  ["occurrence_required", "invalid_argument"],
  ["occurrence_actor_required", "not_assignee"],
  ["occurrence_response_required", "response_required"],
  ["occurrence_response_not_found", "response_not_found"],
  ["occurrence_response_mismatch", "response_mismatch"],
  ["occurrence_response_not_submitted", "response_not_submitted"],
];

function errorText(error: unknown): string {
  if (!error) return "";
  if (typeof error === "string") return error;
  if (typeof error === "object" && "message" in error) {
    const message = (error as { message?: unknown }).message;
    return typeof message === "string" ? message : "";
  }
  return "";
}

/** Classifies a database/RPC error into a reason without exposing internals. */
export function classifyOccurrenceError(error: unknown): OccurrenceBridgeFailure {
  const text = errorText(error);
  if (!text) return "unavailable";
  for (const [needle, reason] of ERROR_REASON_MAP) {
    if (text.includes(needle)) return reason;
  }
  return "unavailable";
}

export const OCCURRENCE_BRIDGE_MESSAGES: Readonly<Record<string, string>> = {
  bridgeUnavailable:
    "Não foi possível vinculares esta execução à rotina agendada. Tente novamente.",
  bridgeDenied: "Você não tem permissão para executar este checklist ou ele não existe.",
  bridgeCompleted: "Esta rotina já foi concluída.",
  bridgeRetry: "Tentar novamente",
};

/** Generic, user-safe message — never the SQL text. */
export function getOccurrenceBridgeErrorMessage(reason: OccurrenceBridgeFailure): string {
  if (isOccurrenceDenial(reason)) return OCCURRENCE_BRIDGE_MESSAGES.bridgeDenied;
  return OCCURRENCE_BRIDGE_MESSAGES.bridgeUnavailable;
}

// ─────────────────────────────────────────────────────────────────────────────
// RPC surface (the only write path)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Opens the occurrence: authorizes, idempotently marks it as started and
 * returns the authoritative context. Safe to call on every mount/refresh — a
 * second call over an already started occurrence is a no-op in the database.
 */
export async function openChecklistExecutionOccurrence(
  occurrenceId: string,
  checklistId: string,
): Promise<OccurrenceBridgeResult> {
  if (!isUuid(occurrenceId) || !isUuid(checklistId)) {
    return { ok: false, reason: "invalid_argument" };
  }

  const { data, error } = await occurrenceClient.rpc("open_checklist_execution_occurrence", {
    p_occurrence_id: occurrenceId,
    p_checklist_id: checklistId,
  });

  if (error) return { ok: false, reason: classifyOccurrenceError(error) };

  const context = parseOccurrenceContext(data);
  if (!context) return { ok: false, reason: "invalid_payload" };

  return { ok: true, context };
}

/**
 * Completes the occurrence binding it to the submitted response.
 *
 * Must only be called AFTER `finalize_public_response` succeeded; the database
 * re-verifies that the response belongs to the checklist and is 'submitted'.
 * Retrying is safe: an already completed occurrence returns its stored context.
 */
export async function completeChecklistExecutionOccurrence(
  occurrenceId: string,
  checklistId: string,
  responseId: string,
): Promise<OccurrenceBridgeResult> {
  if (!isUuid(occurrenceId) || !isUuid(checklistId) || !isUuid(responseId)) {
    return { ok: false, reason: "invalid_argument" };
  }

  const { data, error } = await occurrenceClient.rpc("complete_checklist_execution_occurrence", {
    p_occurrence_id: occurrenceId,
    p_checklist_id: checklistId,
    p_response_id: responseId,
  });

  if (error) return { ok: false, reason: classifyOccurrenceError(error) };

  const context = parseOccurrenceContext(data);
  if (!context) return { ok: false, reason: "invalid_payload" };

  return { ok: true, context };
}
