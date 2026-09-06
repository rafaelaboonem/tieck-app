import { describe, it, expect, vi } from 'vitest';
import { syncCameraBlockPolicy } from '../policy-sync';
import type { CompiledPolicyResponse } from '../policy-sync';
import { createWriteSerializer } from '../write-serializer';
import { mergePersistedBlocksInto } from '../blocks-freshness';
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
 * Espelha EXATAMENTE a orquestração da página:
 * - persistBlocks serializado + confirmação + merge SÍNCRONO da ref autoritativa
 *   (agora com a proteção camera 5C.3.3-C — persistência antiga não clobbera
 *   pergunta local nova);
 * - compilePolicy captura o bloco no INÍCIO do compile (como o backend, que
 *   compila contra o checklist persistido no momento da requisição);
 * - applyBlocks faz o merge na ref autoritativa.
 */
function makeSyncHarness(initialBlocks: any[]) {
  const serializer = createWriteSerializer();
  const persisted: any[] = [];
  const log: string[] = [];
  let inFlight = 0;
  let maxInFlight = 0;
  const blocksRef: { current: any[] } = { current: initialBlocks };
  const staleEvents: string[] = [];
  const gates: Record<number, { promise: Promise<void>; resolve: () => void }> = {};
  let persistCount = 0;
  let failPersistAt = 0;
  let compileGate: { promise: Promise<void>; resolve: () => void } | null = null;
  let compileImpl: (checklistId: string, blockId: string) => Promise<CompiledPolicyResponse> =
    async (checklistId, blockId) => {
      log.push('compile:start');
      const blockAtStart = blocksRef.current.find((b: any) => b.id === blockId);
      if (compileGate) await compileGate.promise;
      const policy = await validPolicy(blockAtStart.title, blockAtStart.description);
      log.push('compile:end');
      return { ok: true, policy };
    };

  const persistBlocks = (nextBlocks: any[]) => serializer.enqueue(async () => {
    persistCount++;
    const callIndex = persistCount;
    log.push(`persist:start#${callIndex}`);
    inFlight++;
    maxInFlight = Math.max(maxInFlight, inFlight);
    try {
      if (gates[callIndex]) await gates[callIndex].promise;
      if (callIndex === failPersistAt) return false;
      persisted.splice(0, persisted.length, ...nextBlocks);
      blocksRef.current = await mergePersistedBlocksInto(blocksRef.current, nextBlocks);
      return true;
    } finally {
      inFlight--;
      log.push(`persist:end#${callIndex}`);
    }
  });

  const sync = (blockId: string, checklistId: string, nextBlock?: any) =>
    syncCameraBlockPolicy(blockId, checklistId, nextBlock, {
      getBlocks: () => blocksRef.current,
      persistBlocks,
      compilePolicy: (checklistId, blockId) => compileImpl(checklistId, blockId),
      applyBlocks: async (nextBlocks) => {
        blocksRef.current = await mergePersistedBlocksInto(blocksRef.current, nextBlocks);
      },
      onStale: () => staleEvents.push('stale'),
    });

  return {
    persisted,
    log,
    blocksRef,
    staleEvents,
    gates,
    sync,
    maxInFlight: () => maxInFlight,
    setCompileGate: (g: { promise: Promise<void>; resolve: () => void }) => { compileGate = g; },
    setCompileImpl: (fn: (checklistId: string, blockId: string) => Promise<CompiledPolicyResponse>) => { compileImpl = fn; },
    setFailPersistAt: (n: number) => { failPersistAt = n; },
  };
}

describe('mergePersistedBlocksInto — proteção camera (5C.3.3-C)', () => {
  it('persistência de câmera com pergunta DIFERENTE da local → preserva a edição local (title/desc/revalidation/policy)', async () => {
    const local = cameraBlock('Pergunta B', 'descB', undefined, true);
    const persisted = [cameraBlock('Pergunta A', 'descA', { version: 1, questionHash: 'hash-a' } as any, false)];
    const merged = await mergePersistedBlocksInto([local], persisted);
    expect(merged[0].title).toBe('Pergunta B');
    expect(merged[0].cameraAiNeedsRevalidation).toBe(true);
    expect(merged[0].cameraAiPolicy).toBeUndefined();
  });

  it('persistência de câmera com a MESMA pergunta → payload autoritativo (policy aplicada, revalidation false)', async () => {
    const policy = { version: 1, questionHash: await hashQuestion('Pergunta A', 'descA') } as any;
    const local = cameraBlock('Pergunta A', 'descA', undefined, true);
    const persisted = [cameraBlock('Pergunta A', 'descA', policy, false)];
    const merged = await mergePersistedBlocksInto([local], persisted);
    expect(merged[0].cameraAiNeedsRevalidation).toBe(false);
    expect(merged[0].cameraAiPolicy).toEqual(policy);
  });
});

describe('syncCameraBlockPolicy — proteção stale (5C.3.3-C)', () => {
  it('A: compile A em voo → pergunta muda para B → policy A descartada, nunca persistida; B permanece', async () => {
    const h = makeSyncHarness([cameraBlock('Pergunta A', 'desc', undefined, true)]);
    const g = deferred();
    h.setCompileGate(g);

    const syncPromise = h.sync('b1', 'c1');
    await vi.waitFor(() => expect(h.log).toContain('compile:start'));

    // usuário muda a pergunta durante o compile A
    h.blocksRef.current = h.blocksRef.current.map((b: any) =>
      b.id === 'b1' ? { ...b, title: 'Pergunta B', description: 'descB', cameraAiNeedsRevalidation: true } : b
    );

    g.resolve();
    const result = await syncPromise;

    expect(result).toBe(false); // stale — fail-closed
    expect(h.staleEvents).toEqual(['stale']);
    // policy A nunca persistida como atual (só a persistência da pergunta A ocorreu)
    const cam = h.persisted.find((b: any) => b.id === 'b1');
    expect(cam?.cameraAiPolicy).toBeUndefined();
    // B permanece local (title/desc), revalidation intacta
    const local = h.blocksRef.current.find((b: any) => b.id === 'b1');
    expect(local.title).toBe('Pergunta B');
    expect(local.cameraAiNeedsRevalidation).toBe(true); // E
    expect(h.maxInFlight()).toBe(1); // I
  });

  it('B/C: persist-policy A em voo → muda para B → persist A termina → B NÃO é sobrescrita localmente; blocksRef continua B', async () => {
    const h = makeSyncHarness([cameraBlock('Pergunta A', 'desc', undefined, true)]);
    h.gates[2] = deferred(); // 2ª persistência = persist-policy

    const syncPromise = h.sync('b1', 'c1');
    await vi.waitFor(() => expect(h.log.filter((l) => l.startsWith('persist:start')).length).toBe(2));

    // muda a pergunta para B durante persist-policy A em voo
    h.blocksRef.current = h.blocksRef.current.map((b: any) =>
      b.id === 'b1' ? { ...b, title: 'Pergunta B', description: 'descB', cameraAiNeedsRevalidation: true } : b
    );

    h.gates[2].resolve();
    const result = await syncPromise;

    expect(result).toBe(false); // stale
    expect(h.staleEvents).toEqual(['stale']);
    // C: blocksRef continua representando B (o merge 5C.3.3-C preservou B)
    const local = h.blocksRef.current.find((b: any) => b.id === 'b1');
    expect(local.title).toBe('Pergunta B');
    expect(local.description).toBe('descB');
    expect(local.cameraAiPolicy).toBeUndefined(); // policy A não aplicada localmente
    expect(local.cameraAiNeedsRevalidation).toBe(true); // E
    expect(h.maxInFlight()).toBe(1); // I
  });

  it('F: compile falha → revalidation continua true; nenhuma policy aplicada', async () => {
    const h = makeSyncHarness([cameraBlock('Pergunta A', 'desc', undefined, true)]);
    h.setCompileImpl(async () => ({ ok: false }));

    const result = await h.sync('b1', 'c1');

    expect(result).toBe(false);
    expect(h.staleEvents).toEqual([]); // falha, não stale
    const local = h.blocksRef.current.find((b: any) => b.id === 'b1');
    expect(local.cameraAiNeedsRevalidation).toBe(true);
    expect(h.persisted.find((b: any) => b.id === 'b1')?.cameraAiPolicy).toBeUndefined();
  });

  it('G: persist-policy falha → revalidation continua true; Testar bloqueado', async () => {
    const h = makeSyncHarness([cameraBlock('Pergunta A', 'desc', undefined, true)]);
    h.gates[2] = deferred();

    const syncPromise = h.sync('b1', 'c1');
    await vi.waitFor(() => expect(h.log.filter((l) => l.startsWith('persist:start')).length).toBe(2));
    h.setFailPersistAt(2);
    h.gates[2].resolve();

    const result = await syncPromise;
    expect(result).toBe(false);
    const local = h.blocksRef.current.find((b: any) => b.id === 'b1');
    expect(local.cameraAiNeedsRevalidation).toBe(true);
    expect(local.cameraAiPolicy).toBeUndefined();
  });

  it('J: fluxo sem concorrência → persist question → compile → persist policy → ready', async () => {
    const h = makeSyncHarness([cameraBlock('Pergunta A', 'desc', undefined, true)]);
    const result = await h.sync('b1', 'c1');

    expect(result).toBe(true);
    const cam = h.persisted.find((b: any) => b.id === 'b1');
    expect(cam.cameraAiPolicy?.questionHash).toBe(await hashQuestion('Pergunta A', 'desc'));
    expect(cam.cameraAiNeedsRevalidation).toBe(false);
    expect(h.staleEvents).toEqual([]);
    expect(h.maxInFlight()).toBe(1); // I
  });
});