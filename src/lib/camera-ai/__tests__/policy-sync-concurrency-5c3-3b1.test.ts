import { describe, it, expect, vi } from 'vitest';
import { syncCameraBlockPolicy } from '../policy-sync';
import { createWriteSerializer } from '../write-serializer';
import { hashQuestion } from '../hashing';
import type { CameraVerificationPolicyV1 } from '../schema.functions';

function deferred<T = void>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((res) => { resolve = res; });
  return { promise, resolve };
}

async function validPolicy(title: string, description: string): Promise<CameraVerificationPolicyV1> {
  return {
    version: 1,
    verifiability: 'visual',
    target: 'bancada',
    condition: 'limpa',
    targetDescription: '',
    conditionDescription: '',
    requiredVisibleEvidence: ['bancada visível'],
    rejectionSignals: ['sujeira visível'],
    notObservableSignals: [],
    summary: 'Verifica se a bancada está limpa.',
    questionHash: await hashQuestion(title, description),
    source: 'generated',
  };
}

function cameraBlock(title: string, description: string, policy?: CameraVerificationPolicyV1, revalidation?: boolean) {
  return {
    id: 'b1',
    type: 'camera',
    title,
    description,
    cameraAiPolicy: policy,
    cameraAiNeedsRevalidation: revalidation,
  };
}

/**
 * Simula a página: um banco fictício + um serializador compartilhado. Todos os
 * writers (camera sync E autosave) passam pelo MESMO serializer.
 */
function makeDb() {
  const serializer = createWriteSerializer();
  const persisted: any[] = [];
  const log: string[] = [];
  let inFlight = 0;
  let maxInFlight = 0;

  const write = (label: string, getBlocks: () => any[], gate?: { promise: Promise<void>; resolve: () => void }) =>
    serializer.enqueue(async () => {
      log.push(`${label}:start`);
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      if (gate) await gate.promise;
      persisted.splice(0, persisted.length, ...getBlocks());
      log.push(`${label}:end`);
      inFlight--;
      return true;
    });

  return { serializer, persisted, log, write, maxInFlight: () => maxInFlight };
}

describe('Camera sync × autosave geral — writers serializados (5C.3.3-B.1)', () => {
  it('A: autosave em voo → camera sync aguarda, sem write concorrente', async () => {
    const db = makeDb();
    const blocksState: any[] = [cameraBlock('Pia limpa?', 'Foto da pia', undefined, true)];
    const policy = await validPolicy('Pia limpa?', 'Foto da pia');
    const gate = deferred<void>();

    const autosave = db.write('autosave', () => [...blocksState], gate);

    const syncPromise = syncCameraBlockPolicy('b1', 'c1', undefined, {
      getBlocks: () => blocksState,
      persistBlocks: (b: any[]) => db.write('sync', () => b),
      compilePolicy: async () => ({ ok: true, policy }),
      applyBlocks: (b: any[]) => { blocksState.splice(0, blocksState.length, ...b); },
    });

    await vi.waitFor(() => expect(db.log).toContain('autosave:start'));
    // autosave ainda pendente → camera sync NÃO começou a escrever
    expect(db.log.filter((l) => l.startsWith('sync')).length).toBe(0);

    gate.resolve();
    await Promise.all([autosave, syncPromise]);

    expect(db.maxInFlight()).toBe(1);
    expect(db.log.indexOf('sync:start')).toBeGreaterThan(db.log.indexOf('autosave:end'));
  });

  it('B/D: autosave dispara durante camera sync → enfileirado, sem stale concorrente, estado final com policy', async () => {
    const db = makeDb();
    const blocksState: any[] = [cameraBlock('Pergunta A', 'Desc', undefined, true)];
    const policy = await validPolicy('Pergunta A', 'Desc');
    const gate = deferred<void>();
    // equivale ao blocksRef da page: estado mais recente commitado
    const latestRef: { current: any[] } = { current: blocksState };

    const syncPromise = syncCameraBlockPolicy('b1', 'c1', undefined, {
      getBlocks: () => blocksState,
      persistBlocks: (b: any[]) => {
        const isFirst = db.log.filter((l) => l.startsWith('sync:start')).length === 0;
        return db.write('sync', () => b, isFirst ? gate : undefined);
      },
      compilePolicy: async () => ({ ok: true, policy }),
      applyBlocks: (b: any[]) => {
        blocksState.splice(0, blocksState.length, ...b);
        latestRef.current = [...b];
      },
    });

    // aguarda a persistência da pergunta (suspensa) e SÓ ENTÃO o autosave dispara
    await vi.waitFor(() => expect(db.log).toContain('sync:start'));
    const autosave = db.write('autosave', () => [...latestRef.current]);

    gate.resolve();
    await Promise.all([syncPromise, autosave]);

    expect(db.maxInFlight()).toBe(1);
    // autosave roda depois do persist-pergunta e antes do persist-policy
    expect(db.log.indexOf('autosave:start')).toBeGreaterThan(db.log.indexOf('sync:end'));
    // o último write é a persistência da policy (nenhum writer antigo vem depois)
    expect(db.log[db.log.length - 1]).toBe('sync:end');

    const cam = db.persisted.find((b: any) => b.id === 'b1');
    expect(cam.cameraAiPolicy?.questionHash).toBe(policy.questionHash);
    expect(cam.cameraAiNeedsRevalidation).toBe(false);
    expect(cam.title).toBe('Pergunta A');
  });

  it('C: autosave antigo enfileirado nunca termina DEPOIS da persistência da policy', async () => {
    const db = makeDb();
    const blocksState: any[] = [cameraBlock('Pergunta A', 'Desc', undefined, true)];
    const policy = await validPolicy('Pergunta A', 'Desc');
    const oldSnapshot = [...blocksState]; // blocks sem policy, capturados cedo

    // autosave antigo entra na fila PRIMEIRO
    const autosave = db.write('autosave', () => [...oldSnapshot]);

    const syncPromise = syncCameraBlockPolicy('b1', 'c1', undefined, {
      getBlocks: () => blocksState,
      persistBlocks: (b: any[]) => db.write('sync', () => b),
      compilePolicy: async () => ({ ok: true, policy }),
      applyBlocks: (b: any[]) => { blocksState.splice(0, blocksState.length, ...b); },
    });

    await Promise.all([autosave, syncPromise]);

    // autosave (com blocks stale) rodou antes; a policy veio por último e venceu
    expect(db.log.indexOf('autosave:end')).toBeLessThan(db.log.indexOf('sync:start'));
    expect(db.log[db.log.length - 1]).toBe('sync:end');
    const cam = db.persisted.find((b: any) => b.id === 'b1');
    expect(cam.cameraAiNeedsRevalidation).toBe(false);
    expect(cam.cameraAiPolicy?.questionHash).toBe(policy.questionHash);
  });

  it('G: mudança não-Camera durante a sync → autosave posterior persiste com o estado recente', async () => {
    const db = makeDb();
    const blocksState: any[] = [
      cameraBlock('Pergunta A', 'Desc', undefined, true),
      { id: 't1', type: 'text', value: 'original' },
    ];
    const policy = await validPolicy('Pergunta A', 'Desc');
    const gate = deferred<void>();
    const latestRef: { current: any[] } = { current: blocksState };

    const syncPromise = syncCameraBlockPolicy('b1', 'c1', undefined, {
      getBlocks: () => blocksState,
      persistBlocks: (b: any[]) => {
        const isFirst = db.log.filter((l) => l.startsWith('sync:start')).length === 0;
        return db.write('sync', () => b, isFirst ? gate : undefined);
      },
      compilePolicy: async () => ({ ok: true, policy }),
      applyBlocks: (b: any[]) => {
        blocksState.splice(0, blocksState.length, ...b);
        latestRef.current = [...b];
      },
    });

    await vi.waitFor(() => expect(db.log).toContain('sync:start'));

    // usuário edita um bloco de texto durante a sincronização
    blocksState[1] = { id: 't1', type: 'text', value: 'editado-durante-sync' };
    latestRef.current = [...blocksState];
    // autosave dispara DEPOIS da edição, enfileirando atrás da persistência pendente
    const autosave = db.write('autosave', () => [...latestRef.current]);

    gate.resolve();
    await Promise.all([syncPromise, autosave]);

    const cam = db.persisted.find((b: any) => b.id === 'b1');
    const txt = db.persisted.find((b: any) => b.id === 't1');
    expect(cam.cameraAiPolicy?.questionHash).toBe(policy.questionHash);
    expect(cam.cameraAiNeedsRevalidation).toBe(false);
    expect(txt.value).toBe('editado-durante-sync');
  });

  it('D: após o fluxo completo, o último estado persistido é autoritativo (pergunta + policy + hash + revalidation=false)', async () => {
    const db = makeDb();
    const blocksState: any[] = [cameraBlock('Pergunta B', 'Desc', undefined, true)];
    const policy = await validPolicy('Pergunta B', 'Desc');

    const ok = await syncCameraBlockPolicy('b1', 'c1', undefined, {
      getBlocks: () => blocksState,
      persistBlocks: (b: any[]) => db.write('sync', () => b),
      compilePolicy: async () => ({ ok: true, policy }),
      applyBlocks: (b: any[]) => { blocksState.splice(0, blocksState.length, ...b); },
    });

    expect(ok).toBe(true);
    expect(db.log).toEqual(['sync:start', 'sync:end', 'sync:start', 'sync:end']);
    const cam = db.persisted.find((b: any) => b.id === 'b1');
    expect(cam.title).toBe('Pergunta B');
    expect(cam.cameraAiPolicy?.questionHash).toBe(policy.questionHash);
    expect(cam.cameraAiNeedsRevalidation).toBe(false);
  });
});