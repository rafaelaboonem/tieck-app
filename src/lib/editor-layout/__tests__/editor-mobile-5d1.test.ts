import { describe, it, expect } from 'vitest';
import {
  MOBILE_BREAKPOINT,
  isNarrowViewport,
  clampMenuPosition,
  slashMenuSize,
  templatesGridClass,
  gettingStartedGridClass,
  blockToolbarClass,
  topbarTextLabelClass,
  topbarTouchTargetClass,
  popoverWidthClass,
} from '@/lib/editor-layout';

describe('Editor Mobile 5D.1 — topbar (A)', () => {
  it('no mobile as ações secundárias não usam texto desktop', () => {
    const mobile = topbarTextLabelClass(true);
    expect(mobile).toBe('hidden');
    expect(mobile).not.toContain('sm:inline');
  });

  it('no desktop o texto aparece a partir de sm (padrão atual preservado)', () => {
    expect(topbarTextLabelClass(false)).toBe('hidden sm:inline');
    // undefined = primeiro render SSR — mantém o comportamento CSS atual
    expect(topbarTextLabelClass(undefined)).toBe('hidden sm:inline');
  });

  it('no mobile os ícones ganham área de toque maior', () => {
    const mobile = topbarTouchTargetClass(true);
    expect(mobile).toContain('p-1.5');
    expect(mobile).toContain('-m-1.5'); // não aumenta o layout
    expect(topbarTouchTargetClass(false)).not.toContain('p-1.5');
  });

  it('isNarrowViewport espelha o breakpoint do hook useIsMobile', () => {
    expect(MOBILE_BREAKPOINT).toBe(768);
    expect(isNarrowViewport(320)).toBe(true);
    expect(isNarrowViewport(375)).toBe(true);
    expect(isNarrowViewport(430)).toBe(true);
    expect(isNarrowViewport(767)).toBe(true);
    expect(isNarrowViewport(768)).toBe(false);
    expect(isNarrowViewport(1024)).toBe(false);
  });
});

describe('Editor Mobile 5D.1 — grids do onboarding (B/C)', () => {
  it('Modelos Disponíveis: 1 coluna no mobile, 3 no desktop', () => {
    const tokens = templatesGridClass().split(' ').filter(Boolean);
    expect(tokens).toContain('grid-cols-1');
    expect(tokens).toContain('sm:grid-cols-3');
    expect(tokens).not.toContain('grid-cols-3'); // nunca 3 colunas sem breakpoint no mobile
  });

  it('Começar/Como usar: 1 coluna no mobile, 2 no desktop', () => {
    const tokens = gettingStartedGridClass().split(' ').filter(Boolean);
    expect(tokens).toContain('grid-cols-1');
    expect(tokens).toContain('sm:grid-cols-2');
    expect(tokens).not.toContain('grid-cols-2'); // nunca 2 colunas sem breakpoint no mobile
  });
});

describe('Editor Mobile 5D.1 — toolbar de bloco (D)', () => {
  it('no mobile não usa -left-20 (fica dentro da área visível, acima do bloco)', () => {
    const mobile = blockToolbarClass(true);
    expect(mobile).not.toContain('-left-20');
    expect(mobile).toContain('left-0');
    expect(mobile).toContain('-top-9');
  });

  it('no desktop preserva o posicionamento atual (-left-20)', () => {
    const desktop = blockToolbarClass(false);
    expect(desktop).toContain('-left-20');
    expect(desktop).toContain('top-1.5');
    // undefined (SSR) também preserva o desktop
    expect(blockToolbarClass(undefined)).toContain('-left-20');
  });
});

describe('Editor Mobile 5D.1 — slash menu clamp (E)', () => {
  const vp = { width: 320, height: 700 };
  const menu = slashMenuSize(700);

  it('slashMenuSize respeita max-h-80 (320px) e mínimo seguro', () => {
    expect(menu).toEqual({ width: 256, height: 320 });
    const tiny = slashMenuSize(80);
    expect(tiny.height).toBe(160);
    const large = slashMenuSize(1000);
    expect(large.height).toBe(320);
  });

  it('caret perto da borda direita → menu nunca sai da viewport', () => {
    const clamped = clampMenuPosition({ top: 40, left: 300 }, vp, menu);
    expect(clamped.left).toBeLessThanOrEqual(320 - menu.width - 8);
    expect(clamped.left).toBe(320 - 256 - 8);
    expect(clamped.left + menu.width).toBeLessThanOrEqual(320 - 8);
  });

  it('caret perto da borda inferior → menu nunca sai da viewport', () => {
    const clamped = clampMenuPosition({ top: 690, left: 10 }, vp, menu);
    expect(clamped.top).toBe(700 - 320 - 8);
    expect(clamped.top + menu.height).toBeLessThanOrEqual(700 - 8);
  });

  it('posição negativa é puxada para dentro da viewport', () => {
    const clamped = clampMenuPosition({ top: -20, left: -50 }, vp, menu);
    expect(clamped.top).toBe(8);
    expect(clamped.left).toBe(8);
  });

  it('menu maior que a viewport ainda mantém margem positiva', () => {
    const clamped = clampMenuPosition(
      { top: 0, left: 0 },
      { width: 200, height: 300 },
      { width: 256, height: 320 }
    );
    expect(clamped.top).toBe(8);
    expect(clamped.left).toBe(8);
  });

  it('posição central permanece inalterada', () => {
    const clamped = clampMenuPosition({ top: 120, left: 30 }, vp, menu);
    expect(clamped).toEqual({ top: 120, left: 30 });
  });
});

describe('Editor Mobile 5D.1 — popovers (F)', () => {
  it('largura máxima nunca excede a viewport mobile', () => {
    const cls = popoverWidthClass();
    expect(cls).toContain('w-64');
    expect(cls).toContain('max-w-[calc(100vw-2rem)]');
  });
});