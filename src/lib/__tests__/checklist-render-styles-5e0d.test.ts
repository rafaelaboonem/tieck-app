/**
 * Execution 5E.0D — shared render-style helpers (spec §13 A–G).
 *
 * The editor preview is the source of truth; public (/c/:id) and
 * ExecutionEngine must derive typography/layout from these helpers.
 */
import { describe, it, expect } from "vitest";
import {
  resolveChecklistFontFamily,
  getChecklistRenderStyle,
  getChecklistContainerClass,
  getChecklistWatermarkPlacement,
} from "../checklist-render-styles";

describe("5E.0D resolveChecklistFontFamily", () => {
  it("A) Inter → quoted with sans-serif fallback", () => {
    expect(resolveChecklistFontFamily("Inter")).toBe("'Inter', sans-serif");
  });

  it("B) font with space stays valid CSS", () => {
    expect(resolveChecklistFontFamily("Open Sans")).toBe("'Open Sans', sans-serif");
  });

  it("C) missing font → Inter fallback", () => {
    expect(resolveChecklistFontFamily(undefined)).toBe("'Inter', sans-serif");
    expect(resolveChecklistFontFamily(null)).toBe("'Inter', sans-serif");
    expect(resolveChecklistFontFamily("")).toBe("'Inter', sans-serif");
  });
});

describe("5E.0D getChecklistRenderStyle", () => {
  const settings = {
    font: "Open Sans",
    bgColor: "#f8f7ff",
    textColor: "#1f2937",
    baseFontSize: "18px",
  };

  it("D) light theme follows settings tokens", () => {
    const style = getChecklistRenderStyle(settings, false);
    expect(style.backgroundColor).toBe("#f8f7ff");
    expect(style.color).toBe("#1f2937");
    expect(style.fontFamily).toBe("'Open Sans', sans-serif");
    expect(style.fontSize).toBe("18px");
  });

  it("E) dark theme uses the canonical preview values", () => {
    const style = getChecklistRenderStyle(settings, true);
    expect(style.backgroundColor).toBe("#1a1a1a");
    expect(style.color).toBe("#ffffff");
    expect(style.fontFamily).toBe("'Open Sans', sans-serif");
  });
});

describe("5E.0D container + watermark placement", () => {
  it("F) container mirrors the canonical preview container", () => {
    const cls = getChecklistContainerClass();
    expect(cls).toContain("max-w-4xl");
    expect(cls).toContain("w-full");
    expect(cls).toContain("mx-auto");
    expect(cls).toContain("px-4");
    expect(cls).toContain("sm:px-6");
    expect(cls).toContain("pt-12");
  });

  it("G) watermark is centered at the bottom — never right-8", () => {
    const cls = getChecklistWatermarkPlacement();
    expect(cls).toContain("bottom-6");
    expect(cls).toContain("inset-x-0");
    expect(cls).toContain("justify-center");
    expect(cls).not.toContain("right-8");
  });
});
