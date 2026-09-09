/**
 * Execution 5E.0B — canonical public checklist link helpers.
 *
 * Pure functions only: they build the public `/c/:identifier` URL without
 * touching persistence, schema, Camera AI or navigation contracts. The
 * identifier scheme matches the one already used by `/c/:id` (dominios/inicio):
 * custom/short slug when present, else the real checklist id.
 */

/**
 * Canonical public identifier: custom/short slug when present and valid, else
 * the real checklist id. Rejects "", "undefined" and "null" as identifiers.
 * Returns "" when no valid identifier exists (callers must fail closed).
 */
export function resolvePublicChecklistId(
  slug: string | null | undefined,
  realId: string | null | undefined
): string {
  for (const candidate of [slug, realId]) {
    if (typeof candidate !== "string") continue;
    const trimmed = candidate.trim();
    if (!trimmed || trimmed === "undefined" || trimmed === "null") continue;
    return trimmed;
  }
  return "";
}

/**
 * Builds the canonical public checklist URL: `${origin}/c/{slug|id}`.
 * Uses the caller-provided origin (window.location.origin at call sites) so
 * Preview and Production both resolve correctly — never a hardcoded domain.
 * Returns "" when no valid identifier exists (never /c/undefined, /c/null, /c/).
 */
export function buildPublicChecklistUrl(
  origin: string,
  slug: string | null | undefined,
  realId: string | null | undefined
): string {
  const publicId = resolvePublicChecklistId(slug, realId);
  if (!publicId) return "";
  return `${origin}/c/${publicId}`;
}
