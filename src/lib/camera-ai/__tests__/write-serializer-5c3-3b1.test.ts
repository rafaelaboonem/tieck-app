import { describe, it, expect, vi } from 'vitest';
import { createWriteSerializer } from '../write-serializer';

function deferred<T = void>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

describe('createWriteSerializer — disciplina única de writers (5C.3.3-B.1)', () => {
  it('nunca executa dois writers ao mesmo tempo (B)', async () => {
    const s = createWriteSerializer();
    let inFlight = 0;
    let maxInFlight = 0;
    const gate = deferred();

    const opA = vi.fn(async () => {
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await gate.promise;
      inFlight--;
    });
    const opB = vi.fn(async () => {
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      inFlight--;
    });

    const pA = s.enqueue(opA);
    const pB = s.enqueue(opB);

    await Promise.resolve();
    expect(opA).toHaveBeenCalledTimes(1);
    expect(opB).not.toHaveBeenCalled(); // B não inicia enquanto A está pendente

    gate.resolve();
    await Promise.all([pA, pB]);

    expect(opB).toHaveBeenCalledTimes(1);
    expect(maxInFlight).toBe(1);
  });

  it('ordem FIFO: writer antigo termina ANTES do novo (C/D)', async () => {
    const s = createWriteSerializer();
    const order: string[] = [];
    const gate = deferred();

    const pOld = s.enqueue(async () => {
      order.push('old:start');
      await gate.promise;
      order.push('old:end');
    });
    const pNew = s.enqueue(async () => {
      order.push('new:start');
      order.push('new:end');
    });

    gate.resolve();
    await Promise.all([pOld, pNew]);

    expect(order).toEqual(['old:start', 'old:end', 'new:start', 'new:end']);
  });

  it('writer antigo nunca pode sobrescrever estado mais novo: o último enfileirado vence', async () => {
    const s = createWriteSerializer();
    let persisted: string | null = null;
    const gate = deferred();

    const pOld = s.enqueue(async () => {
      await gate.promise;
      persisted = 'OLD_STALE_BLOCKS';
    });
    const pNew = s.enqueue(async () => {
      persisted = 'NEW_POLICY_BLOCKS';
    });

    gate.resolve();
    await Promise.all([pOld, pNew]);

    expect(persisted).toBe('NEW_POLICY_BLOCKS');
  });

  it('falha de um writer não bloqueia a fila', async () => {
    const s = createWriteSerializer();
    const p1 = s.enqueue(async () => { throw new Error('boom'); });
    const p2 = s.enqueue(async () => 'ok');

    await expect(p1).rejects.toThrow('boom');
    await expect(p2).resolves.toBe('ok');
  });
});