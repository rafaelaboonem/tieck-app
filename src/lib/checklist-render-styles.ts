/**
 * Shared visual tokens for checklist rendering surfaces.
 *
 * Source of truth = the editor's internal preview (ChecklistPreview in
 * `src/routes/checklist.tsx`). Public (`/c/:id`) and authenticated execution
 * must derive their typography and layout from these helpers so the same
 * checklist looks the same everywhere.
 */

export type ChecklistRenderStyle = {
  backgroundColor?: string;
  color?: string;
  fontFamily: string;
  fontSize?: string;
};

/**
 * Canonical font-family stack used by the editor shell, the editor preview
 * and the public page: the checklist font quoted (so names with spaces are
 * valid CSS) plus a `sans-serif` fallback. Bare `fontFamily: settings.font`
 * breaks for fonts like "Open Sans" and drops the fallback.
 */
export function resolveChecklistFontFamily(font?: string | null): string {
  return `'${font || "Inter"}', sans-serif`;
}

/**
 * Canonical style object for the checklist render surface (background, text
 * color, typography). Dark theme uses the same hardcoded values as the editor
 * preview; light theme follows the checklist settings.
 */
export function getChecklistRenderStyle(settings: any, isDark: boolean): ChecklistRenderStyle {
  return {
    backgroundColor: isDark ? "#1a1a1a" : settings.bgColor,
    color: isDark ? "#ffffff" : settings.textColor,
    fontFamily: resolveChecklistFontFamily(settings.font),
    fontSize: settings.baseFontSize,
  };
}

/**
 * Shared content container for checklist rendering — same core as the editor
 * preview (`max-w-4xl mx-auto px-4 sm:px-6 pt-12`), so padding/width behavior
 * matches on desktop and mobile.
 */
export function getChecklistContainerClass(): string {
  return "max-w-4xl w-full mx-auto px-4 sm:px-6 pt-12";
}

/**
 * Watermark/branding placement. Centered at the bottom on every viewport
 * (previously `fixed bottom-6 right-8`, which pushed the "Feito com" logo to
 * the side on mobile).
 */
export function getChecklistWatermarkPlacement(): string {
  return "fixed bottom-6 inset-x-0 z-[100] flex items-center justify-center gap-3";
}
