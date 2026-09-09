/**
 * Execution 5E.0B — canonical public checklist link helpers (A).
 *
 * resolvePublicChecklistId / buildPublicChecklistUrl must prefer a valid
 * custom_slug, fall back to the real id, reject "", "undefined" and "null",
 * and never produce /c/undefined, /c/null or /c/ — returning "" instead.
 */
import { describe, it, expect } from "vitest";
import {
  resolvePublicChecklistId,
  buildPublicChecklistUrl,
} from "@/lib/checklist-links";

const ORIGIN = "https://preview.example.app";

describe("5E.0B — resolvePublicChecklistId", () => {
  it("slug válido tem prioridade", () => {
    expect(resolvePublicChecklistId("meu-slug", "uuid-123")).toBe("meu-slug");
  });

  it("sem slug → id real", () => {
    expect(resolvePublicChecklistId(null, "uuid-123")).toBe("uuid-123");
    expect(resolvePublicChecklistId(undefined, "uuid-123")).toBe("uuid-123");
  });

  it('slug "undefined" → fallback id', () => {
    expect(resolvePublicChecklistId("undefined", "uuid-123")).toBe("uuid-123");
  });

  it('slug "null" → fallback id', () => {
    expect(resolvePublicChecklistId("null", "uuid-123")).toBe("uuid-123");
  });

  it("slug vazio → fallback id", () => {
    expect(resolvePublicChecklistId("", "uuid-123")).toBe("uuid-123");
    expect(resolvePublicChecklistId("   ", "uuid-123")).toBe("uuid-123");
  });

  it("sem slug e sem id → \"\"", () => {
    expect(resolvePublicChecklistId(null, null)).toBe("");
    expect(resolvePublicChecklistId(undefined, undefined)).toBe("");
    expect(resolvePublicChecklistId("undefined", "null")).toBe("");
    expect(resolvePublicChecklistId("", "null")).toBe("");
  });
});

describe("5E.0B — buildPublicChecklistUrl", () => {
  it("slug válido → /c/slug", () => {
    expect(buildPublicChecklistUrl(ORIGIN, "meu-slug", "uuid-123")).toBe(`${ORIGIN}/c/meu-slug`);
  });

  it("sem slug → /c/id", () => {
    expect(buildPublicChecklistUrl(ORIGIN, null, "uuid-123")).toBe(`${ORIGIN}/c/uuid-123`);
  });

  it('slug "undefined" → /c/id (nunca /c/undefined)', () => {
    expect(buildPublicChecklistUrl(ORIGIN, "undefined", "uuid-123")).toBe(`${ORIGIN}/c/uuid-123`);
  });

  it('slug "null" → /c/id (nunca /c/null)', () => {
    expect(buildPublicChecklistUrl(ORIGIN, "null", "uuid-123")).toBe(`${ORIGIN}/c/uuid-123`);
  });

  it("slug vazio → /c/id", () => {
    expect(buildPublicChecklistUrl(ORIGIN, "", "uuid-123")).toBe(`${ORIGIN}/c/uuid-123`);
  });

  it("sem identificador válido → \"\" (nunca /c/ ou /c/undefined)", () => {
    expect(buildPublicChecklistUrl(ORIGIN, null, null)).toBe("");
    expect(buildPublicChecklistUrl(ORIGIN, "null", "undefined")).toBe("");
  });

  it("usa a origin recebida (Preview/Production corretos, sem domínio hardcoded)", () => {
    expect(buildPublicChecklistUrl("http://localhost:3000", "s", "i")).toBe("http://localhost:3000/c/s");
  });
});
