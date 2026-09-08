import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { deleteResponseWithEvidence } from "@/server/evidence/delete-response-with-evidence.server";

/**
 * Evidence 6A.5.2 — automatic retention cleanup for expired responses.
 *
 * Source of truth is the canonical `checklist_responses.expires_at` column:
 *   - submitted responses with retention enabled → retention deadline
 *     (`update_checklist_retention` sets `expires_at = submitted_at + days`)
 *   - abandoned `in_progress` sessions (`create_public_response` sets a 24h TTL)
 *     → session TTL
 *
 * Selection is uniform: `expires_at IS NOT NULL AND expires_at <= now()`.
 * No status filter, no submitted_at dependency, no recomputation of
 * retentionDays, no `settings.dataRetention` re-check (the column already
 * encodes the product decision; retention off means `expires_at = NULL`).
 *
 * Each candidate is deleted through the 6A.5.1 primitive
 * `deleteResponseWithEvidence` (Storage API first, then DB row + FK cascades).
 * The legacy SQL-only cleanup function `cleanup_expired_responses` is NEVER
 * used: it deletes the DB row directly, orphaning storage objects.
 *
 * A single failure never aborts the batch: the failed row keeps its expired
 * `expires_at`, so the next run naturally re-selects it (retry queue = the
 * expired rows themselves). `not_found` (concurrent delete / already absent)
 * is counted as skipped and is idempotent.
 */

export const EVIDENCE_RETENTION_BATCH_SIZE = 100;

export type RetentionCandidate = {
  id: string;
  status: string | null;
  expires_at: string | null;
};

/** Fail-closed candidate check — defense-in-depth on top of the SQL filter. */
export function isRetentionCandidate(
  row: { expires_at: string | null },
  nowIso: string
): boolean {
  if (!row.expires_at) return false;
  return new Date(row.expires_at).getTime() <= new Date(nowIso).getTime();
}

export type RetentionRunResult = {
  ok: true;
  scanned: number;
  deleted: number;
  failed: number;
  skipped: number;
};

/**
 * Select expired responses (oldest first, capped at `batchSize`) and delete
 * each one through the storage-first 6A.5.1 primitive. Never returns storage
 * paths or internal identifiers.
 */
export async function runEvidenceRetentionCleanup(
  supabase: SupabaseClient = supabaseAdmin,
  opts: { nowIso?: string; batchSize?: number } = {}
): Promise<RetentionRunResult> {
  const nowIso = opts.nowIso ?? new Date().toISOString();
  const batchSize = opts.batchSize ?? EVIDENCE_RETENTION_BATCH_SIZE;

  const query = supabase
    .from("checklist_responses")
    .select("id, status, expires_at")
    .not("expires_at", "is", null)
    .lte("expires_at", nowIso)
    .order("expires_at", { ascending: true })
    .limit(batchSize);

  const { data, error } = await query;
  if (error) throw error;

  const candidates = ((data ?? []) as RetentionCandidate[]).filter((r) =>
    isRetentionCandidate(r, nowIso)
  );

  let deleted = 0;
  let failed = 0;
  let skipped = 0;

  for (const candidate of candidates) {
    try {
      const result = await deleteResponseWithEvidence(candidate.id, supabase);
      if (result.ok) {
        deleted += 1;
      } else if (result.code === "not_found") {
        // Concurrent delete / already absent — benign, idempotent.
        skipped += 1;
      } else {
        console.error(
          `[Retention-Cleanup] failed response ${candidate.id} (${result.code}); kept for next run`
        );
        failed += 1;
      }
    } catch (err) {
      console.error(
        `[Retention-Cleanup] unexpected error for response ${candidate.id}:`,
        String((err as Error)?.message ?? err)
      );
      failed += 1;
    }
  }

  return { ok: true, scanned: candidates.length, deleted, failed, skipped };
}