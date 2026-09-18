import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Rodada "settings-layout-scale": refinamento VISUAL da sidebar desktop e da
 * rota /configuracoes. Asserções estruturais sobre o fonte (mesmo padrão dos
 * testes de migration que leem arquivos) — sem testes frágeis de pixel.
 */

const layout = readFileSync(
  resolve(__dirname, "../../components/DashboardLayout.tsx"),
  "utf8",
);
const settings = readFileSync(
  resolve(__dirname, "../../routes/configuracoes.tsx"),
  "utf8",
);

describe("Sidebar — escala desktop (DashboardLayout)", () => {
  it("expande para 264px no desktop (aside + container fixo)", () => {
    expect(layout).toContain('? "w-[264px]"');
    expect(layout).toContain(': "w-[264px]"');
  });

  it("preserva rail recolhido de 60px e mobile de 288px (com max-w-85vw)", () => {
    expect(layout).toContain(': "w-[60px]")');
    expect(layout).toContain("w-[288px] max-w-[85vw]");
    expect(layout).toContain('? "w-[288px]"');
  });

  it("linha de navegação em h-9 / px-2 / gap-3 / text-14px e glifo 20px", () => {
    expect(layout).toContain(
      "group relative flex h-9 w-full items-center gap-3 rounded-md px-2 text-[14px]",
    );
    expect(layout).toContain('glyph: "w-5 h-5"');
  });

  it("perfil no topo: nome 14px e e-mail 12px", () => {
    expect(layout).toContain(
      '<span className="block truncate text-[14px] font-semibold text-neutral-800">',
    );
    expect(layout).toContain(
      '<span className="block truncate text-[12px] leading-4 text-neutral-400">',
    );
  });

  it("geometria da árvore de recentes recalibrada para a coluna óptica de 32px", () => {
    expect(layout).toContain("pl-[52px]");
    expect(layout).not.toContain("pl-[42px]");
  });
});

describe("/configuracoes — apresentação ampliada", () => {
  it("container max-w-4xl centralizado com respiro lateral progressivo", () => {
    expect(settings).toContain('className="max-w-4xl mx-auto"');
    expect(settings).toContain("px-6 lg:px-10 xl:px-12 py-10");
    expect(settings).not.toContain("max-w-2xl");
  });

  it("título 3xl e abas text-[15px] com gap-8", () => {
    expect(settings).toContain('className="text-3xl font-bold"');
    expect(settings).toContain("flex gap-8 text-[15px]");
  });

  it("inputs px-4 py-2.5 text-[15px] e botão primário px-5 py-2.5", () => {
    expect(settings).toContain(
      "rounded-md px-4 py-2.5 text-[15px] focus:outline-none",
    );
    expect(settings).toContain("text-[15px] font-medium px-5 py-2.5 rounded-md");
  });

  it("foto 72px (w-18 h-18) e seções consistentes em text-lg", () => {
    expect(settings).toContain("w-18 h-18 rounded-full");
    expect(settings).not.toContain('<h2 className="font-semibold">');
    expect((settings.match(/font-semibold text-lg/g) ?? []).length).toBeGreaterThanOrEqual(7);
  });
});
