/**
 * Execution 5E.0B — quick actions on checklist cards (B).
 *
 * Published: Editar, Copiar link, Envios (never Publicar).
 * Draft: Editar, Publicar (never Copiar link, never Envios).
 * Buttons must stop propagation so the card's main click is not triggered.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ChecklistCardQuickActions } from "@/components/checklists/ChecklistCardQuickActions";

function setup(isPublished: boolean) {
  const onEdit = vi.fn();
  const onCopyLink = vi.fn();
  const onOpenSubmissions = vi.fn();
  const onPublish = vi.fn();
  let parentClicks = 0;
  const utils = render(
    <div
      data-testid="card-surface"
      onClick={(e) => {
        // Simula o clique principal do card (abrir editor) — só dispara se o
        // evento NÃO tiver sido interrompido por stopPropagation.
        if (!e.defaultPrevented) parentClicks += 1;
      }}
    >
      <ChecklistCardQuickActions
        isPublished={isPublished}
        onEdit={onEdit}
        onCopyLink={onCopyLink}
        onOpenSubmissions={onOpenSubmissions}
        onPublish={onPublish}
      />
    </div>
  );
  return { onEdit, onCopyLink, onOpenSubmissions, onPublish, utils, getParent: () => utils.getByTestId("card-surface"), getClicks: () => parentClicks };
}

describe("5E.0B — ChecklistCardQuickActions (publicado)", () => {
  it("mostra Editar, Copiar link e Envios", () => {
    setup(true);
    expect(screen.getByRole("button", { name: "Editar" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Copiar link" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Envios" })).toBeTruthy();
  });

  it("NÃO mostra Publicar", () => {
    setup(true);
    expect(screen.queryByRole("button", { name: "Publicar" })).toBeNull();
  });

  it("cada ação dispara seu callback", () => {
    const { onEdit, onCopyLink, onOpenSubmissions } = setup(true);
    fireEvent.click(screen.getByRole("button", { name: "Editar" }));
    fireEvent.click(screen.getByRole("button", { name: "Copiar link" }));
    fireEvent.click(screen.getByRole("button", { name: "Envios" }));
    expect(onEdit).toHaveBeenCalledTimes(1);
    expect(onCopyLink).toHaveBeenCalledTimes(1);
    expect(onOpenSubmissions).toHaveBeenCalledTimes(1);
  });
});

describe("5E.0B — ChecklistCardQuickActions (rascunho)", () => {
  it("mostra Editar e Publicar; NÃO Copiar link; NÃO Envios", () => {
    setup(false);
    expect(screen.getByRole("button", { name: "Editar" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Publicar" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Copiar link" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Envios" })).toBeNull();
  });

  it("Publicar dispara onPublish", () => {
    const { onPublish } = setup(false);
    fireEvent.click(screen.getByRole("button", { name: "Publicar" }));
    expect(onPublish).toHaveBeenCalledTimes(1);
  });
});

describe("5E.0B — propagação", () => {
  it("clique em ação não propaga para a superfície do card", () => {
    const { getClicks, onEdit } = setup(true);
    fireEvent.click(screen.getByRole("button", { name: "Editar" }));
    expect(onEdit).toHaveBeenCalledTimes(1);
    // stopPropagation impediu o clique de chegar na superfície do card.
    expect(getClicks()).toBe(0);
  });
});
