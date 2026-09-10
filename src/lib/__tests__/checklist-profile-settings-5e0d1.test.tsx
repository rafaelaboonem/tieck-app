/**
 * Execution 5E.0D.1 — persist + restore profile visual settings and close the
 * pageWidth parity gap.
 *
 * Root cause of the preview↔public profile divergence: `logoWidth`,
 * `logoHeight` and `logoRadius` existed as editor state but were never written
 * to the persisted `settings` JSON nor hydrated back from it, so the public
 * page rendered the profile with undefined dimensions.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";
import { render, screen } from "@testing-library/react";
import { ChecklistCoverProfile } from "@/components/ChecklistCoverProfile";

const checklistSource = readFileSync(resolve(process.cwd(), "src/routes/checklist.tsx"), "utf8");
const engineSource = readFileSync(resolve(process.cwd(), "src/components/ExecutionEngine.tsx"), "utf8");

describe("5E.0D.1 — profile settings are persisted and restored", () => {
  it("A) save object includes logoWidth/logoHeight/logoRadius", () => {
    expect(checklistSource).toContain("logoWidth, logoHeight, logoRadius, selfEmailNotif,");
  });

  it("B) settings hydrators restore all three keys", () => {
    expect(checklistSource).toContain('["logoWidth", setLogoWidth],');
    expect(checklistSource).toContain('["logoHeight", setLogoHeight],');
    expect(checklistSource).toContain('["logoRadius", setLogoRadius],');
  });

  it("B2) saveChecklist closure deps include the three keys", () => {
    const depsLine = checklistSource.split("\n").find((l) => l.startsWith("  }, [user, title, blocks,"));
    expect(depsLine).toBeDefined();
    expect(depsLine!).toContain("logoWidth, logoHeight, logoRadius,");
  });
});

describe("5E.0D.1 — ChecklistCoverProfile fail-safe defaults", () => {
  const base = { logoWidth: "100px", logoHeight: "100px", logoRadius: "50px" };
  const profileBlock = [{ id: "b-profile", type: "image", variant: "profile", src: "data:image/png;base64,p" }];

  it("C) explicit settings are applied exactly", () => {
    render(<ChecklistCoverProfile blocks={profileBlock} settings={{ ...base, logoWidth: "120px", logoHeight: "80px", logoRadius: "12px" }} />);
    const style = (screen.getByAltText("Profile").closest("div") as HTMLElement).getAttribute("style");
    expect(style).toContain("width: 120px");
    expect(style).toContain("height: 80px");
    expect(style).toContain("border-radius: 12px");
  });

  it("D) legacy settings without the three keys get canonical defaults (100px/100px/50px)", () => {
    render(<ChecklistCoverProfile blocks={profileBlock} settings={{}} />);
    const style = (screen.getByAltText("Profile").closest("div") as HTMLElement).getAttribute("style");
    expect(style).toContain("width: 100px");
    expect(style).toContain("height: 100px");
    expect(style).toContain("border-radius: 50px");
    expect(style).not.toContain("width: undefined");
    expect(style).not.toContain("height: undefined");
    expect(style).not.toContain("border-radius: undefined");
  });
});

describe("5E.0D.1 — pageWidth parity in ExecutionEngine", () => {
  it("E) engine maxWidth follows settings.pageWidth with no 800px fallback", () => {
    expect(engineSource).toContain("style={{ maxWidth: settings.pageWidth }}");
    expect(engineSource).not.toContain('settings.pageWidth || "800px"');
  });
});

describe("5E.0D.1 — invariants preserved", () => {
  it("F) Cover/Profile stays a shared component outside the engine", () => {
    expect(engineSource).not.toContain("ChecklistCoverProfile");
    expect(checklistSource).toContain("<ChecklistCoverProfile blocks={blocks} settings={settings} />");
  });

  it("G) 6A.4.1 watermark gate untouched in the public route", () => {
    const publicSource = readFileSync(resolve(process.cwd(), "src/routes/c.$id.tsx"), "utf8");
    expect(publicSource).toContain("shouldShowChecklistWatermark(loaderData.showBranding, cameraOpen)");
    expect(publicSource).toContain("onCameraActiveChange={setCameraOpen}");
  });
});
