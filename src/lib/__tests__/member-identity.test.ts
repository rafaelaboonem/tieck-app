/**
 * Identidade de membro — helper oficial (`@/lib/member-identity`).
 *
 * Cobre a cadeia de nome (§9), as regras de iniciais (§10) e o índice
 * determinístico do avatar automático (§8). Nada aqui depende de React, banco
 * ou rede: é texto → texto.
 */
import { describe, expect, it } from "vitest";

import {
  MEMBER_INITIALS_FALLBACK,
  MEMBER_NAME_FALLBACK,
  getInitials,
  getMemberDisplayName,
  getMemberInitials,
  getMemberNameSource,
  getStableAvatarIndex,
  resolveAvatarSeed,
} from "../member-identity";

// ───────────────────────────── §9 cadeia de nome ────────────────────────────

describe("getMemberNameSource / getMemberDisplayName (§9)", () => {
  it("display_name vence tudo", () => {
    expect(
      getMemberNameSource({
        displayName: "Ana Ribeiro",
        firstName: "Ana",
        lastName: "Ribeiro",
        email: "ana@x.com",
      }),
    ).toBe("Ana Ribeiro");
  });

  it("sem display_name → first + last", () => {
    expect(getMemberNameSource({ firstName: "Ana", lastName: "Ribeiro" })).toBe("Ana Ribeiro");
  });

  it("só first_name é utilizável", () => {
    expect(getMemberNameSource({ firstName: "Ana" })).toBe("Ana");
  });

  it("sem nomes → e-mail normalizado", () => {
    expect(getMemberNameSource({ email: "ana@x.com" })).toBe("ana@x.com");
  });

  it("espaços em branco não contam como nome", () => {
    expect(getMemberNameSource({ displayName: "   ", firstName: " " })).toBeNull();
  });

  it("sem nada utilizável → MEMBER_NAME_FALLBACK (nunca vazio)", () => {
    expect(getMemberNameSource(null)).toBeNull();
    expect(getMemberDisplayName(null)).toBe(MEMBER_NAME_FALLBACK);
    expect(getMemberDisplayName({})).toBe(MEMBER_NAME_FALLBACK);
    expect(getMemberDisplayName({ displayName: "  " })).toBe(MEMBER_NAME_FALLBACK);
  });

  it("os quatro estados do contrato resolvem nome", () => {
    // A) usuário completo · B) member sem profile · C) convite sem user_id · D) histórico
    expect(getMemberDisplayName({ userId: "u1", displayName: "Ana Ribeiro" })).toBe("Ana Ribeiro");
    expect(getMemberDisplayName({ memberId: "m1", email: "ana@x.com" })).toBe("ana@x.com");
    expect(getMemberDisplayName({ memberId: "m1", userId: null, email: "convidado@x.com" })).toBe(
      "convidado@x.com",
    );
    expect(getMemberDisplayName({ firstName: "Ana" })).toBe("Ana");
  });
});

// ───────────────────────────── §10 iniciais ────────────────────────────────

describe("getInitials (§10)", () => {
  it("João Pereira → JP", () => {
    expect(getInitials("João Pereira")).toBe("JP");
  });

  it("Maria Vitória Souza → MS (máximo 2, primeira + última palavra)", () => {
    expect(getInitials("Maria Vitória Souza")).toBe("MS");
  });

  it("uma única palavra → 1 inicial", () => {
    expect(getInitials("Rafael")).toBe("R");
  });

  it("espaços extras são ignorados", () => {
    expect(getInitials("  Ana   Ribeiro  ")).toBe("AR");
  });

  it("e-mail sem nome → primeira letra do endereço", () => {
    expect(getInitials("rafael@email.com")).toBe("R");
    expect(getInitials("ana.beatriz@x.com")).toBe("A");
  });

  it("acentos são preservados", () => {
    expect(getInitials("Ávila Nunes")).toBe("ÁN");
    expect(getInitials("ícaro")).toBe("Í");
  });

  it("vazio / null / undefined → ?", () => {
    expect(getInitials("")).toBe(MEMBER_INITIALS_FALLBACK);
    expect(getInitials("   ")).toBe(MEMBER_INITIALS_FALLBACK);
    expect(getInitials(null)).toBe(MEMBER_INITIALS_FALLBACK);
    expect(getInitials(undefined)).toBe(MEMBER_INITIALS_FALLBACK);
  });

  it("nunca passa de 2 caracteres", () => {
    for (const name of ["Ana", "Ana Ribeiro", "Maria Vitória Souza", "José da Silva Neto"]) {
      expect([...getInitials(name)].length).toBeLessThanOrEqual(2);
    }
  });

  it("getMemberInitials usa a mesma cadeia do nome", () => {
    expect(getMemberInitials({ displayName: "João Pereira" })).toBe("JP");
    expect(getMemberInitials({ firstName: "Ana" })).toBe("A");
    expect(getMemberInitials({ email: "rafael@email.com" })).toBe("R");
    expect(getMemberInitials({})).toBe(MEMBER_INITIALS_FALLBACK);
  });
});

// ─────────────────────── §7 seed estável do avatar ─────────────────────────

describe("resolveAvatarSeed (§7)", () => {
  it("userId vence memberId, que vence e-mail", () => {
    expect(resolveAvatarSeed({ userId: "u1", memberId: "m1", email: "a@x.com" })).toBe("u1");
    expect(resolveAvatarSeed({ userId: null, memberId: "m1", email: "a@x.com" })).toBe("m1");
    expect(resolveAvatarSeed({ email: "a@x.com" })).toBe("a@x.com");
  });

  it("e-mail é normalizado (mesmo seed em maiúsculas/espaços)", () => {
    expect(resolveAvatarSeed({ email: "  Ana@X.com " })).toBe("ana@x.com");
    expect(resolveAvatarSeed({ email: "ana@x.com" })).toBe("ana@x.com");
  });

  it("sem identidade estável → null (não sorteia avatar)", () => {
    expect(resolveAvatarSeed({})).toBeNull();
    expect(resolveAvatarSeed(null)).toBeNull();
  });
});

// ─────────────────── §8/§20 índice determinístico ───────────────────────────

describe("getStableAvatarIndex (§8/§20)", () => {
  const seeds = [
    "9f1c0f4e-1f2a-4d3b-8c5a-0a1b2c3d4e5f",
    "1b2c3d4e-5f60-4a7b-8c9d-0e1f2a3b4c5d",
    "ana@x.com",
    "bruno.lima@empresa.com.br",
    "member-1",
    "member-2",
    "member-3",
    "membro-sem-user-id",
  ];

  it("mesmo seed → mesmo índice (refresh, unidade e dispositivo não mudam)", () => {
    for (const seed of seeds) {
      expect(getStableAvatarIndex(seed, 17)).toBe(getStableAvatarIndex(seed, 17));
    }
  });

  it("total 17 → sempre 0..16", () => {
    for (const seed of seeds) {
      const index = getStableAvatarIndex(seed, 17);
      expect(Number.isInteger(index)).toBe(true);
      expect(index).toBeGreaterThanOrEqual(0);
      expect(index).toBeLessThan(17);
    }
  });

  it("seeds diferentes não caem todos no mesmo índice", () => {
    const distinct = new Set(seeds.map((s) => getStableAvatarIndex(s, 17)));
    expect(distinct.size).toBeGreaterThan(1);
  });

  it("total inválido é tratado com segurança → 0", () => {
    for (const total of [0, -3, NaN, Infinity, -Infinity]) {
      expect(getStableAvatarIndex("u1", total)).toBe(0);
    }
  });

  it("sem seed → 0, nunca NaN", () => {
    for (const seed of [null, undefined, "", "   "]) {
      expect(getStableAvatarIndex(seed, 17)).toBe(0);
    }
  });
});
