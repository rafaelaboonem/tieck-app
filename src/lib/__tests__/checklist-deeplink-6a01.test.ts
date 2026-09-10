/**
 * Promotion 6A.0.1 — direct "Ver envio" deep-link, without importing 5E.
 *
 * Restores the certified 6A behavior: Home Camera AI attention priority
 * ("Ver envio") must open Configurações with the **Envios** tab selected.
 *
 * The implementation is 6A-specific: a separate `settingsTab` search param
 * that only accepts the literal "envios". The 5E approach (widening `settings`
 * to `boolean | string`) is explicitly asserted AGAINST below.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const routeSource = readFileSync(join(__dirname, "../../routes/checklist.tsx"), "utf-8");
const inicioSource = readFileSync(join(__dirname, "../../routes/inicio.tsx"), "utf-8");

/** Extract the Route options object passed to createFileRoute("/checklist"). */
function checklistRouteOptions(): string {
  const marker = 'createFileRoute("/checklist")({';
  const start = routeSource.indexOf(marker);
  expect(start).toBeGreaterThan(-1);
  return routeSource.slice(start + marker.length, start + marker.length + 2400);
}

describe("Promotion 6A.0.1 — deep-link Envios sem 5E", () => {
  it("A/B) validateSearch aceita settingsTab 'envios' (6A) e 'compartilhar' (5E.0A), fail-closed", () => {
    const route = checklistRouteOptions();
    // Contrato evoluído pela 5E.0A: 'envios' continua aceito; 'compartilhar'
    // foi adicionado para o publish → Share. Qualquer outro valor → undefined.
    expect(route).toContain(`search.settingsTab === "envios" ? "envios"`);
    expect(route).toContain(`settingsTab?: "envios" | "compartilhar"`);
  });

  it("C) settingsTab inválido → undefined (exatamente os dois literais aceitos)", () => {
    const route = checklistRouteOptions();
    // Exatamente dois aceitadores: "envios" (6A) e "compartilhar" (5E.0A).
    const acceptors = route.match(/search\.settingsTab === "(envios|compartilhar)"/g) ?? [];
    expect(acceptors).toHaveLength(2);
  });

  it("preserva o contrato da main para settings (boolean-only)", () => {
    const route = checklistRouteOptions();
    expect(route).toContain('settings: typeof search.settings === "boolean" ? search.settings : undefined');
    // 5E tinha `settings?: boolean | string` — proibido aqui.
    expect(route).not.toContain("boolean | string");
  });

  it("efeito dedicado seleciona a aba Envios quando o deep-link está presente", () => {
    expect(routeSource).toContain('openSettingsTabParam === "envios"');
    expect(routeSource).toContain('setSettingsActiveTab("envios")');
    // Sem default global alterado: o useState continua iniciando em "geral".
    expect(routeSource).toMatch(/useState<"geral"[^>]*>\("geral"\)/);
  });

  it("B) deep-link + settings=true coexistem com o efeito existente de abrir Configurações", () => {
    // O efeito original de abrir o painel permanece intacto…
    expect(routeSource).toContain("if (openSettingsParam) {");
    expect(routeSource).toContain("setIsSettingsOpen(true)");
    // …e o novo efeito de aba é declarado depois de settingsActiveTab (ordem segura).
    const stateIdx = routeSource.indexOf('const [settingsActiveTab, setSettingsActiveTab]');
    const effectIdx = routeSource.indexOf('openSettingsTabParam === "envios"');
    expect(stateIdx).toBeGreaterThan(-1);
    expect(effectIdx).toBeGreaterThan(stateIdx);
  });

  it("D/E/F) inicio.tsx navega com settings + settingsTab, sem surface 5E", () => {
    expect(inicioSource).toContain(`search: { id: checklistId, settings: true, settingsTab: "envios" }`);
    // Nenhuma união/string de settings à moda 5E em nenhum dos dois arquivos.
    expect(inicioSource).not.toContain(`settings: "envios"`);
    expect(routeSource).not.toMatch(/settings\?: boolean \| string/);
  });

  it("nenhum helper 5E ainda não sancionado é importado (publish-intent 5E.0A, checklist-links 5E.0B e checklist-management-access 5E.0C.1 são sancionados)", () => {
    const forbidden = [
      "execution-assignment",
      "ChecklistCoverProfile",
      "checklist-render-styles",
    ];
    for (const f of forbidden) {
      expect(routeSource).not.toContain(f);
      expect(inicioSource).not.toContain(f);
    }
    // Helpers 5E já sancionados por fases anteriores continuam importáveis.
    expect(routeSource).toContain("@/lib/checklist-management-access");
    expect(routeSource).toContain("@/lib/checklist-publish-intent");
  });
});
