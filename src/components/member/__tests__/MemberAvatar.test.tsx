/**
 * MemberAvatar — componente oficial de avatar de membro.
 *
 * O Radix `Avatar.Image` só monta o `<img>` depois que a imagem CARREGA; em
 * jsdom isso nunca acontece, então o mock abaixo troca o primitivo por um
 * passthrough que sempre renderiza — é o único jeito honesto de provar que a URL
 * real chega no `<img>` (e de checar o `alt`), em vez de afirmar isso olhando só
 * o código-fonte.
 *
 * Os seletores usam os hooks `data-slot="member-avatar*"` do próprio componente:
 * `@/components/ui/avatar` (o Avatar oficial) não publica data-slot.
 *
 * Estado do registry: biblioteca OFICIAL completa (avatar-01 … avatar-20). Por
 * isso os casos com seed RESOLVEM imagem; os casos de iniciais são os que
 * realmente não têm identidade (sem nome e sem seed).
 *
 * O mock do `Image` também entrega o `onLoadingStatusChange`, que é como o Radix
 * avisa que a foto NÃO carregou. Em jsdom não existe rede, então esse callback é
 * a única forma honesta de provar o caminho "foto quebrada → avatar automático".
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

vi.mock("@radix-ui/react-avatar", async () => {
  const ReactModule = await import("react");
  return {
    Root: ({ children, ...props }: any) =>
      ReactModule.createElement("span", props, children),
    Image: ({ children, onLoadingStatusChange, ...props }: any) => {
      ReactModule.useEffect(() => {
        const forced = (globalThis as any).__avatarImageLoadingStatus;
        if (forced) onLoadingStatusChange?.(forced);
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, []);
      return ReactModule.createElement("img", props);
    },
    Fallback: ({ children, ...props }: any) =>
      ReactModule.createElement("span", props, children),
  };
});

import { MemberAvatar } from "../MemberAvatar";
import {
  ILLUSTRATED_AVATARS,
  getIllustratedAvatarSrc,
  resolveAutomaticIllustratedAvatarId,
} from "@/lib/member-avatars";

/** Srcs oficiais do registry real — sem URL escrita à mão. */
const AVATAR_07_SRC = ILLUSTRATED_AVATARS.find((avatar) => avatar.id === "avatar-07")!.src;
const AVATAR_20_SRC = ILLUSTRATED_AVATARS.find((avatar) => avatar.id === "avatar-20")!.src;

const USER_ID = "user-1b2c3d4e-5f60-4a7b-8c9d-0e1f2a3b4c5d";
/** O que o modo automático MOSTRA para este seed. */
const autoSrc = getIllustratedAvatarSrc(resolveAutomaticIllustratedAvatarId(USER_ID));

/** Faz o próximo `AvatarImage` reportar falha de carregamento. */
function forceImageLoadError() {
  (globalThis as any).__avatarImageLoadingStatus = "error";
}

function clearImageLoadStatus() {
  delete (globalThis as any).__avatarImageLoadingStatus;
}

afterEach(() => {
  clearImageLoadStatus();
  cleanup();
});

const root = () => document.querySelector('[data-slot="member-avatar"]');
const photo = () => document.querySelector('[data-slot="member-avatar-photo"]');
const fallback = () =>
  document.querySelector('[data-slot="member-avatar-fallback"]')?.textContent;

describe("MemberAvatar", () => {
  it("A) avatarUrl válido → imagem real usada", () => {
    render(<MemberAvatar displayName="Ana Ribeiro" avatarUrl="https://cdn/x.png" />);
    const img = screen.getByRole("img");
    expect(img).toHaveAttribute("src", "https://cdn/x.png");
    expect(img).toHaveAttribute("alt", "Ana Ribeiro");
  });

  it("A2) imagem usa object-cover sem alterar o Avatar global", () => {
    render(<MemberAvatar displayName="Ana Ribeiro" avatarUrl="https://cdn/x.png" />);
    expect(screen.getByRole("img").className).toContain("object-cover");
  });

  it("A3) avatarUrl em branco não renderiza imagem quebrada", () => {
    render(<MemberAvatar displayName="Ana Ribeiro" avatarUrl="   " />);
    expect(photo()).toBeNull();
    expect(fallback()).toBe("AR");
  });

  it("B) sem avatarUrl → iniciais", () => {
    render(<MemberAvatar displayName="Ana Ribeiro" />);
    expect(photo()).toBeNull();
    expect(fallback()).toBe("AR");
  });

  it("C) nome completo → no máximo 2 iniciais", () => {
    render(<MemberAvatar displayName="Maria Vitória Souza" />);
    expect(fallback()).toBe("MS");
  });

  it("D) uma palavra → 1 inicial", () => {
    render(<MemberAvatar displayName="Rafael" />);
    expect(fallback()).toBe("R");
  });

  it("E) somente e-mail → vira seed do avatar ilustrado (estável)", () => {
    // Com o registry preenchido (LOTE 1) o e-mail é um seed válido, então a
    // precedência resolve o avatar ilustrado ANTES das iniciais. O fallback de
    // iniciais a partir do e-mail continua coberto em member-identity.
    render(<MemberAvatar email="rafael@email.com" />);
    const src = photo()?.getAttribute("src");
    expect(src).toBeTruthy();
    cleanup();
    render(<MemberAvatar email="  RAFAEL@email.com  " />);
    expect(photo()?.getAttribute("src")).toBe(src);
  });

  it("E2) sem nome e sem seed → iniciais (não adivinha identidade)", () => {
    render(<MemberAvatar />);
    expect(photo()).toBeNull();
    expect(fallback()).toBe("?");
  });

  it("F) sem nada → ?", () => {
    render(<MemberAvatar />);
    expect(fallback()).toBe("?");
  });

  it("G) convite sem profile (memberId + e-mail, user_id null) → iniciais do e-mail", () => {
    render(<MemberAvatar memberId="m-1" userId={null} email="convidado@empresa.com" />);
    expect(fallback()).toBe("C");
  });

  it("H) firstName/lastName sem display_name → iniciais das duas palavras", () => {
    render(<MemberAvatar firstName="João" lastName="Pereira" />);
    expect(fallback()).toBe("JP");
  });

  it("I) nome visível ao lado → decorativo não anuncia nada", () => {
    render(
      <div>
        <MemberAvatar displayName="Ana Ribeiro" avatarUrl="https://cdn/x.png" decorative />
        <span>Ana Ribeiro</span>
      </div>,
    );
    expect(photo()).toHaveAttribute("alt", "");
    expect(root()).toHaveAttribute("aria-hidden", "true");
  });

  it("J) escolha manual (avatar-07) vence o automático", () => {
    render(<MemberAvatar memberId="m-1" displayName="Ana Ribeiro" selectedAvatarId="avatar-07" />);
    expect(photo()?.getAttribute("src")).toBe(AVATAR_07_SRC);
    expect(fallback()).toBe("AR");
  });

  it("J2) avatar-20 (último do registro) resolve normalmente", () => {
    render(<MemberAvatar memberId="m-1" displayName="Ana Ribeiro" selectedAvatarId="avatar-20" />);
    expect(photo()?.getAttribute("src")).toBe(AVATAR_20_SRC);
  });

  it("J3) escolha inexistente e sem seed → iniciais", () => {
    render(<MemberAvatar displayName="Ana Ribeiro" selectedAvatarId="nao-existe" />);
    expect(photo()).toBeNull();
    expect(fallback()).toBe("AR");
  });

  it("K) tamanhos suportados (sm = 32px, sem hardcode em h-10)", () => {
    render(<MemberAvatar displayName="Ana Ribeiro" size="sm" />);
    expect(root()?.className).toContain("h-8");
    expect(root()?.className).toContain("w-8");
  });

  it("L) className externo não perde o tamanho do componente", () => {
    render(<MemberAvatar displayName="Ana Ribeiro" size="lg" className="ring-2" />);
    expect(root()?.className).toContain("ring-2");
    expect(root()?.className).toContain("h-12");
  });

  it("M) precedência: foto real vence o avatar ilustrado", () => {
    render(
      <MemberAvatar
        memberId="m-1"
        displayName="Ana Ribeiro"
        avatarUrl="https://cdn/real.png"
        selectedAvatarId="avatar-07"
      />,
    );
    expect(photo()?.getAttribute("src")).toBe("https://cdn/real.png");
  });

  it("O) modo AUSENTE + foto + escolha → precedência histórica (foto vence)", () => {
    // Chamadas antigas (que não conhecem o modo) não podem mudar de aparência.
    render(
      <MemberAvatar
        userId={USER_ID}
        displayName="Ana Ribeiro"
        avatarUrl="https://cdn/real.png"
        selectedAvatarId="avatar-07"
      />,
    );
    expect(root()?.getAttribute("data-avatar-display-mode")).toBe("photo");
    expect(photo()?.getAttribute("src")).toBe("https://cdn/real.png");
  });

  it("O2) modo AUSENTE sem foto mas com escolha → precedência histórica (ilustração vence)", () => {
    render(
      <MemberAvatar userId={USER_ID} displayName="Ana Ribeiro" selectedAvatarId="avatar-07" />,
    );
    expect(root()?.getAttribute("data-avatar-display-mode")).toBe("illustrated");
    expect(photo()?.getAttribute("src")).toBe(AVATAR_07_SRC);
  });

  it("N) mesmo memberId → mesmo avatar; ids diferentes não colapsam", () => {
    render(<MemberAvatar memberId="m-1" displayName="Ana Ribeiro" />);
    const first = photo()?.getAttribute("src");
    cleanup();
    render(<MemberAvatar memberId="m-1" displayName="Bruno Lima" />);
    expect(photo()?.getAttribute("src")).toBe(first);
    cleanup();

    const srcs = new Set<string | null>();
    for (const id of ["m-1", "m-2", "m-3", "m-4", "m-5", "m-6", "m-7"]) {
      render(<MemberAvatar memberId={id} />);
      srcs.add(photo()?.getAttribute("src") ?? null);
      cleanup();
    }
    expect(srcs.size).toBeGreaterThan(1);
    expect(srcs.has(null)).toBe(false);
  });
});

describe("modo explícito de avatar (photo · automatic · illustrated)", () => {
  it("C) mode photo + avatarUrl → foto", () => {
    render(
      <MemberAvatar
        userId={USER_ID}
        displayName="Ana Ribeiro"
        avatarUrl="https://cdn/real.png"
        avatarDisplayMode="photo"
      />,
    );
    expect(root()?.getAttribute("data-avatar-display-mode")).toBe("photo");
    expect(photo()?.getAttribute("src")).toBe("https://cdn/real.png");
  });

  it("C2) mode photo sem avatarUrl → automático (não fica sem imagem)", () => {
    render(
      <MemberAvatar userId={USER_ID} displayName="Ana Ribeiro" avatarDisplayMode="photo" />,
    );
    expect(photo()?.getAttribute("src")).toBe(autoSrc);
  });

  it("A4) mode photo com foto QUEBRADA → automático, nunca imagem quebrada", () => {
    forceImageLoadError();
    render(
      <MemberAvatar
        userId={USER_ID}
        displayName="Ana Ribeiro"
        avatarUrl="https://cdn/quebrada.png"
        avatarDisplayMode="photo"
      />,
    );

    const src = photo()?.getAttribute("src");
    expect(src).toBe(autoSrc);
    expect(src).not.toBe("https://cdn/quebrada.png");
  });

  it("D) mode automatic + avatarUrl → IGNORA a foto e mostra o avatar do seed", () => {
    render(
      <MemberAvatar
        userId={USER_ID}
        displayName="Ana Ribeiro"
        avatarUrl="https://cdn/real.png"
        avatarDisplayMode="automatic"
        selectedAvatarId="avatar-07"
      />,
    );
    expect(root()?.getAttribute("data-avatar-display-mode")).toBe("automatic");
    expect(photo()?.getAttribute("src")).toBe(autoSrc);
    expect(photo()?.getAttribute("src")).not.toBe("https://cdn/real.png");
    expect(photo()?.getAttribute("src")).not.toBe(AVATAR_07_SRC);
  });

  it("E) mode illustrated + avatar-07 → a escolha, mesmo tendo foto", () => {
    render(
      <MemberAvatar
        userId={USER_ID}
        displayName="Ana Ribeiro"
        avatarUrl="https://cdn/real.png"
        avatarDisplayMode="illustrated"
        selectedAvatarId="avatar-07"
      />,
    );
    expect(root()?.getAttribute("data-avatar-display-mode")).toBe("illustrated");
    expect(photo()?.getAttribute("src")).toBe(AVATAR_07_SRC);
  });

  it("F) mode illustrated com id inválido/ausente → automático", () => {
    for (const selectedAvatarId of [null, "avatar-99", "automatic", ""]) {
      render(
        <MemberAvatar
          userId={USER_ID}
          displayName="Ana Ribeiro"
          avatarUrl="https://cdn/real.png"
          avatarDisplayMode="illustrated"
          selectedAvatarId={selectedAvatarId}
        />,
      );
      expect(root()?.getAttribute("data-avatar-display-mode")).toBe("illustrated");
      expect(photo()?.getAttribute("src")).toBe(autoSrc);
      cleanup();
    }
  });

  it("G) automatic → photo → illustrated: a prévia muda em cada modo, sem refresh", () => {
    const { rerender } = render(
      <MemberAvatar
        userId={USER_ID}
        displayName="Ana Ribeiro"
        avatarUrl="https://cdn/real.png"
        avatarDisplayMode="automatic"
        selectedAvatarId="avatar-14"
      />,
    );
    expect(photo()?.getAttribute("src")).toBe(autoSrc);

    rerender(
      <MemberAvatar
        userId={USER_ID}
        displayName="Ana Ribeiro"
        avatarUrl="https://cdn/real.png"
        avatarDisplayMode="photo"
        selectedAvatarId="avatar-14"
      />,
    );
    expect(photo()?.getAttribute("src")).toBe("https://cdn/real.png");

    rerender(
      <MemberAvatar
        userId={USER_ID}
        displayName="Ana Ribeiro"
        avatarUrl="https://cdn/real.png"
        avatarDisplayMode="illustrated"
        selectedAvatarId="avatar-14"
      />,
    );
    expect(photo()?.getAttribute("src")).toBe(
      ILLUSTRATED_AVATARS.find((avatar) => avatar.id === "avatar-14")!.src,
    );
  });
});
