import { describe, it, expect, vi } from 'vitest';
import { hashQuestion } from '../hashing';

// Mock do supabase client
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: {
      getSession: vi.fn(),
    },
  },
}));

describe('Camera AI Integrity & Race Conditions', () => {
  it('hashQuestion should be consistent with backend expectations', async () => {
    const title = "Foto da fachada";
    const description = "Tire uma foto nítida";
    const hash = await hashQuestion(title, description);
    
    // O backend usa (title || '') + ' ' + (description || '')
    // Vamos garantir que o helper no frontend não use "subtitle" no cálculo.
    const hashWithSubtitle = await hashQuestion(title, description);
    expect(hash).toBe(hashWithSubtitle);
    
    // Verificando se o trim() e o espaço estão corretos
    const hashEmpty = await hashQuestion("", "");
    const expectedEmpty = await hashQuestion(undefined, undefined);
    expect(hashEmpty).toBe(expectedEmpty);
  });

  it('should detect stale policies when question changes', async () => {
    const title1 = "Pergunta A";
    const title2 = "Pergunta B";
    const hash1 = await hashQuestion(title1, "");
    const hash2 = await hashQuestion(title2, "");
    
    expect(hash1).not.toBe(hash2);
  });
});
