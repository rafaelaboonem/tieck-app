/**
 * Execution 5E.0B — Organizar structural contract (C).
 *
 * Structural assertions over `src/routes/organizar.tsx`:
 *  - the "..." menu stays present;
 *  - the card's "Copiar link" uses the canonical public URL (not
 *    handleCopyWorkspaceLink / window.location.href);
 *  - the public link is only offered for published checklists;
 *  - Envios uses the certified 6A contract
 *    (settings: true + settingsTab: "envios");
 *  - the old 5E contract `settings: "envios"` does NOT exist;
 *  - the workspace copy helper remains only for the workspace context menu.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const source = readFileSync(join(__dirname, "../../routes/organizar.tsx"), "utf-8");

/** Card component body (SortableChecklistCard) — from its declaration to the next top-level function. */
function cardBody(): string {
  const start = source.indexOf("function SortableChecklistCard");
  expect(start).toBeGreaterThan(-1);
  const end = source.indexOf("function DroppableColumn", start);
  expect(end).toBeGreaterThan(start);
  return source.slice(start, end);
}

describe("5E.0B — menu \"...\" preservado", () => {
  it("menu \"...\" continua presente no card", () => {
    const body = cardBody();
    expect(body).toContain("MoreHorizontal");
    expect(body).toContain("DropdownMenuTrigger");
  });

  it("Copiar link do checklist usa o link público canônico, não window.location.href", () => {
    const body = cardBody();
    expect(body).toContain("buildPublicChecklistUrl(window.location.origin, checklist.custom_slug, checklist.id)");
    // O antigo comportamento (copiar href da página) não pode restar no card.
    expect(body).not.toContain("window.location.href");
    // E o prop removido não pode ser referenciado no card.
    expect(body).not.toContain("onCopyLink={handleCopyWorkspaceLink}");
  });

  it("Copiar link público só existe para checklist publicado", () => {
    const body = cardBody();
    const copyIdx = body.indexOf("onClick={copyPublicLink}");
    expect(copyIdx).toBeGreaterThan(-1);
    // O item de menu está dentro do condicional is_published === true.
    const gateIdx = body.lastIndexOf("checklist.is_published === true", copyIdx);
    expect(gateIdx).toBeGreaterThan(-1);
  });

  it("rascunho não copia link público (copyPublicLink falha fechada)", () => {
    const body = cardBody();
    expect(body).toContain("if (checklist.is_published !== true)");
    expect(body).toContain('toast.error("Publique o checklist para gerar um link público.")');
    expect(body).toContain('if (!url)');
  });
});

describe("5E.0B — ações rápidas e contrato 6A", () => {
  it("card renderiza ChecklistCardQuickActions com isPublished correto", () => {
    const body = cardBody();
    expect(body).toContain("<ChecklistCardQuickActions");
    expect(body).toContain("isPublished={checklist.is_published === true}");
  });

  it("Envios usa o contrato 6A: settings: true + settingsTab: 'envios'", () => {
    const body = cardBody();
    expect(body).toContain(
      `navigate({ to: "/checklist", search: { id: checklist.id, settings: true, settingsTab: "envios" } })`
    );
  });

  it("Publicar em rascunho abre o editor (sem publicar direto)", () => {
    const body = cardBody();
    expect(body).toContain(
      `onPublish={() => navigate({ to: "/checklist", search: { id: checklist.id } })}`
    );
  });

  it("NÃO existe navegação settings: 'envios' (contrato antigo 5E)", () => {
    expect(source).not.toMatch(/settings:\s*"envios"/);
  });

  it("helper de workspace permanece apenas no menu de contexto do workspace", () => {
    // handleCopyWorkspaceLink continua definido e usado na superfície do
    // workspace (ContextMenu), mas NÃO no card.
    expect(source).toContain("const handleCopyWorkspaceLink = () => {");
    expect(source).toContain("onClick={handleCopyWorkspaceLink}");
    const body = cardBody();
    expect(body).not.toContain("handleCopyWorkspaceLink");
  });
});
