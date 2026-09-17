/**
 * AvatarPicker — escolha oficial de avatar ("Sua foto" / "Automático" / 20).
 *
 * O mock do Radix `Avatar.Image` é o mesmo do MemberAvatar.test.tsx: em jsdom a
 * imagem nunca "carrega" e o primitivo não monta o `<img>`, então o passthrough é
 * o único jeito honesto de provar qual src entrou nas prévias.
 *
 * A lista de opções NÃO é digitada aqui: o teste lê o registry real
 * (`ILLUSTRATED_AVATARS`). Se alguém escrever um array paralelo na galeria, ou
 * reordenar/renumerar os ids, o teste cai — que é exatamente o que se quer.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { readFileSync } from "fs";
import { resolve } from "path";

vi.mock("@radix-ui/react-avatar", async () => {
  const ReactModule = await import("react");
  return {
    Root: ({ children, ...props }: any) => ReactModule.createElement("span", props, children),
    // `onLoadingStatusChange` não é atributo de DOM: consumido aqui para não
    // vazar como prop desconhecida no <img>.
    Image: ({ children, onLoadingStatusChange, ...props }: any) =>
      ReactModule.createElement("img", props),
    Fallback: ({ children, ...props }: any) => ReactModule.createElement("span", props, children),
  };
});

import {
  AUTOMATIC_AVATAR_OPTION_LABEL,
  AvatarPicker,
  PHOTO_AVATAR_OPTION_LABEL,
  formatIllustratedAvatarNumber,
  formatIllustratedAvatarOptionLabel,
} from "../AvatarPicker";
import type { AvatarSelection } from "@/lib/member-avatar-preference";
import {
  ILLUSTRATED_AVATARS,
  getIllustratedAvatarSrc,
  resolveAutomaticIllustratedAvatarId,
} from "@/lib/member-avatars";

const USER_ID = "user-1b2c3d4e-5f60-4a7b-8c9d-0e1f2a3b4c5d";
const IDENTITY = { userId: USER_ID, displayName: "Ana Ribeiro" };

afterEach(cleanup);

const options = () =>
  Array.from(document.querySelectorAll('[data-slot="avatar-option"], [data-slot="avatar-special-option"]'));
const option = (id: string) =>
  document.querySelector(
    `[data-slot="avatar-option"][data-avatar-id="${id}"], [data-slot="avatar-special-option"][data-avatar-id="${id}"]`,
  );
const selected = () => options().filter((el) => el.getAttribute("data-selected") === "true");
const automaticSrc = () =>
  getIllustratedAvatarSrc(resolveAutomaticIllustratedAvatarId(USER_ID)) as string;

const SELECTED_VALUES = (selection: AvatarSelection) =>
  selected().map((el) => el.getAttribute("data-avatar-id"));

describe("H) as opções vêm do registry oficial", () => {
  it("20 ilustrados, na ordem do registry e com os mesmos srcs", () => {
    render(<AvatarPicker selection={{ mode: "automatic" }} identity={IDENTITY} onSelect={() => {}} />);

    const illustrated = Array.from(
      document.querySelectorAll('[data-slot="avatar-option"]'),
    );
    expect(illustrated).toHaveLength(ILLUSTRATED_AVATARS.length);

    ILLUSTRATED_AVATARS.forEach((avatar, index) => {
      expect(illustrated[index].getAttribute("data-avatar-id")).toBe(avatar.id);
      expect(illustrated[index].querySelector("img")?.getAttribute("src")).toBe(avatar.src);
    });
  });

  it("os ids internos não aparecem como texto para o usuário", () => {
    render(<AvatarPicker selection={{ mode: "automatic" }} identity={IDENTITY} onSelect={() => {}} />);

    expect(screen.queryByText("avatar-07")).toBeNull();
    expect(screen.getByText("Automático")).toBeInTheDocument();
    expect(screen.getByText("Usar como avatar")).toBeInTheDocument();
    expect(screen.getByText("Escolha uma ilustração")).toBeInTheDocument();
  });

  it("os dois blocos têm rótulo acessível", () => {
    render(<AvatarPicker selection={{ mode: "automatic" }} identity={IDENTITY} onSelect={() => {}} />);

    expect(screen.getByRole("group", { name: "Usar como avatar" })).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Escolha uma ilustração" })).toBeInTheDocument();
  });

  it("a prévia do Automático é EXATAMENTE o avatar que o seed resolve", () => {
    render(<AvatarPicker selection={{ mode: "automatic" }} identity={IDENTITY} onSelect={() => {}} />);

    const img = option("automatic")?.querySelector("img");
    expect(img?.getAttribute("src")).toBe(automaticSrc());
    // A prévia vem do MemberAvatar oficial, não de um <img> paralelo.
    expect(option("automatic")?.querySelector('[data-slot="member-avatar"]')).not.toBeNull();
  });
});

describe("'Sua foto' só existe para quem tem foto", () => {
  it("sem avatarUrl → a opção não é renderizada (nem como placeholder)", () => {
    render(
      <AvatarPicker
        selection={{ mode: "automatic" }}
        identity={IDENTITY}
        hasPhoto={false}
        photoUrl={null}
        onSelect={() => {}}
      />,
    );

    expect(option("photo")).toBeNull();
    expect(screen.queryByRole("button", { name: PHOTO_AVATAR_OPTION_LABEL })).toBeNull();
  });

  it("com avatarUrl → a opção aparece com a prévia da foto", () => {
    render(
      <AvatarPicker
        selection={{ mode: "photo" }}
        identity={IDENTITY}
        hasPhoto
        photoUrl="https://cdn/real.png"
        onSelect={() => {}}
      />,
    );

    const button = screen.getByRole("button", { name: PHOTO_AVATAR_OPTION_LABEL });
    expect(button).toHaveAttribute("aria-pressed", "true");
    expect(option("photo")?.querySelector("img")?.getAttribute("src")).toBe("https://cdn/real.png");
  });
});

describe("seleção e acessibilidade", () => {
  it("A) modo automático → Automático selecionado, e só ele", () => {
    render(<AvatarPicker selection={{ mode: "automatic" }} identity={IDENTITY} hasPhoto onSelect={() => {}} />);

    expect(SELECTED_VALUES({ mode: "automatic" })).toEqual(["automatic"]);
    expect(screen.getByRole("button", { name: AUTOMATIC_AVATAR_OPTION_LABEL })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("B) modo ilustrado → só aquele avatar fica ativo", () => {
    render(
      <AvatarPicker
        selection={{ mode: "illustrated", avatarId: "avatar-14" }}
        identity={IDENTITY}
        hasPhoto
        onSelect={() => {}}
      />,
    );

    expect(SELECTED_VALUES({ mode: "illustrated", avatarId: "avatar-14" })).toEqual(["avatar-14"]);
    expect(screen.getByRole("button", { name: "Selecionar avatar 14" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: AUTOMATIC_AVATAR_OPTION_LABEL })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    expect(screen.getByRole("button", { name: PHOTO_AVATAR_OPTION_LABEL })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });

  it("C) ilustrado com id inexistente → cai no Automático (nunca fica sem seleção)", () => {
    render(
      <AvatarPicker
        selection={{ mode: "illustrated", avatarId: "avatar-99" }}
        identity={IDENTITY}
        onSelect={() => {}}
      />,
    );

    expect(SELECTED_VALUES({ mode: "automatic" })).toEqual(["automatic"]);
  });

  it("nunca dois itens ativos ao mesmo tempo", () => {
    for (const selection of [
      { mode: "photo" } as AvatarSelection,
      { mode: "automatic" } as AvatarSelection,
      { mode: "illustrated", avatarId: "avatar-03" } as AvatarSelection,
    ]) {
      render(<AvatarPicker selection={selection} identity={IDENTITY} hasPhoto onSelect={() => {}} />);
      expect(selected()).toHaveLength(1);
      cleanup();
    }
  });

  it("a seleção não depende só de cor: há check visível", () => {
    render(
      <AvatarPicker
        selection={{ mode: "illustrated", avatarId: "avatar-03" }}
        identity={IDENTITY}
        hasPhoto
        onSelect={() => {}}
      />,
    );

    expect(
      option("avatar-03")?.querySelector('[data-slot="avatar-option-check"]'),
    ).not.toBeNull();
    expect(option("avatar-04")?.querySelector('[data-slot="avatar-option-check"]')).toBeNull();
    expect(option("photo")?.querySelector('[data-slot="avatar-option-check"]')).toBeNull();
  });

  it("rótulos acessíveis: foto, automático e 'Selecionar avatar N'", () => {
    render(<AvatarPicker selection={{ mode: "automatic" }} identity={IDENTITY} hasPhoto onSelect={() => {}} />);

    expect(screen.getByRole("button", { name: PHOTO_AVATAR_OPTION_LABEL })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: AUTOMATIC_AVATAR_OPTION_LABEL })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Selecionar avatar 1" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Selecionar avatar 20" })).toBeInTheDocument();

    // O número do rótulo vem do ID (não da posição): reordenar não renomeia.
    expect(formatIllustratedAvatarNumber("avatar-07")).toBe("7");
    expect(formatIllustratedAvatarNumber("avatar-20")).toBe("20");
    expect(formatIllustratedAvatarOptionLabel("avatar-12")).toBe("Selecionar avatar 12");
  });
});

describe("interação", () => {
  it("D) clicar em avatar-07 → onSelect({ mode: 'illustrated', avatarId: 'avatar-07' })", async () => {
    const onSelect = vi.fn();
    render(<AvatarPicker selection={{ mode: "automatic" }} identity={IDENTITY} onSelect={onSelect} />);

    await userEvent.click(screen.getByRole("button", { name: "Selecionar avatar 7" }));
    expect(onSelect).toHaveBeenCalledWith({ mode: "illustrated", avatarId: "avatar-07" });
  });

  it("F) clicar em Automático → onSelect({ mode: 'automatic' })", async () => {
    const onSelect = vi.fn();
    render(
      <AvatarPicker
        selection={{ mode: "illustrated", avatarId: "avatar-07" }}
        identity={IDENTITY}
        onSelect={onSelect}
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: AUTOMATIC_AVATAR_OPTION_LABEL }));
    expect(onSelect).toHaveBeenCalledWith({ mode: "automatic" });
  });

  it("clicar em 'Sua foto' → onSelect({ mode: 'photo' })", async () => {
    const onSelect = vi.fn();
    render(
      <AvatarPicker
        selection={{ mode: "automatic" }}
        identity={IDENTITY}
        hasPhoto
        photoUrl="https://cdn/real.png"
        onSelect={onSelect}
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: PHOTO_AVATAR_OPTION_LABEL }));
    expect(onSelect).toHaveBeenCalledWith({ mode: "photo" });
  });

  it("teclado: foco + Enter seleciona", async () => {
    const onSelect = vi.fn();
    render(<AvatarPicker selection={{ mode: "automatic" }} identity={IDENTITY} onSelect={onSelect} />);

    const button = screen.getByRole("button", { name: "Selecionar avatar 5" });
    button.focus();
    expect(button).toHaveFocus();

    await userEvent.keyboard("{Enter}");
    expect(onSelect).toHaveBeenCalledWith({ mode: "illustrated", avatarId: "avatar-05" });
  });

  it("disabled (salvamento em voo) trava a galeria inteira", async () => {
    const onSelect = vi.fn();
    render(
      <AvatarPicker
        selection={{ mode: "automatic" }}
        identity={IDENTITY}
        hasPhoto
        disabled
        onSelect={onSelect}
      />,
    );

    for (const name of ["Selecionar avatar 7", AUTOMATIC_AVATAR_OPTION_LABEL, PHOTO_AVATAR_OPTION_LABEL]) {
      const button = screen.getByRole("button", { name });
      expect(button).toBeDisabled();
      await userEvent.click(button);
    }
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("pending mostra o spinner só na opção que está salvando", () => {
    render(
      <AvatarPicker
        selection={{ mode: "illustrated", avatarId: "avatar-05" }}
        identity={IDENTITY}
        hasPhoto
        pending
        pendingKey="avatar-05"
        onSelect={() => {}}
      />,
    );

    expect(
      option("avatar-05")?.querySelector('[data-slot="avatar-option-loading"]'),
    ).not.toBeNull();
    expect(option("avatar-06")?.querySelector('[data-slot="avatar-option-loading"]')).toBeNull();
    expect(option("automatic")?.querySelector('[data-slot="avatar-option-loading"]')).toBeNull();
    expect(option("photo")?.querySelector('[data-slot="avatar-option-loading"]')).toBeNull();
  });
});

describe("microinteração e determinismo", () => {
  it("usa a classe de microinteração (hover em ponteiro fino, reduced-motion)", () => {
    render(<AvatarPicker selection={{ mode: "automatic" }} identity={IDENTITY} hasPhoto onSelect={() => {}} />);
    expect(option("automatic")?.className).toContain("ti-avatar-option");
    expect(option("automatic")?.className).toContain("ti-avatar-special");
    expect(option("avatar-01")?.className).toContain("ti-avatar-option");
  });

  it("nenhum Math.random() na galeria, no hook nem na preferência", () => {
    for (const file of [
      "src/components/member/AvatarPicker.tsx",
      "src/hooks/useOptimisticAvatarSelection.ts",
      "src/lib/member-avatar-preference.ts",
    ]) {
      const code = readFileSync(resolve(process.cwd(), file), "utf8")
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/\/\/.*$/gm, "");
      expect(code).not.toContain("Math.random");
    }
  });

  it("o CSS do hover só escala em ponteiro fino e respeita reduced motion", () => {
    const source = readFileSync(
      resolve(process.cwd(), "src/components/member/member-avatar-picker.css"),
      "utf8",
    );
    // As regras, sem a prosa: o comentário do arquivo CITA `transition: none`
    // justamente para dizer que ele não é usado.
    const css = source.replace(/\/\*[\s\S]*?\*\//g, "");

    expect(css).toContain("@media (hover: hover) and (pointer: fine)");
    expect(css).toContain("@media (prefers-reduced-motion: reduce)");
    // Reduced motion reduz o movimento — nunca vira `transition: none` (defeito
    // do "corte" corrigido no painel).
    expect(css).not.toMatch(/transition:\s*none/);
    expect(css).toContain("scale(1.04)");
    expect(css).toContain("scale(1.01)");
    // O card especial usa amplitude menor que o círculo.
    expect(css).toContain(".ti-avatar-special:hover");
  });
});
