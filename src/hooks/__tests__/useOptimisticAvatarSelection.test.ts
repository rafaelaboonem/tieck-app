/**
 * useOptimisticAvatarSelection — otimismo e rollback da escolha de avatar.
 *
 * O hook é genérico (a seleção é modo + id, um objeto novo a cada render), então
 * o teste usa a MESMA chave estável do produto (`avatarSelectionKey`) em vez de
 * comparar referências — que é justamente o erro que a API evita.
 *
 * O teste do ROLLBACK precisa de um valor salvo que se comporta como o do
 * produto: `persistSettings` (Configurações) atualiza o estado local com o mesmo
 * objeto que foi ao banco, então o valor salvo muda ANTES de `save()` resolver. É
 * isso que `rerender` reproduz aqui — sem isso o teste provaria menos do que
 * promete (uma janela de "volta ao antigo" passaria batido).
 */
import { describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";

import {
  useOptimisticAvatarSelection,
  type AvatarSelectionSaveResult,
} from "../useOptimisticAvatarSelection";
import {
  avatarSelectionKey,
  type AvatarSelection,
} from "@/lib/member-avatar-preference";

const ILLUSTRATED_07: AvatarSelection = { mode: "illustrated", avatarId: "avatar-07" };
const ILLUSTRATED_14: AvatarSelection = { mode: "illustrated", avatarId: "avatar-14" };
const AUTOMATIC: AvatarSelection = { mode: "automatic" };
const PHOTO: AvatarSelection = { mode: "photo" };

type Save = (selection: AvatarSelection) => Promise<AvatarSelectionSaveResult>;

function renderSelection(initialSaved: AvatarSelection, save: Save) {
  return renderHook(
    ({ saved }: { saved: AvatarSelection }) =>
      useOptimisticAvatarSelection(saved, avatarSelectionKey, save),
    { initialProps: { saved: initialSaved } },
  );
}

/** Promise cujo resolve fica nas mãos do teste. */
function deferredSave() {
  let release: (result: AvatarSelectionSaveResult) => void = () => {};
  const save = vi.fn(
    () => new Promise<AvatarSelectionSaveResult>((resolve) => (release = resolve)),
  );
  return { save, release: (result: AvatarSelectionSaveResult) => release(result) };
}

describe("useOptimisticAvatarSelection", () => {
  it("mostra a escolha nova enquanto o salvamento está em voo", async () => {
    const { save, release } = deferredSave();
    const { result } = renderSelection(AUTOMATIC, save);

    expect(result.current.selection).toEqual(AUTOMATIC);
    expect(result.current.isSaving).toBe(false);
    expect(result.current.pendingKey).toBeNull();

    await act(async () => {
      void result.current.select(ILLUSTRATED_07);
    });

    expect(result.current.selection).toEqual(ILLUSTRATED_07);
    expect(result.current.isSaving).toBe(true);
    expect(result.current.pendingKey).toBe("avatar-07");

    await act(async () => {
      release({ ok: true });
    });

    expect(result.current.isSaving).toBe(false);
    expect(result.current.pendingKey).toBeNull();
  });

  it("sucesso: seleção não pisca de volta ao valor antigo", async () => {
    const { save, release } = deferredSave();
    const { result, rerender } = renderSelection(AUTOMATIC, save);

    await act(async () => {
      void result.current.select(ILLUSTRATED_14);
    });
    expect(result.current.selection).toEqual(ILLUSTRATED_14);

    // O "pai" gravou e passa o novo valor salvo, como persistSettings faz.
    rerender({ saved: ILLUSTRATED_14 });

    await act(async () => {
      release({ ok: true });
    });

    expect(result.current.selection).toEqual(ILLUSTRATED_14);
    expect(result.current.isSaving).toBe(false);
  });

  it("G) falha ao salvar → rollback completo (modo e id) para o valor persistido", async () => {
    const save = vi.fn(async () => ({ ok: false as const, message: "permission denied" }));
    const { result } = renderSelection(ILLUSTRATED_14, save);

    await act(async () => {
      await result.current.select(PHOTO);
    });

    expect(save).toHaveBeenCalledWith(PHOTO);
    expect(result.current.selection).toEqual(ILLUSTRATED_14);
    expect(result.current.isSaving).toBe(false);
  });

  it("G2) erro lançado por save também faz rollback e não vira rejeição", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const save = vi.fn(async () => {
      throw new Error("network down");
    });
    const { result } = renderSelection(ILLUSTRATED_14, save);

    await act(async () => {
      await result.current.select(AUTOMATIC);
    });

    expect(result.current.selection).toEqual(ILLUSTRATED_14);
    expect(result.current.isSaving).toBe(false);
    consoleError.mockRestore();
  });

  it("cada modo é uma seleção de verdade (não ausência de seleção)", async () => {
    const { save, release } = deferredSave();
    const { result } = renderSelection(ILLUSTRATED_07, save);

    await act(async () => {
      void result.current.select(AUTOMATIC);
    });

    expect(result.current.selection).toEqual(AUTOMATIC);
    expect(result.current.isSaving).toBe(true);
    expect(result.current.pendingKey).toBe("automatic");
    expect(save).toHaveBeenCalledWith(AUTOMATIC);

    await act(async () => {
      release({ ok: true });
    });
  });

  it("clicar na opção já ativa não escreve nada (compara por chave, não por objeto)", async () => {
    const save = vi.fn(async () => ({ ok: true as const }));
    const { result } = renderSelection(ILLUSTRATED_14, save);

    // Objeto NOVO, mesma chave: continua sendo "a opção já ativa".
    await act(async () => {
      await result.current.select({ mode: "illustrated", avatarId: "avatar-14" });
    });
    expect(save).not.toHaveBeenCalled();

    const automatic = renderSelection(AUTOMATIC, save);
    await act(async () => {
      await automatic.result.current.select({ mode: "automatic" });
    });
    expect(save).not.toHaveBeenCalled();
  });

  it("clique durante um salvamento em voo não dispara segunda escrita", async () => {
    const { save, release, } = deferredSave();
    const { result } = renderSelection(AUTOMATIC, save);

    await act(async () => {
      void result.current.select(ILLUSTRATED_07);
    });
    await act(async () => {
      void result.current.select(PHOTO);
    });

    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith(ILLUSTRATED_07);

    await act(async () => {
      release({ ok: true });
    });
  });
});
