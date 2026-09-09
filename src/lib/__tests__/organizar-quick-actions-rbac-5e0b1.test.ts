/**
 * Execution 5E.0B.1 — harden quick actions RBAC + desktop-only visibility.
 *
 * Structural assertions over `src/routes/organizar.tsx`:
 *  - ChecklistCardQuickActions renders ONLY inside `{canManage && (...)}`;
 *  - the quick-actions container is desktop-only (`hidden sm:flex`) so it
 *    does not reserve layout space on mobile;
 *  - desktop hover/focus reveal is preserved
 *    (group-hover:opacity-100 / focus-within:opacity-100 / transition-opacity);
 *  - Envios keeps the certified 6A contract
 *    (settings: true + settingsTab: "envios"; never settings: "envios");
 *  - the canonical public link call remains unchanged.
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

describe("5E.0B.1 — RBAC gate das quick actions", () => {
  it("ChecklistCardQuickActions só renderiza dentro de {canManage && (...)}", () => {
    const body = cardBody();
    const gateIdx = body.indexOf("{canManage && (");
    const compIdx = body.indexOf("<ChecklistCardQuickActions");
    expect(gateIdx).toBeGreaterThan(-1);
    expect(compIdx).toBeGreaterThan(gateIdx);
  });

  it("o gate canManage é o condicional imediatamente anterior ao container das quick actions", () => {
    const body = cardBody();
    const compIdx = body.indexOf("<ChecklistCardQuickActions");
    expect(compIdx).toBeGreaterThan(-1);
    // O gate mais próximo ANTES do componente precisa ser de canManage, e
    // entre eles só pode existir o container div das ações.
    const gateIdx = body.lastIndexOf("{canManage && (", compIdx);
    expect(gateIdx).toBeGreaterThan(-1);
    const between = body.slice(gateIdx, compIdx);
    expect(between).toContain("hidden sm:flex");
    expect(between).not.toContain("<DropdownMenuContent");
    expect(between).not.toContain("onClick={copyPublicLink}");
  });
});

describe("5E.0B.1 — container desktop-only", () => {
  it("container usa `hidden sm:flex` (não reserva espaço no mobile)", () => {
    const body = cardBody();
    expect(body).toContain("hidden sm:flex items-center gap-1 mt-2 pt-2");
  });

  it("hover/focus de desktop continuam revelando as ações", () => {
    const body = cardBody();
    expect(body).toContain("group-hover:opacity-100");
    expect(body).toContain("focus-within:opacity-100");
    expect(body).toContain("transition-opacity");
  });

  it("o antigo container sem `hidden` (sempre visível/ocupando espaço) não existe mais", () => {
    const body = cardBody();
    expect(body).not.toContain('className="flex items-center gap-1 mt-2 pt-2 border-t border-neutral-50 opacity-0');
  });
});

describe("5E.0B.1 — contratos preservados", () => {
  it("Envios continua no contrato 6A: settings: true + settingsTab: 'envios'", () => {
    const body = cardBody();
    expect(body).toContain(
      `navigate({ to: "/checklist", search: { id: checklist.id, settings: true, settingsTab: "envios" } })`
    );
  });

  it("NÃO existe navegação settings: 'envios' (contrato antigo 5E)", () => {
    expect(source).not.toMatch(/settings:\s*"envios"/);
  });

  it("link público canônico permanece intacto no card", () => {
    const body = cardBody();
    expect(body).toContain("buildPublicChecklistUrl(window.location.origin, checklist.custom_slug, checklist.id)");
    expect(body).not.toContain("window.location.href");
  });
});
