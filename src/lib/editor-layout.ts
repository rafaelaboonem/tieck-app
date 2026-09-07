/**
 * Editor Mobile 5D.1 — pure layout helpers.
 *
 * These small functions centralize the responsive decisions of the editor shell
 * so they can be regression-tested without rendering the whole page. They do
 * NOT change any editor behavior — only positioning/visibility classes.
 */

export const MOBILE_BREAKPOINT = 768;

/** Mirrors `useIsMobile()` (viewport < 768px) for pure contexts. */
export function isNarrowViewport(width: number): boolean {
  return width < MOBILE_BREAKPOINT;
}

export interface Point {
  top: number;
  left: number;
}

export interface Box {
  width: number;
  height: number;
}

/**
 * Clamps a `fixed` menu position so the menu never leaves the viewport.
 * Used by the "/" insertion menu (w-64 = 256px, max-h-80 = 320px).
 */
export function clampMenuPosition(
  raw: Point,
  viewport: Box,
  menu: Box,
  margin = 8
): Point {
  const left = Math.min(
    Math.max(raw.left, margin),
    Math.max(margin, viewport.width - menu.width - margin)
  );
  const top = Math.min(
    Math.max(raw.top, margin),
    Math.max(margin, viewport.height - menu.height - margin)
  );
  return { top, left };
}

/** Slash menu effective size (w-64 = 256px; max-h-80 = 320px, capped by viewport). */
export function slashMenuSize(viewportHeight: number): Box {
  return {
    width: 256,
    height: Math.min(320, Math.max(160, viewportHeight - 16)),
  };
}

/** Modelos Disponíveis: 1 column on mobile, 3 columns from sm up. */
export function templatesGridClass(): string {
  return "grid grid-cols-1 sm:grid-cols-3 gap-4";
}

/** Começar / Como usar: 1 column on mobile, 2 columns from sm up. */
export function gettingStartedGridClass(): string {
  return "mt-10 grid grid-cols-1 sm:grid-cols-2 gap-y-3 gap-x-0 sm:gap-x-12 text-sm";
}

/**
 * Block side toolbar positioning.
 * Mobile: inside the block area, above the content (never off-screen).
 * Desktop: keep the existing left rail (`-left-20`).
 */
export function blockToolbarClass(isMobile: boolean | undefined): string {
  return isMobile === true
    ? "absolute left-0 -top-9 flex items-center gap-1 rounded-md border border-neutral-100 bg-white/90 px-1 py-0.5 shadow-sm text-neutral-600 dark:border-neutral-700 dark:bg-neutral-800/90 transition-opacity duration-300"
    : "absolute -left-20 top-1.5 flex items-center gap-1 transition-all duration-300 text-neutral-600";
}

/**
 * Secondary topbar actions show text labels only on sm+ screens.
 * On mobile they are icon-only; `undefined` (SSR first paint) keeps the
 * CSS-mediated desktop classes.
 */
export function topbarTextLabelClass(isMobile: boolean | undefined): string {
  return isMobile === true ? "hidden" : "hidden sm:inline";
}

/**
 * Mobile touch targets for topbar icon buttons: a ~28px hit area via padding
 * plus negative margins so the layout box stays compact on narrow screens.
 * Desktop keeps the previous tight box.
 */
export function topbarTouchTargetClass(isMobile: boolean | undefined): string {
  return isMobile === true
    ? "p-1.5 -m-1.5 flex items-center justify-center"
    : "flex items-center justify-center";
}

/**
 * Block popovers (options panel, slash-replace) — width capped so they never
 * exceed the mobile viewport even when anchored near the right edge.
 */
export function popoverWidthClass(): string {
  return "w-64 max-w-[calc(100vw-2rem)]";
}