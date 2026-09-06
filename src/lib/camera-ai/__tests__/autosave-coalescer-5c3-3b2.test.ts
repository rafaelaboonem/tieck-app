import { describe, it, expect } from 'vitest';
import { createAutosaveCoalescer } from '../autosave-coalescer';
import { createWriteSerializer } from '../write-serializer';

describe('createAutosaveCoalescer (5C.3.3-B.2)', () => {
  it('D: autosave durante save em voo → não é perdido; fica pendente e executa depois', () => {
    const c = createAutosaveCoalescer();
    // save em voo → timer dispara
    expect(c.onTick(true)).toBe(false); // não executa agora; marca pendente
    expect(c.isPending()).toBe(true);
    // fim do save → exatamente UM autosave coalescido
    expect(c.consumePending()).toBe(true);
    expect(c.consumePending()).toBe(false);
    expect(c.isPending()).toBe(false);
  });

  it('E: 5 solicitações durante um save são coalescidas em UM autosave', () => {
    const c = createAutosaveCoalescer();
    for (let i = 0; i < 5; i++) {
      expect(c.onTick(true)).toBe(false);
    }
    expect(c.isPending()).toBe(true);
    expect(c.consumePending()).toBe(true); // exatamente UM
    expect(c.consumePending()).toBe(false);
    expect(c.isPending()).toBe(false);
  });

  it('sem save em voo → autosave executa diretamente, nada fica pendente', () => {
    const c = createAutosaveCoalescer();
    expect(c.onTick(false)).toBe(true);
    expect(c.isPending()).toBe(false);
    expect(c.consumePending()).toBe(false);
  });

  it('G: pendente sobrevive à falha do save anterior e prossegue depois', () => {
    const c = createAutosaveCoalescer();
    expect(c.onTick(true)).toBe(false);
    // o save anterior falhou — o finally ainda consome o pendente
    expect(c.consumePending()).toBe(true);
  });

  it('sem loop: pendente consumido não renasce sozinho', () => {
    const c = createAutosaveCoalescer();
    c.onTick(true);
    c.consumePending();
    expect(c.consumePending()).toBe(false);
    expect(c.isPending()).toBe(false);
  });

  it('D/E integração com a fila: N solicitações → UM autosave posterior com o estado mais recente', async () => {
    const c = createAutosaveCoalescer();
    const serializer = createWriteSerializer();
    const stateRef: { current: string } = { current: 'v0' };
    const writes: string[] = [];

    const saveInFlight = serializer.enqueue(async () => {
      const captured = stateRef.current; // estado no momento em que o op executa
      await new Promise<void>((r) => setTimeout(r, 5));
      writes.push('save:' + captured);
    });

    for (let i = 0; i < 5; i++) {
      stateRef.current = 'v' + (i + 1);
      expect(c.onTick(true)).toBe(false); // todas pendentes (coalescidas)
    }
    expect(c.isPending()).toBe(true);

    await saveInFlight;

    // fim do save → UM autosave coalescido com o estado mais recente
    expect(c.consumePending()).toBe(true);
    const coalesced = serializer.enqueue(async () => {
      writes.push('autosave:' + stateRef.current);
    });
    await coalesced;

    // exatamente UM autosave coalescido, com o estado MAIS RECENTE, após o save
    expect(writes).toHaveLength(2);
    expect(writes[0]).toMatch(/^save:/);
    expect(writes[1]).toBe('autosave:v5');
    expect(c.consumePending()).toBe(false); // sem loop
  });

  it('G integração: falha do writer anterior não impede o autosave pendente', async () => {
    const c = createAutosaveCoalescer();
    const serializer = createWriteSerializer();
    const writes: string[] = [];

    const failing = serializer.enqueue(async () => { throw new Error('boom'); });
    c.onTick(true); // pendente enquanto o save (que vai falhar) roda

    await expect(failing).rejects.toThrow('boom');
    expect(c.consumePending()).toBe(true);
    const coalesced = serializer.enqueue(async () => { writes.push('autosave-ok'); });
    await coalesced;
    expect(writes).toEqual(['autosave-ok']);
  });
});