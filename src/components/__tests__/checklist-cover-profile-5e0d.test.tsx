/**
 * Execution 5E.0D — shared Cover/Profile header (spec §14 A–F).
 *
 * The component is a verbatim extraction of the editor preview's inline
 * Cover/Profile block, so behavior must match it exactly.
 */
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ChecklistCoverProfile } from "@/components/ChecklistCoverProfile";

const baseSettings = {
  logoWidth: "96px",
  logoHeight: "96px",
  logoRadius: "50%",
};

function cover(position?: { x?: number; y?: number; zoom?: number }) {
  return {
    id: "b-cover",
    type: "image",
    variant: "cover",
    src: "data:image/png;base64,cover",
    ...(position ? { position } : {}),
  };
}

function profile(position?: { x?: number; y?: number; zoom?: number }) {
  return {
    id: "b-profile",
    type: "image",
    variant: "profile",
    src: "data:image/png;base64,profile",
    ...(position ? { position } : {}),
  };
}

describe("5E.0D ChecklistCoverProfile", () => {
  it("A) renders cover and profile images", () => {
    render(<ChecklistCoverProfile blocks={[cover(), profile()]} settings={baseSettings} />);
    expect(screen.getByAltText("Cover")).toBeInTheDocument();
    expect(screen.getByAltText("Profile")).toBeInTheDocument();
  });

  it("B) profile overlaps cover (centered bottom overlay)", () => {
    const { container } = render(<ChecklistCoverProfile blocks={[cover(), profile()]} settings={baseSettings} />);
    const overlay = container.querySelector(".absolute.left-1\\/2.bottom-0");
    expect(overlay).not.toBeNull();
    expect(overlay?.className).toContain("-translate-x-1/2");
    expect(overlay?.className).toContain("translate-y-1/2");
  });

  it("C) profile without cover stays in normal flow", () => {
    const { container } = render(<ChecklistCoverProfile blocks={[profile()]} settings={baseSettings} />);
    expect(screen.getByAltText("Profile")).toBeInTheDocument();
    expect(container.querySelector(".absolute")).toBeNull();
  });

  it("D) logo dimensions and radius come from settings", () => {
    render(<ChecklistCoverProfile blocks={[profile()]} settings={baseSettings} />);
    const frame = screen.getByAltText("Profile").closest("div");
    expect(frame?.getAttribute("style")).toContain("width: 96px");
    expect(frame?.getAttribute("style")).toContain("height: 96px");
    expect(frame?.getAttribute("style")).toContain("border-radius: 50%");
  });

  it("E) position/zoom transforms keep working", () => {
    render(
      <ChecklistCoverProfile
        blocks={[cover({ x: 12, y: -8, zoom: 1.5 }), profile({ x: 3, y: 4, zoom: 2 })]}
        settings={baseSettings}
      />
    );
    const coverImg = screen.getByAltText("Cover") as HTMLImageElement;
    expect(coverImg.style.transform).toBe("translate(12px, -8px) scale(1.5)");
    const profileImg = screen.getByAltText("Profile") as HTMLImageElement;
    expect(profileImg.style.transform).toBe("translate(3px, 4px) scale(2)");
  });

  it("F) plain image without cover/profile variant is ignored", () => {
    render(
      <ChecklistCoverProfile
        blocks={[{ id: "b-img", type: "image", src: "data:image/png;base64,plain" }]}
        settings={baseSettings}
      />
    );
    expect(screen.queryByAltText("Cover")).toBeNull();
    expect(screen.queryByAltText("Profile")).toBeNull();
  });
});
