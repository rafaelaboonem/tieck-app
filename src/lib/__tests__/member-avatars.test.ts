/**
 * Avatares ilustrados — biblioteca OFICIAL completa (`@/lib/member-avatars`).
 *
 * Estado real do repositório: 20 entradas (avatar-01 … avatar-20), o lote final.
 * As invariantes que valem para qualquer tamanho (índice, reordenação, entradas
 * novas) usam registries sintéticos injetados, e o caso "registry vazio" continua
 * provado com `[]` — que é o estado de um registry antes de receber assets.
 *
 * Os assets são servidos em WebP 256×256 — único formato no diretório desde a
 * limpeza final (os PNGs 1254² originais foram removidos; os WebPs são os mesmos
 * arquivos aprovados, byte a byte).
 */
import { readFileSync, readdirSync } from "fs";
import { resolve } from "path";
import { describe, expect, it } from "vitest";

import {
  ILLUSTRATED_AVATARS,
  findIllustratedAvatar,
  formatIllustratedAvatarId,
  getIllustratedAvatarCount,
  getIllustratedAvatarSrc,
  isIllustratedAvatarId,
  isIllustratedAvatarIdFormat,
  resolveAutomaticIllustratedAvatarId,
  resolveIllustratedAvatarSrc,
  type IllustratedAvatar,
} from "../member-avatars";
import { getStableAvatarIndex } from "../member-identity";

/** Registry sintético de N entradas, com ids explícitos como o real. */
function buildRegistry(total: number): IllustratedAvatar[] {
  return Array.from({ length: total }, (_, index) => ({
    id: formatIllustratedAvatarId(index),
    src: `/avatars/${formatIllustratedAvatarId(index)}.webp`,
  }));
}

const EMPTY_REGISTRY: IllustratedAvatar[] = [];
const REAL_IDS = ILLUSTRATED_AVATARS.map((avatar) => avatar.id);
const ALL_TWENTY_IDS = Array.from({ length: 20 }, (_, i) => formatIllustratedAvatarId(i));

const SEEDS = [
  "9f1c0f4e-1f2a-4d3b-8c5a-0a1b2c3d4e5f",
  "1b2c3d4e-5f60-4a7b-8c9d-0e1f2a3b4c5d",
  "ana@x.com",
  "bruno.lima@empresa.com.br",
  "member-1",
  "member-2",
  "membro-sem-user-id",
];

// ─────────────── A–F) a biblioteca real, completa ───────────────────────────

describe("A–F) registry real com as 20 entradas", () => {
  it("A) registry.length === 20", () => {
    expect(ILLUSTRATED_AVATARS).toHaveLength(20);
  });

  it("B) avatar-01 … avatar-20 estão todos presentes, na ordem definitiva", () => {
    expect(REAL_IDS).toEqual(ALL_TWENTY_IDS);
    for (const id of ALL_TWENTY_IDS) {
      expect(findIllustratedAvatar(id)?.id).toBe(id);
    }
  });

  it("C) os IDs são únicos", () => {
    expect(new Set(REAL_IDS).size).toBe(20);
  });

  it("D) todo src está definido e não vazio", () => {
    for (const avatar of ILLUSTRATED_AVATARS) {
      expect(typeof avatar.src).toBe("string");
      expect(avatar.src.length).toBeGreaterThan(0);
    }
  });

  it("E) nenhum src duplicado por acidente", () => {
    const srcs = ILLUSTRATED_AVATARS.map((avatar) => avatar.src);
    expect(new Set(srcs).size).toBe(20);
  });

  it("F) getIllustratedAvatarCount === 20, sem constante manual", () => {
    expect(getIllustratedAvatarCount()).toBe(20);
    expect(getIllustratedAvatarCount()).toBe(ILLUSTRATED_AVATARS.length);
    const source = readFileSync(resolve(process.cwd(), "src/lib/member-avatars.ts"), "utf8");
    expect(source).not.toMatch(/VARIANT_COUNT\s*=/);
  });

  it("cada id resolve exatamente o asset do próprio arquivo", () => {
    for (const avatar of ILLUSTRATED_AVATARS) {
      expect(getIllustratedAvatarSrc(avatar.id)).toBe(avatar.src);
      // O src tem de apontar para o ARQUIVO do próprio id — nunca o de outro.
      const fileId = new RegExp(/avatar-(\d{2})[.-]/).exec(avatar.src)?.[1];
      expect(fileId).toBe(avatar.id.slice(-2));
    }
  });

  it("20 arquivos físicos = 20 imports = 20 entradas, sem órfãos", () => {
    const dir = resolve(process.cwd(), "src/assets/member-avatars");
    const onDisk = readdirSync(dir);

    // O WebP é o ÚNICO formato da biblioteca: é este conjunto que tem de ser
    // exatamente os 20 ids, sem sobra e sem falta.
    const webp = onDisk.filter((name) => name.endsWith(".webp")).sort();
    expect(webp).toEqual(ALL_TWENTY_IDS.map((id) => `${id}.webp`));

    // Limpeza final: nada além dos 20 WebPs (nenhum PNG de rollback, nenhum
    // arquivo órfão de outro formato, nenhum candidato de otimização esquecido).
    expect(onDisk).toHaveLength(20);
    const strays = onDisk.filter((name) => !name.endsWith(".webp"));
    expect(strays).toEqual([]);

    for (const avatar of ILLUSTRATED_AVATARS) {
      expect(avatar.src.endsWith(`avatar-${avatar.id.slice(-2)}.webp`)).toBe(true);
    }
  });
});

// ───────────────── G–I) escolha manual e ID inválido ────────────────────────

describe("G–I) seleção manual por ID", () => {
  it("G) findIllustratedAvatar('avatar-14') → avatar-14", () => {
    const fourteenth = findIllustratedAvatar("avatar-14");
    expect(fourteenth?.id).toBe("avatar-14");
    expect(resolveIllustratedAvatarSrc({ selectedAvatarId: "avatar-14" })).toBe(fourteenth?.src);
  });

  it("G2) a escolha manual vale para qualquer id, inclusive das pontas", () => {
    for (const id of ["avatar-01", "avatar-03", "avatar-14", "avatar-20"]) {
      expect(resolveIllustratedAvatarSrc({ selectedAvatarId: id })).toBe(
        findIllustratedAvatar(id)?.src,
      );
    }
  });

  it("H) selectedAvatarId vence o automático", () => {
    for (const seed of SEEDS) {
      const automatic = resolveAutomaticIllustratedAvatarId(seed);
      const manual = "avatar-14";
      expect(resolveIllustratedAvatarSrc({ selectedAvatarId: manual, seed })).toBe(
        findIllustratedAvatar(manual)?.src,
      );
      // Só compara com o automático quando eles realmente diferem.
      if (automatic !== manual) {
        expect(resolveIllustratedAvatarSrc({ selectedAvatarId: manual, seed })).not.toBe(
          findIllustratedAvatar(automatic!)?.src,
        );
      }
    }
  });

  it("I) id selecionado inválido cai no automático (nunca imagem quebrada)", () => {
    for (const invalid of ["avatar-99", "avatar-1", "foto.png", ""]) {
      const resolved = resolveIllustratedAvatarSrc({ selectedAvatarId: invalid, seed: "member-1" });
      expect(resolved).toBe(resolveIllustratedAvatarSrc({ seed: "member-1" }));
      expect(resolved).not.toBeNull();
    }
    // E sem seed não há automático: volta para as iniciais (null), não para quebrado.
    expect(resolveIllustratedAvatarSrc({ selectedAvatarId: "avatar-99" })).toBeNull();
  });
});

// ─────────────── J–L) determinismo, faixa e ausência de seed ────────────────

describe("J–L) avatar automático definitivo", () => {
  it("J) mesmo seed → mesmo ID, sempre", () => {
    for (const seed of SEEDS) {
      const first = resolveAutomaticIllustratedAvatarId(seed);
      expect(first).not.toBeNull();
      expect(resolveAutomaticIllustratedAvatarId(seed)).toBe(first);
      expect(resolveAutomaticIllustratedAvatarId(seed)).toBe(first);
    }
  });

  it("K) índice automático sempre em 0 <= index < 20", () => {
    for (const seed of SEEDS) {
      const index = getStableAvatarIndex(seed, 20);
      expect(Number.isInteger(index)).toBe(true);
      expect(index).toBeGreaterThanOrEqual(0);
      expect(index).toBeLessThan(20);
      expect(resolveAutomaticIllustratedAvatarId(seed)).toBe(ILLUSTRATED_AVATARS[index].id);
    }

    // A mesma faixa vale para registries de outros tamanhos.
    for (const registry of [buildRegistry(1), buildRegistry(3), buildRegistry(17), buildRegistry(30)]) {
      for (const seed of SEEDS) {
        const index = getStableAvatarIndex(seed, registry.length);
        expect(index).toBeGreaterThanOrEqual(0);
        expect(index).toBeLessThan(registry.length);
        expect(resolveAutomaticIllustratedAvatarId(seed, registry)).toBe(registry[index].id);
      }
    }
  });

  it("L) sem seed → null (a precedência cai nas iniciais)", () => {
    for (const seed of [null, undefined, "", "   "]) {
      expect(resolveAutomaticIllustratedAvatarId(seed)).toBeNull();
      expect(resolveIllustratedAvatarSrc({ seed })).toBeNull();
    }
    expect(resolveIllustratedAvatarSrc({})).toBeNull();
  });
});

// ─────────────── M) registry vazio continua suportado ───────────────────────

describe("M) registry vazio (helpers injetáveis)", () => {
  it("nenhum id é válido e nada resolve", () => {
    expect(getIllustratedAvatarCount(EMPTY_REGISTRY)).toBe(0);
    expect(isIllustratedAvatarId("avatar-01", EMPTY_REGISTRY)).toBe(false);
    expect(findIllustratedAvatar("avatar-01", EMPTY_REGISTRY)).toBeNull();
    expect(getIllustratedAvatarSrc("avatar-01", EMPTY_REGISTRY)).toBeNull();
    expect(resolveAutomaticIllustratedAvatarId("user-1", EMPTY_REGISTRY)).toBeNull();
    expect(
      resolveIllustratedAvatarSrc({ selectedAvatarId: "avatar-01", seed: "user-1" }, EMPTY_REGISTRY),
    ).toBeNull();
  });
});

// ─────────────── invariantes de identidade que não podem regredir ───────────

describe("a escolha manual nunca depende da posição", () => {
  it("entradas novas não mexem em avatar-14", () => {
    expect(resolveIllustratedAvatarSrc({ selectedAvatarId: "avatar-14" }, buildRegistry(30))).toBe(
      "/avatars/avatar-14.webp",
    );
  });

  it("reordenar a galeria mantendo os IDs não troca a escolha", () => {
    const shuffled = [...buildRegistry(20)].reverse();
    expect(shuffled[0].id).toBe("avatar-20");
    expect(resolveIllustratedAvatarSrc({ selectedAvatarId: "avatar-14" }, shuffled)).toBe(
      "/avatars/avatar-14.webp",
    );
  });

  it("o formato aceita dois dígitos ou mais, sem teto", () => {
    expect(isIllustratedAvatarIdFormat("avatar-01")).toBe(true);
    expect(isIllustratedAvatarIdFormat("avatar-20")).toBe(true);
    expect(isIllustratedAvatarIdFormat("avatar-120")).toBe(true);
    expect(isIllustratedAvatarIdFormat("avatar-1")).toBe(false);
    expect(isIllustratedAvatarIdFormat(null)).toBe(false);
  });

  it("formatIllustratedAvatarId gera os 20 ids oficiais", () => {
    expect(ALL_TWENTY_IDS[0]).toBe("avatar-01");
    expect(ALL_TWENTY_IDS[19]).toBe("avatar-20");
  });
});

// ─────────────── N) nada de aleatoriedade no código ────────────────────────

describe("N) seleção determinística", () => {
  it("nenhum uso de Math.random() na infraestrutura de avatar", () => {
    for (const file of ["src/lib/member-avatars.ts", "src/lib/member-identity.ts"]) {
      const source = readFileSync(resolve(process.cwd(), file), "utf8");
      // Os comentários CITAM Math.random() para dizer que ele não é usado — o
      // guard precisa olhar o código, não a prosa.
      const code = source
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/\/\/.*$/gm, "");
      expect(code).not.toContain("Math.random");
    }
  });

  it("os 20 assets vêm por import estático (sem base64/CDN/Supabase)", () => {
    const source = readFileSync(resolve(process.cwd(), "src/lib/member-avatars.ts"), "utf8");
    for (const id of ["01", "12", "13", "20"]) {
      expect(source).toContain(`from "@/assets/member-avatars/avatar-${id}.webp"`);
    }
    // O guard olha o CÓDIGO: os comentários justamente dizem que isso NÃO é usado.
    const code = source
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/.*$/gm, "");
    expect(code).not.toContain("data:image");
    expect(code).not.toContain("base64");
    expect(code).not.toContain("supabase");
    expect(code).not.toContain("http");
  });


});
