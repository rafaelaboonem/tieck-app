/**
 * Execution 5E.0D — structural parity between the editor preview and the
 * public checklist page (spec §15), plus the 6A.4.1 regression guard that the
 * watermark hide-during-live-camera contract survives the reposition (§16).
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";
import { shouldShowChecklistWatermark } from "../camera-watermark-visibility";
import { getChecklistWatermarkPlacement } from "../checklist-render-styles";

const checklistSource = readFileSync(resolve(process.cwd(), "src/routes/checklist.tsx"), "utf8");
const engineSource = readFileSync(resolve(process.cwd(), "src/components/ExecutionEngine.tsx"), "utf8");
const publicSource = readFileSync(resolve(process.cwd(), "src/routes/c.$id.tsx"), "utf8");

describe("5E.0D — editor preview consumes the shared helpers", () => {
  it("preview root style comes from getChecklistRenderStyle", () => {
    expect(checklistSource).toContain("style={getChecklistRenderStyle(settings, isDark)}");
    // No divergent inline root tokens in the preview component.
    expect(checklistSource).not.toContain("fontFamily: `'${settings.font}', sans-serif`");
  });

  it("preview uses the shared Cover/Profile component — no second inline implementation", () => {
    expect(checklistSource).toContain("<ChecklistCoverProfile blocks={blocks} settings={settings} />");
    expect(checklistSource).not.toContain('const profileBlock = blocks.find((b) => b.type === "image" && b.variant === "profile")');
    expect(checklistSource).not.toContain('alt="Cover"');
  });

  it("preview content container uses the shared class and keeps pageWidth", () => {
    expect(checklistSource).toContain('<div className={getChecklistContainerClass()} style={{ maxWidth: settings.pageWidth }}>');
  });

  it("preview toolbar chrome untouched (Modo de Visualização / Publicar / Voltar a criar)", () => {
    expect(checklistSource).toContain("Modo de Visualização");
    expect(checklistSource).toContain("Publicar");
    expect(checklistSource).toContain("Voltar a criar");
  });
});

describe("5E.0D — ExecutionEngine consumes the shared container", () => {
  it("engine container is the shared class with pageWidth fallback", () => {
    expect(engineSource).toContain('className={getChecklistContainerClass()}');
    expect(engineSource).toContain('style={{ maxWidth: settings.pageWidth || "800px" }}');
    expect(engineSource).not.toContain('"w-full mx-auto px-6"');
  });

  it("engine keeps no Cover/Profile header (belongs to outer surfaces)", () => {
    expect(engineSource).not.toContain("ChecklistCoverProfile");
    expect(engineSource).not.toContain('alt="Cover"');
  });
});

describe("5E.0D — public page consumes the shared helpers", () => {
  it("public root style comes from getChecklistRenderStyle", () => {
    expect(publicSource).toContain("style={getChecklistRenderStyle(settings, isDark)}");
    expect(publicSource).not.toContain("fontFamily: settings.font");
  });

  it("public renders the shared Cover/Profile BEFORE ExecutionEngine", () => {
    const coverIdx = publicSource.indexOf("<ChecklistCoverProfile");
    const engineIdx = publicSource.indexOf("<ExecutionEngine");
    expect(coverIdx).toBeGreaterThan(-1);
    expect(engineIdx).toBeGreaterThan(coverIdx);
  });

  it("public no longer duplicates top padding over the shared container", () => {
    expect(publicSource).not.toContain('className="pb-32 pt-12"');
    expect(publicSource).toContain('className="pb-32"');
  });

  it("watermark placement is the shared centered-bottom class — not bottom-6 right-8", () => {
    expect(publicSource).toContain("className={getChecklistWatermarkPlacement()}");
    expect(publicSource).not.toContain("bottom-6 right-8");
  });
});

describe("5E.0D — 6A.4.1 camera watermark gate preserved (§16)", () => {
  it("public route keeps the exact certified gate and camera wiring", () => {
    expect(publicSource).toContain("shouldShowChecklistWatermark(loaderData.showBranding, cameraOpen)");
    expect(publicSource).toMatch(/shouldShowChecklistWatermark\(loaderData\.showBranding, cameraOpen\) &&/);
    expect(publicSource).toContain("onCameraActiveChange={setCameraOpen}");
  });

  it("watermark is still conditionally rendered (no opacity trick) when placed", () => {
    expect(publicSource).not.toContain('cameraOpen ? "opacity-0"');
    expect(publicSource).not.toContain('cameraOpen && <div className="fixed');
  });

  it("helper behavior itself is unchanged (branding on, camera open → hidden)", () => {
    expect(shouldShowChecklistWatermark(true, false)).toBe(true);
    expect(shouldShowChecklistWatermark(true, true)).toBe(false);
    expect(shouldShowChecklistWatermark(false, false)).toBe(false);
    expect(shouldShowChecklistWatermark(false, true)).toBe(false);
    // New placement is only a class change — never a visibility change.
    expect(getChecklistWatermarkPlacement()).not.toContain("opacity");
  });
});
