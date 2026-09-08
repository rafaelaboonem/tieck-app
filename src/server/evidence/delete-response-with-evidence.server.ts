import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Evidence 6A.5.1 — server-only primitive for deleting a checklist response
 * together with its persisted storage objects.
 *
 * Order is authoritative:
 *   1. Storage objects (Storage API, service role) — NEVER `DELETE FROM storage.objects`
 *   2. `checklist_responses` row (FK cascades remove checklist_evidences rows,
 *      camera_ai_attempts rows, etc.)
 *
 * If Storage fails, the DB row is preserved so storage_path references remain
 * available for a retry. Bucket and paths always come from the database
 * (service role), never from the browser.
 */

const DEFAULT_BUCKET = "checklist-evidences";

export type EvidenceRow = {
  id: string;
  response_id: string;
  checklist_id: string;
  origin_bucket: string | null;
  storage_path: string;
};

export type DeleteResponseWithEvidenceResult =
  | { ok: true; responseId: string; removedFileCount: number }
  | { ok: false; code: "not_found" | "load_failed" | "invalid_path" | "storage_failure" | "delete_failed"; responseId: string };

export type DeleteAuthorizationResult =
  | { allowed: true }
  | { allowed: false; code: "not_found" | "forbidden" };

/** Normalize the bucket recorded on the evidence row, falling back to the canonical private bucket. */
export function normalizeEvidenceBucket(originBucket: string | null | undefined): string {
  return originBucket && originBucket.trim() !== "" ? originBucket.trim() : DEFAULT_BUCKET;
}

/**
 * Fail-closed storage path validation.
 * Rejects: empty, absolute, backslashes, null bytes, `..` traversal segments,
 * and empty segments (double slashes).
 */
export function isSafeStoragePath(path: string): boolean {
  if (typeof path !== "string" || path.trim() === "") return false;
  if (path.startsWith("/") || path.includes("\\") || path.includes("\0")) return false;
  const segments = path.split("/");
  return !segments.some((s) => s === ".." || s === "");
}

/** Group evidence storage paths by bucket. Invalid paths are counted, never removed. */
export function collectEvidencePathsByBucket(evidences: EvidenceRow[]): {
  byBucket: Map<string, string[]>;
  invalidCount: number;
} {
  const byBucket = new Map<string, string[]>();
  let invalidCount = 0;
  for (const ev of evidences) {
    if (!isSafeStoragePath(ev.storage_path)) {
      invalidCount += 1;
      continue;
    }
    const bucket = normalizeEvidenceBucket(ev.origin_bucket);
    const list = byBucket.get(bucket) ?? [];
    list.push(ev.storage_path);
    byBucket.set(bucket, list);
  }
  return { byBucket, invalidCount };
}

/** Storage `.remove()` reports missing objects as errors in some SDK versions — treat those as acceptable. */
export function isStorageNotFoundError(error: unknown): boolean {
  if (!error) return false;
  const e = error as { statusCode?: unknown; status?: unknown; message?: unknown; error?: unknown };
  const status = typeof e.statusCode === "number" ? e.statusCode : typeof e.status === "number" ? e.status : null;
  if (status === 404) return true;
  const msg = String(e.message ?? e.error ?? "").toLowerCase();
  return msg.includes("not found") || msg.includes("no such object") || msg.includes("does not exist");
}

/**
 * Canonical authorization for deleting a response.
 *
 * Personal checklist  → only `checklist.user_id === userId`
 * Workspace checklist → `get_checklist_access(...).can_manage` (owner/admin/editor; Viewer blocked)
 */
export async function resolveResponseDeleteAuthorization(
  responseId: string,
  userId: string,
  supabase: SupabaseClient = supabaseAdmin
): Promise<DeleteAuthorizationResult> {
  const { data: response, error: responseError } = await supabase
    .from("checklist_responses")
    .select("checklist_id")
    .eq("id", responseId)
    .maybeSingle();

  if (responseError || !response) return { allowed: false, code: "not_found" };

  const { data: checklist, error: checklistError } = await supabase
    .from("checklists")
    .select("id, user_id, workspace_id")
    .eq("id", response.checklist_id)
    .maybeSingle();

  if (checklistError || !checklist) return { allowed: false, code: "not_found" };

  // Personal checklist: owner only (never inherits any workspace permission).
  if (!checklist.workspace_id) {
    return checklist.user_id === userId
      ? { allowed: true }
      : { allowed: false, code: "forbidden" };
  }

  // Workspace checklist: canonical access helper (owner/admin/editor → can_manage).
  const { data: access, error: accessError } = await supabase.rpc("get_checklist_access", {
    p_checklist_id: checklist.id,
    p_user_id: userId,
  });
  if (accessError || !access || access.length === 0) return { allowed: false, code: "forbidden" };
  return access[0]?.can_manage === true ? { allowed: true } : { allowed: false, code: "forbidden" };
}

/**
 * Delete a response and its persisted evidence files.
 *
 * - Loads the response + all of its evidences (source of truth: `response_id`).
 * - Validates every storage path (fail-closed: any invalid path preserves the DB row).
 * - Removes objects per bucket via the Storage API (missing objects tolerated).
 * - Only after Storage resolves, deletes `checklist_responses.id` and relies on
 *   existing FK cascades for dependent rows.
 */
export async function deleteResponseWithEvidence(
  responseId: string,
  supabase: SupabaseClient = supabaseAdmin
): Promise<DeleteResponseWithEvidenceResult> {
  const { data: response, error: responseError } = await supabase
    .from("checklist_responses")
    .select("id, checklist_id")
    .eq("id", responseId)
    .maybeSingle();

  if (responseError) {
    console.error(`[Evidence-Delete] failed to load response ${responseId}:`, responseError.message);
    return { ok: false, code: "load_failed", responseId };
  }
  if (!response) return { ok: false, code: "not_found", responseId };

  const { data: evidences, error: evidenceError } = await supabase
    .from("checklist_evidences")
    .select("id, response_id, checklist_id, origin_bucket, storage_path")
    .eq("response_id", responseId);

  if (evidenceError) {
    console.error(`[Evidence-Delete] failed to load evidences for response ${responseId}:`, evidenceError.message);
    return { ok: false, code: "load_failed", responseId };
  }

  const rows = (evidences ?? []) as EvidenceRow[];
  const { byBucket, invalidCount } = collectEvidencePathsByBucket(rows);

  // Fail-closed: never delete the DB row while an unremovable path reference exists.
  if (invalidCount > 0) {
    console.error(
      `[Evidence-Delete] invalid storage path(s) on response ${responseId} (${invalidCount}); DB row preserved`
    );
    return { ok: false, code: "invalid_path", responseId };
  }

  let removedFileCount = 0;
  for (const [bucket, paths] of byBucket) {
    const { error: removeError } = await supabase.storage.from(bucket).remove(paths);
    if (removeError && !isStorageNotFoundError(removeError)) {
      console.error(`[Evidence-Delete] storage remove failed for bucket "${bucket}":`, removeError.message);
      return { ok: false, code: "storage_failure", responseId };
    }
    removedFileCount += paths.length;
  }

  const { data: deleted, error: deleteError } = await supabase
    .from("checklist_responses")
    .delete()
    .eq("id", responseId)
    .select("id");

  if (deleteError || !deleted || deleted.length !== 1) {
    console.error(`[Evidence-Delete] DB delete failed for response ${responseId}:`, deleteError?.message ?? "no row returned");
    return { ok: false, code: "delete_failed", responseId };
  }

  return { ok: true, responseId, removedFileCount };
}