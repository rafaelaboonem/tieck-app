/**
 * Execution 5E.0A — publish intent gate (A1–A5).
 *
 * shouldOpenShareAfterSave must open Configurações → Compartilhar ONLY for an
 * explicit, backend-confirmed, non-silent publish. Everything else fails closed.
 */
import { describe, it, expect } from "vitest";
import { shouldOpenShareAfterSave } from "@/lib/checklist-publish-intent";

describe("5E.0A — shouldOpenShareAfterSave", () => {
  it("A1) explicit publish=true + serverPublished=true + silent=false → abre Compartilhar", () => {
    expect(
      shouldOpenShareAfterSave({ isPublishedOverride: true, serverPublished: true, silent: false })
    ).toBe(true);
  });

  it("A2) isPublishedOverride undefined + serverPublished=true → NÃO abre", () => {
    expect(
      shouldOpenShareAfterSave({ isPublishedOverride: undefined, serverPublished: true, silent: false })
    ).toBe(false);
  });

  it("A3) isPublishedOverride=false (save de publicado) → NÃO abre", () => {
    expect(
      shouldOpenShareAfterSave({ isPublishedOverride: false, serverPublished: true, silent: false })
    ).toBe(false);
  });

  it("A4) serverPublished=false (publicação falhou/não confirmada) → NÃO abre", () => {
    expect(
      shouldOpenShareAfterSave({ isPublishedOverride: true, serverPublished: false, silent: false })
    ).toBe(false);
  });

  it("A5) silent=true (autosave silencioso) → NÃO abre", () => {
    expect(
      shouldOpenShareAfterSave({ isPublishedOverride: true, serverPublished: true, silent: true })
    ).toBe(false);
  });

  it("silent undefined → tratado como não-silencioso (contrato silencioso explícito)", () => {
    expect(
      shouldOpenShareAfterSave({ isPublishedOverride: true, serverPublished: true, silent: undefined })
    ).toBe(true);
  });
});
