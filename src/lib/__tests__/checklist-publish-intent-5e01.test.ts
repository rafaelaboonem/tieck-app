import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { shouldOpenShareAfterSave } from '../checklist-publish-intent';

describe('Execution 5E.0.1 — shouldOpenShareAfterSave (regra fail-closed)', () => {
  it('A) publicação explícita confirmada → abre Compartilhar', () => {
    expect(
      shouldOpenShareAfterSave({ isPublishedOverride: true, serverPublished: true, silent: false })
    ).toBe(true);
  });

  it('B) CASO CRÍTICO: save normal de checklist já publicado → NÃO abre', () => {
    expect(
      shouldOpenShareAfterSave({ isPublishedOverride: undefined, serverPublished: true, silent: false })
    ).toBe(false);
  });

  it('B2) isPublishedOverride === false com serverPublished true → NÃO abre', () => {
    expect(
      shouldOpenShareAfterSave({ isPublishedOverride: false, serverPublished: true, silent: false })
    ).toBe(false);
  });

  it('C) publicação explícita falhou/não confirmada → NÃO abre', () => {
    expect(
      shouldOpenShareAfterSave({ isPublishedOverride: true, serverPublished: false, silent: false })
    ).toBe(false);
  });

  it('D) autosave silencioso → NÃO abre', () => {
    expect(
      shouldOpenShareAfterSave({ isPublishedOverride: true, serverPublished: true, silent: true })
    ).toBe(false);
  });

  it('todos os caminhos são fail-closed por padrão (sem override)', () => {
    expect(shouldOpenShareAfterSave({ serverPublished: true })).toBe(false);
    expect(shouldOpenShareAfterSave({ serverPublished: false })).toBe(false);
  });
});

describe('Execution 5E.0.1 — estrutura real em checklist.tsx (E)', () => {
  const source = readFileSync(resolve(process.cwd(), 'src/routes/checklist.tsx'), 'utf8');

  it('usa o gate shouldOpenShareAfterSave com os três campos', () => {
    expect(source).toContain('const didExplicitlyPublish = shouldOpenShareAfterSave({');
    expect(source).toContain('isPublishedOverride,');
    expect(source).toContain('serverPublished,');
    expect(source).toContain('silent,');
  });

  it('a abertura de Compartilhar fica dentro do ramo didExplicitlyPublish', () => {
    const gateIdx = source.indexOf('const didExplicitlyPublish = shouldOpenShareAfterSave({');
    const flowBlock = source.slice(gateIdx);
    const branchIdx = flowBlock.indexOf('if (didExplicitlyPublish) {');
    const openIdx = flowBlock.indexOf('setIsSettingsOpen(true);');
    const tabIdx = flowBlock.indexOf('setSettingsActiveTab("compartilhar");');
    expect(branchIdx).toBeGreaterThan(-1);
    expect(openIdx).toBeGreaterThan(branchIdx);
    expect(tabIdx).toBeGreaterThan(openIdx);
  });

  it('E) checklist novo: id real (data.id) estabelecido antes da abertura do painel', () => {
    const gateIdx = source.indexOf('const didExplicitlyPublish = shouldOpenShareAfterSave({');
    const flowBlock = source.slice(gateIdx);
    const branchStart = flowBlock.indexOf('if (didExplicitlyPublish) {');
    const branch = flowBlock.slice(branchStart);
    expect(branch).toContain('sessionChecklistIdRef.current = data.id');
    expect(branch.indexOf('navigate({ to: "/checklist", search: { id: data.id }'))
      .toBeLessThan(branch.indexOf('setIsSettingsOpen(true);'));
  });

  it('não sobrou o antigo gate isActuallyPublished', () => {
    expect(source).not.toContain('if (isActuallyPublished) {');
  });
});