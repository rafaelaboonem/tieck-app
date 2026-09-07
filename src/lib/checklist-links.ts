/**
 * Execution 5E.0 — checklist link + settings-navigation helpers.
 *
 * These pure functions back the Publish → Share → Submissions UX without
 * touching persistence, schema or Camera AI. They only produce URLs and
 * interpret the `?settings=` search param contract.
 */

export type EditorSettingsTab =
  | "geral"
  | "compartilhar"
  | "envios"
  | "insights"
  | "emails"
  | "apresentacao";

const VALID_TABS: readonly EditorSettingsTab[] = [
  "geral",
  "compartilhar",
  "envios",
  "insights",
  "emails",
  "apresentacao",
];

/**
 * Canonical public identifier: custom/short slug when present, else the real
 * checklist id — the same scheme already used by `/c/:id` (dominios/inicio).
 * Never produces "undefined"/"null"/empty in a link.
 */
export function resolvePublicChecklistId(
  slug: string | null | undefined,
  realId: string | null | undefined
): string {
  // Slug primeiro; se ausente/inválido, cai para o id real. Nunca produz
  // "undefined"/"null"/vazio como identificador público.
  for (const candidate of [slug, realId]) {
    if (typeof candidate !== "string") continue;
    const trimmed = candidate.trim();
    if (!trimmed || trimmed === "undefined" || trimmed === "null") continue;
    return trimmed;
  }
  return "";
}

/** Builds the canonical public checklist URL: `${origin}/c/{slug|id}`. */
export function buildPublicChecklistUrl(
  origin: string,
  slug: string | null | undefined,
  realId: string | null | undefined
): string {
  const publicId = resolvePublicChecklistId(slug, realId);
  if (!publicId) return "";
  return `${origin}/c/${publicId}`;
}

/**
 * Interprets the `?settings=` search param contract:
 *
 * - `settings=true` → open settings, keep the current/default tab;
 * - `settings=envios` (or any valid tab name) → open settings on that tab;
 * - `settings=false` / missing / empty → do nothing;
 * - unknown string → open settings, keep the current/default tab (safe).
 */
export function resolveSettingsIntent(
  param: boolean | string | undefined
): { open: boolean; tab?: EditorSettingsTab } {
  if (param === undefined || param === false || param === "") {
    return { open: false };
  }
  if (typeof param === "string") {
    if ((VALID_TABS as readonly string[]).includes(param)) {
      return { open: true, tab: param as EditorSettingsTab };
    }
    return { open: true };
  }
  return { open: true };
}