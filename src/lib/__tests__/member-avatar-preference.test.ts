/**
 * Preferência de avatar em `profiles.settings`.
 *
 * O que estes testes protegem, e por que valem:
 *
 *  1. `profiles.settings` é um jsonb COMPARTILHADO. Um merge mal feito apaga
 *     `save_for_later`/`product_updates` de quem só queria trocar de avatar —
 *     por isso "preserva as outras propriedades" é caso de teste.
 *  2. O MODO manda na representação. Antes dele, quem tinha foto escolhia uma
 *     ilustração e continuava vendo a foto; agora cada modo tem uma resposta
 *     explícita, e "Automático" ignora a foto de propósito.
 *  3. Compatibilidade: conta antiga (sem `avatar_display_mode`) não pode mudar de
 *     avatar sozinha.
 *  4. "Automático" NÃO apaga a última ilustração: a chave sobrevive para que
 *     voltar de "foto"/"automático" recupere a escolha anterior.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

import {
  AVATAR_DISPLAY_MODE_SETTINGS_KEY,
  ILLUSTRATED_AVATAR_SETTINGS_KEY,
  avatarSelectionKey,
  buildSettingsWithAvatarSelection,
  buildSettingsWithIllustratedAvatar,
  readAvatarDisplayMode,
  readIllustratedAvatarId,
  resolveAvatarSelection,
} from "../member-avatar-preference";
import { ILLUSTRATED_AVATARS, type IllustratedAvatar } from "../member-avatars";

const SETTINGS_WITH_OTHERS = {
  save_for_later: true,
  product_updates: false,
  outra_chave_desconhecida: { aninhada: [1, 2, 3] },
};

const WITH_PHOTO = { hasPhoto: true } as const;
const WITHOUT_PHOTO = { hasPhoto: false } as const;

describe("compatibilidade com contas antigas (sem avatar_display_mode)", () => {
  it("A) legacy + avatarUrl → photo", () => {
    expect(resolveAvatarSelection(SETTINGS_WITH_OTHERS, WITH_PHOTO)).toEqual({ mode: "photo" });
    expect(readAvatarDisplayMode(SETTINGS_WITH_OTHERS)).toBeNull();
  });

  it("B) legacy sem avatarUrl → automatic", () => {
    expect(resolveAvatarSelection(SETTINGS_WITH_OTHERS, WITHOUT_PHOTO)).toEqual({
      mode: "automatic",
    });
    expect(resolveAvatarSelection(undefined, WITHOUT_PHOTO)).toEqual({ mode: "automatic" });
    expect(resolveAvatarSelection(null, WITHOUT_PHOTO)).toEqual({ mode: "automatic" });
  });

  it("B2) legacy sem avatarUrl mas com ilustração salva → illustrated", () => {
    // A escolha feita ANTES de o modo existir continua valendo: não mudar o
    // avatar de quem não pediu nada é exatamente o objetivo da regra legacy.
    const settings = { ...SETTINGS_WITH_OTHERS, illustrated_avatar_id: "avatar-14" };
    expect(resolveAvatarSelection(settings, WITHOUT_PHOTO)).toEqual({
      mode: "illustrated",
      avatarId: "avatar-14",
    });
  });

  it("modo gravado com valor inválido é ignorado (cai na regra legacy)", () => {
    for (const raw of ["PHOTO", "ilustrado", "", "   ", 14, true, null, {}, []]) {
      expect(readAvatarDisplayMode({ avatar_display_mode: raw })).toBeNull();
      expect(
        resolveAvatarSelection({ avatar_display_mode: raw }, WITH_PHOTO),
      ).toEqual({ mode: "photo" });
    }
  });
});

describe("cada modo tem uma resposta explícita", () => {
  it("C) mode photo + avatarUrl → foto", () => {
    expect(resolveAvatarSelection({ avatar_display_mode: "photo" }, WITH_PHOTO)).toEqual({
      mode: "photo",
    });
  });

  it("C2) mode photo SEM avatarUrl → automatic (não existe foto para mostrar)", () => {
    expect(resolveAvatarSelection({ avatar_display_mode: "photo" }, WITHOUT_PHOTO)).toEqual({
      mode: "automatic",
    });
  });

  it("D) mode automatic + avatarUrl → automático, NÃO foto", () => {
    const settings = { avatar_display_mode: "automatic", illustrated_avatar_id: "avatar-04" };
    expect(resolveAvatarSelection(settings, WITH_PHOTO)).toEqual({ mode: "automatic" });
  });

  it("E) mode illustrated + avatar-14 → avatar-14, mesmo com foto existindo", () => {
    const settings = { avatar_display_mode: "illustrated", illustrated_avatar_id: "avatar-14" };
    expect(resolveAvatarSelection(settings, WITH_PHOTO)).toEqual({
      mode: "illustrated",
      avatarId: "avatar-14",
    });
  });

  it("F) illustrated com id inválido/ausente → automático", () => {
    for (const id of [undefined, null, "avatar-99", "avatar-1", "automatic", "", 7]) {
      expect(
        resolveAvatarSelection(
          { avatar_display_mode: "illustrated", illustrated_avatar_id: id },
          WITH_PHOTO,
        ),
      ).toEqual({ mode: "automatic" });
    }
  });

  it("registry injetado é respeitado (biblioteca futura maior)", () => {
    const custom: IllustratedAvatar[] = [{ id: "avatar-30", src: "/a/30.webp" }];
    expect(
      resolveAvatarSelection(
        { avatar_display_mode: "illustrated", illustrated_avatar_id: "avatar-30" },
        { hasPhoto: false, registry: custom },
      ),
    ).toEqual({ mode: "illustrated", avatarId: "avatar-30" });
    // Id do registry real que não existe no registry injetado não vale.
    expect(
      resolveAvatarSelection(
        { avatar_display_mode: "illustrated", illustrated_avatar_id: "avatar-14" },
        { hasPhoto: false, registry: custom },
      ),
    ).toEqual({ mode: "automatic" });
  });
});

describe("escrita: modo e id numa só operação aditiva", () => {
  it("G) photo grava SÓ o modo e preserva a última ilustração escolhida", () => {
    const withChoice = { ...SETTINGS_WITH_OTHERS, illustrated_avatar_id: "avatar-14" };
    const next = buildSettingsWithAvatarSelection(withChoice, { mode: "photo" });

    expect(next).toEqual({
      ...SETTINGS_WITH_OTHERS,
      illustrated_avatar_id: "avatar-14",
      avatar_display_mode: "photo",
    });
    expect(Object.keys(next)).toHaveLength(5);
  });

  it("H) automatic grava SÓ o modo e também preserva a escolha anterior", () => {
    const withChoice = { ...SETTINGS_WITH_OTHERS, illustrated_avatar_id: "avatar-14" };
    const next = buildSettingsWithAvatarSelection(withChoice, { mode: "automatic" });

    expect(next[AVATAR_DISPLAY_MODE_SETTINGS_KEY]).toBe("automatic");
    expect(next[ILLUSTRATED_AVATAR_SETTINGS_KEY]).toBe("avatar-14");
    expect(next).not.toEqual(
      expect.objectContaining({ [ILLUSTRATED_AVATAR_SETTINGS_KEY]: "automatic" }),
    );
  });

  it("I) illustrated grava modo e id atomicamente", () => {
    const next = buildSettingsWithAvatarSelection(SETTINGS_WITH_OTHERS, {
      mode: "illustrated",
      avatarId: "avatar-07",
    });

    expect(next).toEqual({
      ...SETTINGS_WITH_OTHERS,
      avatar_display_mode: "illustrated",
      illustrated_avatar_id: "avatar-07",
    });
  });

  it("J) illustrated com id inválido → grava automatic (nunca aponta para asset inexistente)", () => {
    for (const avatarId of ["avatar-99", "avatar-1", "automatic", "", "x"]) {
      const next = buildSettingsWithAvatarSelection(SETTINGS_WITH_OTHERS, {
        mode: "illustrated",
        avatarId,
      });
      expect(next[AVATAR_DISPLAY_MODE_SETTINGS_KEY]).toBe("automatic");
      // O valor inválido nunca chega na chave do ID ("automatic" só pode ser
      // MODO, jamais escolha de ilustração).
      expect(ILLUSTRATED_AVATAR_SETTINGS_KEY in next).toBe(false);
    }
  });

  it("K) preserva TODAS as outras propriedades (merge aditivo)", () => {
    const next = buildSettingsWithAvatarSelection(SETTINGS_WITH_OTHERS, {
      mode: "illustrated",
      avatarId: "avatar-20",
    });

    expect(next.save_for_later).toBe(true);
    expect(next.product_updates).toBe(false);
    expect(next.outra_chave_desconhecida).toEqual({ aninhada: [1, 2, 3] });
  });

  it("não muta o objeto de entrada (o jsonb lido do profile fica intacto)", () => {
    const original = { ...SETTINGS_WITH_OTHERS, illustrated_avatar_id: "avatar-14" };
    const snapshot = JSON.parse(JSON.stringify(original));

    buildSettingsWithAvatarSelection(original, { mode: "photo" });
    buildSettingsWithAvatarSelection(original, { mode: "automatic" });
    buildSettingsWithAvatarSelection(original, { mode: "illustrated", avatarId: "avatar-02" });

    expect(original).toEqual(snapshot);
  });

  it("só grava ID — nunca URL, caminho, imagem ou base64", () => {
    const next = buildSettingsWithAvatarSelection({}, {
      mode: "illustrated",
      avatarId: "avatar-13",
    });
    const value = next[ILLUSTRATED_AVATAR_SETTINGS_KEY];
    expect(value).toBe("avatar-13");
    expect(String(value)).not.toContain("/");
    expect(String(value)).not.toContain(".");
    expect(String(value)).not.toContain("data:");
  });
});

describe("ida e volta entre modos (chave da opção + recuperação)", () => {
  it("photo → automatic → illustrated recupera o avatar-14 guardado", () => {
    const start = buildSettingsWithAvatarSelection({}, {
      mode: "illustrated",
      avatarId: "avatar-14",
    });
    expect(avatarSelectionKey({ mode: "illustrated", avatarId: "avatar-14" })).toBe("avatar-14");

    const toPhoto = buildSettingsWithAvatarSelection(start, { mode: "photo" });
    expect(resolveAvatarSelection(toPhoto, WITH_PHOTO)).toEqual({ mode: "photo" });

    const toAutomatic = buildSettingsWithAvatarSelection(toPhoto, { mode: "automatic" });
    expect(resolveAvatarSelection(toAutomatic, WITH_PHOTO)).toEqual({ mode: "automatic" });

    // Nenhum passo intermediário perdeu a escolha ilustrada.
    const backToIllustrated = resolveAvatarSelection(
      { ...toAutomatic, avatar_display_mode: "illustrated" },
      WITHOUT_PHOTO,
    );
    expect(backToIllustrated).toEqual({ mode: "illustrated", avatarId: "avatar-14" });
  });

  it("avatarSelectionKey usa o ID (não a posição) e o modo quando não é ilustração", () => {
    expect(avatarSelectionKey({ mode: "photo" })).toBe("photo");
    expect(avatarSelectionKey({ mode: "automatic" })).toBe("automatic");
    expect(avatarSelectionKey({ mode: "illustrated", avatarId: "avatar-01" })).toBe("avatar-01");
    expect(avatarSelectionKey({ mode: "illustrated", avatarId: "avatar-20" })).toBe("avatar-20");
  });

  it("todo id do registry é aceito (20/20) e existem 20 chaves distintas", () => {
    const keys = new Set<string>();
    for (const avatar of ILLUSTRATED_AVATARS) {
      const next = buildSettingsWithAvatarSelection({}, {
        mode: "illustrated",
        avatarId: avatar.id,
      });
      expect(next[ILLUSTRATED_AVATAR_SETTINGS_KEY]).toBe(avatar.id);
      expect(next[AVATAR_DISPLAY_MODE_SETTINGS_KEY]).toBe("illustrated");
      keys.add(avatarSelectionKey({ mode: "illustrated", avatarId: avatar.id }));
    }
    expect(keys.size).toBe(20);
  });
});

describe("leitura de baixo nível (chave ilustrada)", () => {
  it("sem illustrated_avatar_id → null", () => {
    expect(readIllustratedAvatarId(undefined)).toBeNull();
    expect(readIllustratedAvatarId(null)).toBeNull();
    expect(readIllustratedAvatarId({})).toBeNull();
    expect(readIllustratedAvatarId(SETTINGS_WITH_OTHERS)).toBeNull();
  });

  it("id válido é lido, com trim; id inválido/settings esquisito → null", () => {
    expect(readIllustratedAvatarId({ illustrated_avatar_id: "avatar-14" })).toBe("avatar-14");
    expect(readIllustratedAvatarId({ illustrated_avatar_id: "  avatar-01  " })).toBe("avatar-01");

    for (const raw of ["avatar-99", "avatar-1", "automatic", "", "   ", 14, true, null, {}, []]) {
      expect(readIllustratedAvatarId({ illustrated_avatar_id: raw })).toBeNull();
    }
    expect(readIllustratedAvatarId({ illustrated_avatar_id: "avatar-14" }, [])).toBeNull();
    expect(readIllustratedAvatarId([])).toBeNull();
    expect(readIllustratedAvatarId("settings")).toBeNull();
    expect(readIllustratedAvatarId(42)).toBeNull();
  });

  it("build/read de baixo nível continuam coerentes", () => {
    const next = buildSettingsWithIllustratedAvatar(SETTINGS_WITH_OTHERS, "avatar-07");
    expect(next).toEqual({ ...SETTINGS_WITH_OTHERS, illustrated_avatar_id: "avatar-07" });
    expect(readIllustratedAvatarId(next)).toBe("avatar-07");

    const cleared = buildSettingsWithIllustratedAvatar(next, null);
    expect(cleared).toEqual(SETTINGS_WITH_OTHERS);
    expect(readIllustratedAvatarId(cleared)).toBeNull();

    expect(buildSettingsWithIllustratedAvatar({}, null)).toEqual({});
    expect(buildSettingsWithIllustratedAvatar(undefined, null)).toEqual({});
  });
});

describe("determinismo e pureza do módulo", () => {
  it("nenhum Math.random() (o avatar não pode mudar sozinho)", () => {
    const source = readFileSync(
      resolve(process.cwd(), "src/lib/member-avatar-preference.ts"),
      "utf8",
    );
    // O comentário do módulo cita `Math.random` para dizer que ele NÃO existe —
    // o guard precisa olhar o código, não a prosa.
    const code = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    expect(code).not.toContain("Math.random");
  });

  it("automático é MODO, nunca um id de avatar especial", () => {
    const next = buildSettingsWithAvatarSelection({}, { mode: "automatic" });

    expect(next).toEqual({ avatar_display_mode: "automatic" });
    expect(ILLUSTRATED_AVATAR_SETTINGS_KEY in next).toBe(false);
    expect(Object.values(next)).not.toContain("avatar-automatic");
    // Só os três modos existem — nada de "none"/"nenhum"/"default".
    expect(AVATAR_DISPLAY_MODE_SETTINGS_KEY).toBe("avatar_display_mode");
  });
});
