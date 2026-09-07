import { describe, it, expect } from 'vitest';
import {
  resolveSettingsIntent,
  resolvePublicChecklistId,
  buildPublicChecklistUrl,
} from '../checklist-links';

describe('Execution 5E.0 — resolveSettingsIntent (contrato ?settings=)', () => {
  it('D) settings=envios → abre Configurações na aba Envios', () => {
    expect(resolveSettingsIntent('envios')).toEqual({ open: true, tab: 'envios' });
  });

  it('settings=compartilhar → abre Configurações na aba Compartilhar (A)', () => {
    expect(resolveSettingsIntent('compartilhar')).toEqual({ open: true, tab: 'compartilhar' });
  });

  it('todas as abas válidas são reconhecidas', () => {
    for (const tab of ['geral', 'compartilhar', 'envios', 'insights', 'emails', 'apresentacao']) {
      expect(resolveSettingsIntent(tab)).toEqual({ open: true, tab });
    }
  });

  it('settings=true → abre Configurações mantendo a aba atual', () => {
    expect(resolveSettingsIntent(true)).toEqual({ open: true });
  });

  it('ausente/false/string vazia → não abre nada', () => {
    expect(resolveSettingsIntent(undefined)).toEqual({ open: false });
    expect(resolveSettingsIntent(false)).toEqual({ open: false });
    expect(resolveSettingsIntent('')).toEqual({ open: false });
  });

  it('string desconhecida → abre com segurança mantendo a aba atual', () => {
    expect(resolveSettingsIntent('garbage')).toEqual({ open: true });
  });
});

describe('Execution 5E.0 — buildPublicChecklistUrl (link público canônico)', () => {
  it('slug válido → /c/{slug}', () => {
    expect(buildPublicChecklistUrl('https://tieck.app', 'meu-checklist', 'real-id-1')).toBe(
      'https://tieck.app/c/meu-checklist'
    );
  });

  it('sem slug → fallback seguro para o id real', () => {
    expect(buildPublicChecklistUrl('https://tieck.app', null, 'real-id-1')).toBe(
      'https://tieck.app/c/real-id-1'
    );
  });

  it('slug "undefined"/"null"/vazio → nunca entra no link', () => {
    for (const bad of ['undefined', 'null', '']) {
      expect(buildPublicChecklistUrl('https://tieck.app', bad, 'real-id-1')).toBe(
        'https://tieck.app/c/real-id-1'
      );
    }
  });

  it('sem id algum → link vazio (nunca /c/undefined nem /c/null)', () => {
    expect(buildPublicChecklistUrl('https://tieck.app', undefined, undefined)).toBe('');
    expect(buildPublicChecklistUrl('https://tieck.app', null, null)).toBe('');
  });

  it('resolvePublicChecklistId guarda as strings inválidas', () => {
    expect(resolvePublicChecklistId(' x ', 'id')).toBe('x');
    expect(resolvePublicChecklistId('undefined', 'id')).toBe('id');
    expect(resolvePublicChecklistId(null, null)).toBe('');
  });
});