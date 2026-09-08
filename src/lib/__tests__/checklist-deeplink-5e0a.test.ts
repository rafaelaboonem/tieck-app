/**
 * Execution 5E.0A — publish → Configurações → Compartilhar on the post-6A base.
 *
 * Structural contract over `src/routes/checklist.tsx`:
 *  - settingsTab accepts exactly "envios" | "compartilhar" (fail-closed);
 *  - share opens ONLY through shouldOpenShareAfterSave (explicit publish gate);
 *  - publish success navigates with the REAL persisted id and carries the
 *    share intent in the URL (?settings=true&settingsTab=compartilhar);
 *  - no /checklist?id=undefined-like navigation;
 *  - the 6A contract (envios deep-link, boolean settings) is preserved.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const routeSource = readFileSync(join(__dirname, "../../routes/checklist.tsx"), "utf-8");

/** Extract the Route options object passed to createFileRoute("/checklist"). */
function checklistRouteOptions(): string {
  const marker = 'createFileRoute("/checklist")({';
  const start = routeSource.indexOf(marker);
  expect(start).toBeGreaterThan(-1);
  return routeSource.slice(start + marker.length, start + marker.length + 2600);
}

describe("5E.0A — contrato settingsTab evolui o contrato 6A", () => {
  it("B) validateSearch aceita exatamente 'envios' OU 'compartilhar'", () => {
    const route = checklistRouteOptions();
    expect(route).toContain(`settingsTab?: "envios" | "compartilhar"`);
    expect(route).toContain(`search.settingsTab === "envios" ? "envios"`);
    expect(route).toContain(`search.settingsTab === "compartilhar" ? "compartilhar"`);
  });

  it("B) settingsTab inválido → undefined (fail-closed, só os dois literais)", () => {
    const route = checklistRouteOptions();
    const acceptors = route.match(/search\.settingsTab === "(envios|compartilhar)"/g) ?? [];
    expect(acceptors).toHaveLength(2);
  });

  it("preserva o contrato 6A: settings boolean-only (sem união 5E settings=string)", () => {
    const route = checklistRouteOptions();
    expect(route).toContain('settings: typeof search.settings === "boolean" ? search.settings : undefined');
    expect(route).not.toContain("boolean | string");
  });

  it("B) efeito de aba aceita 'envios' e 'compartilhar'; default 'geral' intacto", () => {
    expect(routeSource).toContain('openSettingsTabParam === "envios" || openSettingsTabParam === "compartilhar"');
    expect(routeSource).toContain("setSettingsActiveTab(openSettingsTabParam)");
    expect(routeSource).toMatch(/useState<"geral"[^>]*>\("geral"\)/);
  });
});

describe("5E.0A — publish explícito → Compartilhar via URL", () => {
  it("C) sucesso de publish usa shouldOpenShareAfterSave", () => {
    expect(routeSource).toContain('import { shouldOpenShareAfterSave } from "@/lib/checklist-publish-intent";');
    expect(routeSource).toContain(
      "shouldOpenShareAfterSave({ isPublishedOverride, serverPublished: isActuallyPublished, silent })"
    );
  });

  it("C) navegação carrega id real + settings=true + settingsTab=compartilhar", () => {
    expect(routeSource).toContain(
      `search: { id: data.id, settings: true, settingsTab: "compartilhar" }`
    );
  });

  it("C) checklist novo: sessionChecklistIdRef recebe data.id ANTES da navegação", () => {
    const gateIdx = routeSource.indexOf("shouldOpenShareAfterSave({ isPublishedOverride, serverPublished: isActuallyPublished, silent })");
    const refIdx = routeSource.indexOf("sessionChecklistIdRef.current = data.id;", gateIdx);
    const navIdx = routeSource.indexOf(`search: { id: data.id, settings: true, settingsTab: "compartilhar" }`, gateIdx);
    expect(gateIdx).toBeGreaterThan(-1);
    expect(refIdx).toBeGreaterThan(gateIdx);
    expect(navIdx).toBeGreaterThan(refIdx);
  });

  it("C) nunca navega para id indefinido/null (sem template ou concatenação de id)", () => {
    expect(routeSource).not.toMatch(/\/checklist\?id=\$\{|\/checklist\?id=" ?\+/);
    expect(routeSource).not.toContain("/c/undefined");
  });

  it("o gate substitui o antigo setTimeout/setters imperativos como abertura de share", () => {
    // O antigo bloco (main) abria share por setters + navigate id-only.
    expect(routeSource).not.toContain('setSettingsActiveTab("compartilhar");');
  });
});
