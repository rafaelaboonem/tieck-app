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
 * Espelha EXATAMENTE o `handleCameraBlockSync` da página (5C.3.3-C):
 *
 * - refs de re-sync por bloco (pending/running);
 * - `runSync(true)` com o nextBlock da chamada original; re-runs usam
 *   `runSync(false)` — estado ATUAL, sem o nextBlock da pergunta antiga;
 * - `onStale` marca pending; o finally consome e encadeia UMA re-sync;
 * - nunca duas syncs simultâneas para o mesmo bloco (runningRef);
 * - persistBlocks serializado + merge com proteção camera;
 * - applyBlocks faz o merge na ref autoritativa.
 */
function makePageHarness(initialBlocks: any[]) {
  const serializer = createWriteSerializer();
  const persisted: any[] = [];
  const log: string[] = [];
  let inFlight = 0;
  let maxInFlight = 0;
  const blocksRef: { current: any[] } = { current: initialBlocks };
  const gates: Record<number, { promise: Promise<void>; resolve: () => void }> = {};
  let persistCount = 0;
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

  const pendingRef: { current: Record<string, boolean> } = { current: {} };
  const runningRef: { current: Record<string, boolean> } = { current: {} };

  const persistBlocks = (nextBlocks: any[]) => serializer.enqueue(async () => {
    persistCount++;
    const callIndex = persistCount;
    log.push(`persist:start#${callIndex}`);
    inFlight++;
    maxInFlight = Math.max(maxInFlight, inFlight);
    try {
      if (gates[callIndex]) await gates[callIndex].promise;
      persisted.splice(0, persisted.length, ...nextBlocks);
      blocksRef.current = await mergePersistedBlocksInto(blocksRef.current, nextBlocks);
      return true;
    } finally {
      inFlight--;
      log.push(`persist:end#${callIndex}`);
    }
  });

  // ===== espelha EXATAMENTE handleCameraBlockSync da página =====
  const handleCameraBlockSync = (blockId: string, nextBlock?: any): Promise<boolean> => {
    const runSync = async (useRequestedBlock: boolean): Promise<boolean> => {
      if (runningRef.current[blockId]) {
        pendingRef.current[blockId] = true;
        return false;
      }
      runningRef.current[blockId] = true;
      try {
        return await syncCameraBlockPolicy(blockId, 'c1', useRequestedBlock ? nextBlock : undefined, {
          getBlocks: () => blocksRef.current,
          persistBlocks,
          compilePolicy: (checklistId, blockId) => compileImpl(checklistId, blockId),
          applyBlocks: async (nextBlocks) => {
            blocksRef.current = await mergePersistedBlocksInto(blocksRef.current, nextBlocks);
          },
          onStale: () => {
            pendingRef.current[blockId] = true;
          },
        });
      } finally {
        runningRef.current[blockId] = false;
        if (pendingRef.current[blockId]) {
          pendingRef.current[blockId] = false;
          return runSync(false);
        }
      }
    };
    return runSync(true);
  };

  return {
    persisted,
    log,
    blocksRef,
    gates,
    handleCameraBlockSync,
    maxInFlight: () => maxInFlight,
    setCompileGate: (g: { promise: Promise<void>; resolve: () => void }) => { compileGate = g; },
  };
}

describe('handleCameraBlockSync — re-sync da pergunta mais nova (5C.3.3-C)', () => {
  it('D: banco recebe A antes do stale → nova sync B roda → estado final do banco = B + policy B', async () => {
    const h = makePageHarness([cameraBlock('Pergunta A', 'desc', undefined, true)]);
    h.gates[2] = deferred(); // persist-policy A em voo

    const syncPromise = h.handleCameraBlockSync('b1');
    await vi.waitFor(() => expect(h.log.filter((l) => l.startsWith('persist:start')).length).toBe(2));

    // usuário muda para B durante persist-policy A (A já chegou/chega ao banco)
    h.blocksRef.current = h.blocksRef.current.map((b: any) =>
      b.id === 'b1' ? { ...b, title: 'Pergunta B', description: 'descB', cameraAiNeedsRevalidation: true } : b
    );

    h.gates[2].resolve();
    const result = await syncPromise; // chain: A stale → UMA re-sync B

    expect(result).toBe(true); // re-sync B completou com sucesso
    const cam = h.persisted.find((b: any) => b.id === 'b1');
    expect(cam.title).toBe('Pergunta B');
    expect(cam.cameraAiPolicy?.questionHash).toBe(await hashQuestion('Pergunta B', 'descB'));
    expect(cam.cameraAiNeedsRevalidation).toBe(false);
    expect(h.maxInFlight()).toBe(1); // I
  });

  it('H: A→B→C durante um voo → não 3 syncs; coalesce para C; resultado final = C', async () => {
    const h = makePageHarness([cameraBlock('A', 'descA', undefined, true)]);
    const g = deferred();
    h.setCompileGate(g);

    const syncPromise = h.handleCameraBlockSync('b1');
    await vi.waitFor(() => expect(h.log).toContain('compile:start'));

    // A em voo → usuário muda para B → depois para C (antes de A terminar)
    h.blocksRef.current = h.blocksRef.current.map((b: any) =>
      b.id === 'b1' ? { ...b, title: 'B', cameraAiNeedsRevalidation: true } : b
    );
    h.blocksRef.current = h.blocksRef.current.map((b: any) =>
      b.id === 'b1' ? { ...b, title: 'C', description: 'descC', cameraAiNeedsRevalidation: true } : b
    );

    g.resolve();
    const result = await syncPromise;

    expect(result).toBe(true);
    const cam = h.persisted.find((b: any) => b.id === 'b1');
    expect(cam.title).toBe('C');
    expect(cam.cameraAiPolicy?.questionHash).toBe(await hashQuestion('C', 'descC'));
    expect(cam.cameraAiNeedsRevalidation).toBe(false);
    // exatamente UMA sync para A (stale) + UMA re-sync para C — B nunca é sincronizada
    const compileStarts = h.log.filter((l) => l === 'compile:start').length;
    expect(compileStarts).toBe(2);
    expect(h.maxInFlight()).toBe(1); // I
  });
});