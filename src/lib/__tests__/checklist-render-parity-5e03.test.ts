import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  resolveChecklistFontFamily,
  getChecklistRenderStyle,
  getChecklistContainerClass,
  getChecklistWatermarkPlacement,
} from '../checklist-render-styles';

describe('Execution 5E.0.3 — resolveChecklistFontFamily (fonte canônica)', () => {
  it('A) fonte simples é citada e recebe fallback sans-serif', () => {
    expect(resolveChecklistFontFamily('Inter')).toBe("'Inter', sans-serif");
  });

  it('B) fonte com espaço (ex.: Open Sans) é citada para ser CSS válido', () => {
    expect(resolveChecklistFontFamily('Open Sans')).toBe("'Open Sans', sans-serif");
  });

  it('C) fonte ausente cai no fallback Inter com sans-serif', () => {
    expect(resolveChecklistFontFamily(undefined)).toBe("'Inter', sans-serif");
    expect(resolveChecklistFontFamily(null)).toBe("'Inter', sans-serif");
    expect(resolveChecklistFontFamily('')).toBe("'Inter', sans-serif");
  });
});

describe('Execution 5E.0.3 — getChecklistRenderStyle (tokens compartilhados)', () => {
  it('A) tema claro usa bg/color/fonte/tamanho das settings', () => {
    const style = getChecklistRenderStyle(
      {
        bgColor: '#fafafa',
        textColor: '#111111',
        font: 'Georgia',
        baseFontSize: '18px',
      },
      false
    );
    expect(style).toEqual({
      backgroundColor: '#fafafa',
      color: '#111111',
      fontFamily: "'Georgia', sans-serif",
      fontSize: '18px',
    });
  });

  it('B) tema escuro usa os mesmos valores hardcoded do preview do editor', () => {
    const style = getChecklistRenderStyle({}, true);
    expect(style.backgroundColor).toBe('#1a1a1a');
    expect(style.color).toBe('#ffffff');
    expect(style.fontFamily).toBe("'Inter', sans-serif");
  });

  it('C) fontFamily sempre usa o helper canônico (nunca a string crua)', () => {
    const style = getChecklistRenderStyle({ font: 'Arial' }, false);
    expect(style.fontFamily).toBe(resolveChecklistFontFamily('Arial'));
  });
});

describe('Execution 5E.0.3 — marca dágua centralizada', () => {
  it('A) posicionamento é centralizado na parte inferior', () => {
    const cls = getChecklistWatermarkPlacement();
    expect(cls).toContain('fixed');
    expect(cls).toContain('bottom-6');
    expect(cls).toContain('justify-center');
    expect(cls).toContain('inset-x-0');
  });

  it('B) nunca mais usa a posição lateral (right-8)', () => {
    expect(getChecklistWatermarkPlacement()).not.toContain('right-8');
  });
});

describe('Execution 5E.0.3 — container compartilhado', () => {
  it('A) classe canônica do container igual à do preview interno', () => {
    expect(getChecklistContainerClass()).toBe('max-w-4xl w-full mx-auto px-4 sm:px-6 pt-12');
  });

  it('B) não usa padding fixo px-6 (divergia do preview no mobile)', () => {
    const tokens = getChecklistContainerClass().split(' ');
    expect(tokens).not.toContain('px-6');
    expect(tokens).toContain('px-4');
    expect(tokens).toContain('sm:px-6');
  });
});

describe('Execution 5E.0.3 — estrutura real: c.$id.tsx (página pública)', () => {
  const source = readFileSync(resolve(process.cwd(), 'src/routes/c.$id.tsx'), 'utf8');

  it('A) usa os tokens compartilhados getChecklistRenderStyle + getChecklistWatermarkPlacement', () => {
    expect(source).toContain('style={getChecklistRenderStyle(settings, isDark)}');
    expect(source).toContain('className={getChecklistWatermarkPlacement()}');
  });

  it('B) renderiza o header cover/profile compartilhado antes do ExecutionEngine', () => {
    const coverIdx = source.indexOf('<ChecklistCoverProfile blocks={checklist.blocks || []} settings={settings} />');
    const engineIdx = source.indexOf('<ExecutionEngine ');
    expect(coverIdx).toBeGreaterThan(-1);
    expect(engineIdx).toBeGreaterThan(coverIdx);
  });

  it('C) não usa mais fontFamily crua nem posição lateral da marca', () => {
    expect(source).not.toContain('fontFamily: settings.font');
    expect(source).not.toContain('bottom-6 right-8');
  });
});

describe('Execution 5E.0.3 — estrutura real: checklist.tsx (preview interno)', () => {
  const source = readFileSync(resolve(process.cwd(), 'src/routes/checklist.tsx'), 'utf8');

  it('A) o painel de preview usa os mesmos tokens compartilhados', () => {
    expect(source).toContain('style={getChecklistRenderStyle(settings, isDark)}');
    expect(source).toContain('className={getChecklistContainerClass()} style={{ maxWidth: settings.pageWidth }}');
    expect(source).toContain('<ChecklistCoverProfile blocks={blocks} settings={settings} />');
  });

  it('B) não sobrou o template inline de fonte do preview', () => {
    expect(source).not.toContain("'${settings.font}', sans-serif");
  });
});

describe('Execution 5E.0.3 — estrutura real: ExecutionEngine.tsx', () => {
  const source = readFileSync(resolve(process.cwd(), 'src/components/ExecutionEngine.tsx'), 'utf8');

  it('A) usa o container compartilhado com pageWidth das settings', () => {
    expect(source).toContain('className={getChecklistContainerClass()} style={{ maxWidth: settings.pageWidth }}');
  });

  it('B) não mantém o container antigo px-6 com fallback 800px', () => {
    expect(source).not.toContain('w-full mx-auto px-6');
    expect(source).not.toContain('settings.pageWidth || "800px"');
  });
});