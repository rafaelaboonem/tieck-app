import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const source = readFileSync(resolve(process.cwd(), 'src/routes/checklist.tsx'), 'utf8');

/**
 * O fluxo de publicação vive dentro da closure saveChecklist do componente
 * gigante; renderizá-lo exige a página inteira (auth + workspace + supabase).
 * Estas regressões fixam a ESTRUTURA real do handler de sucesso/falha para
 * impedir regressão dos invariantes 5E.0 sem depender de mock genérico.
 */

describe('Execution 5E.0 — Publish → Compartilhar (A/B/C)', () => {
  // Escopo: apenas o fluxo de publicação dentro de saveChecklist — a partir do
  // bloco de sucesso até o fim do handler (evita hits em handlers anteriores).
  const successIdx = source.indexOf('if (isActuallyPublished) {');
  const flowBlock = source.slice(successIdx);
  const flowCatchIdx = flowBlock.indexOf('} catch (err: any) {');

  it('A) após sucesso confirmado: Configurações abre na aba Compartilhar', () => {
    const openIdx = flowBlock.indexOf('setIsSettingsOpen(true);');
    const tabIdx = flowBlock.indexOf('setSettingsActiveTab("compartilhar");');
    expect(successIdx).toBeGreaterThan(-1);
    expect(openIdx).toBeGreaterThan(-1);
    expect(tabIdx).toBeGreaterThan(openIdx);
  });

  it('A2) a abertura acontece somente dentro do caminho de sucesso (antes do catch)', () => {
    expect(flowCatchIdx).toBeGreaterThan(-1);
    expect(flowBlock.indexOf('setIsSettingsOpen(true);')).toBeLessThan(flowCatchIdx);
    expect(flowBlock.indexOf('setSettingsActiveTab("compartilhar");')).toBeLessThan(flowCatchIdx);
  });

  it('B) falha de publicação NÃO abre Compartilhar (catch não contém abertura)', () => {
    const finallyIdx = flowBlock.indexOf('} finally {');
    const catchBlock = flowBlock.slice(flowCatchIdx, finallyIdx);
    expect(catchBlock).not.toContain('setIsSettingsOpen(true)');
    expect(catchBlock).not.toContain('setSettingsActiveTab(');
    expect(catchBlock).toContain('toast.error');
  });

  it('C) checklist novo: navega com o id REAL (data.id) antes de abrir o painel', () => {
    const successIdx = source.indexOf('if (isActuallyPublished) {');
    const successBlock = source.slice(successIdx);
    expect(successBlock).toContain('sessionChecklistIdRef.current = data.id');
    expect(successBlock).toContain('search: { id: data.id }');
    // id real vem antes da abertura das Configurações
    expect(successBlock.indexOf('navigate({ to: "/checklist", search: { id: data.id }'))
      .toBeLessThan(successBlock.indexOf('setIsSettingsOpen(true);'));
    // nunca link com undefined/null
    expect(source).not.toContain('search: { id: undefined }');
    expect(source).not.toContain('search: { id: null }');
  });

  it('D) a página interpreta o contrato via resolveSettingsIntent', () => {
    expect(source).toContain('resolveSettingsIntent(openSettingsParam)');
  });
});