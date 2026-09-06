import { describe, it, expect, vi } from 'vitest';
import { syncCameraBlockPolicy } from '../policy-sync';
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

function cameraBlock(
  title: string,
  description: string,
  policy?: CameraVerificationPolicyV1,
  revalidation?: boolean,
  mode?: string,
  extra?: Record<string, unknown>
) {
  return {
    id: 'b1',
    type: 'camera',
    title,
    description,
    cameraAiPolicy: policy,
    cameraAiNeedsRevalidation: revalidation,
    mode,
    ...extra,
  };
}

describe('mergePersistedBlocksInto — MESMA pergunta preserva edições locais não-pergunta (5C.3.3-C.1)', () => {
  it('A: mesma pergunta → mode local (reference) preservado + policy nova + revalidation false', async () => {
    const policy = await validPolicy('Pergunta A', 'descA');
    const local = cameraBlock('Pergunta A', 'descA', undefined, true, 'reference');
    const persisted = cameraBlock('Pergunta A', 'descA', policy, false, 'auto');

    const merged = await mergePersistedBlocksInto([local], [persisted]);

    expect(merged[0].mode).toBe('reference'); // edição local mais nova vence
    expect(merged[0].cameraAiPolicy).toEqual(policy); // policy sync é autoritativa
    expect(merged[0].cameraAiNeedsRevalidation).toBe(false);
    expect(merged[0].title).toBe('Pergunta A');
  });

  it('B: mesma pergunta → required alterado localmente é preservado', async () => {
    const policy = await validPolicy('Pergunta A', 'descA');
    const local = cameraBlock('Pergunta A', 'descA', undefined, true, 'auto', { required: true });
    const persisted = cameraBlock('Pergunta A', 'descA', policy, false, 'auto', { required: false });

    const merged = await mergePersistedBlocksInto([local], [persisted]);

    expect(merged[0].required).toBe(true); // edição local preservada
    expect(merged[0].cameraAiPolicy).toEqual(policy);
    expect(merged[0].cameraAiNeedsRevalidation).toBe(false);
  });

  it('C: mesma pergunta → cameraReference local mais novo é preservado', async () => {
    const policy = await validPolicy('Pergunta A', 'descA');
    const local = cameraBlock('Pergunta A', 'descA', undefined, true, 'reference', {
      cameraReference: { storagePath: 'referencia-nova.png', sha256: 'novo' },
    });
    const persisted = cameraBlock('Pergunta A', 'descA', policy, false, 'reference', {
      cameraReference: { storagePath: 'referencia-antiga.png', sha256: 'antigo' },
    });

    const merged = await mergePersistedBlocksInto([local], [persisted]);

    expect(merged[0].cameraReference.storagePath).toBe('referencia-nova.png'); // referência nova
    expect(merged[0].cameraAiPolicy).toEqual(policy);
    expect(merged[0].cameraAiNeedsRevalidation).toBe(false);
  });

  it('D: pergunta mudou → comportamento da C intacto: bloco local vence COMPLETO, policy antiga não vira ready', async () => {
    const policyA = await validPolicy('Pergunta A', 'descA');
    const local = cameraBlock('Pergunta B', 'descB', undefined, true, 'reference', { required: true });
    const persisted = cameraBlock('Pergunta A', 'descA', policyA, false, 'auto', { required: false });

    const merged = await mergePersistedBlocksInto([local], [persisted]);

    expect(merged[0]).toEqual(local); // vence por completo
    expect(merged[0].title).toBe('Pergunta B');
    expect(merged[0].mode).toBe('reference');
    expect(merged[0].required).toBe(true);
    expect(merged[0].cameraAiPolicy).toBeUndefined();
    expect(merged[0].cameraAiNeedsRevalidation).toBe(true);
  });
});

/**
 * Espelha a orquestração da página (mesmo padrão dos testes B.2/C): persist
 * serializado + merge na ref autoritativa, compile, autosave enfileirado.
 */
function makePageLikeDb(initialBlocks: any[]) {
  const serializer = createWriteSerializer();
  const persisted: any[] = [];
  const log: string[] = [];
  let inFlight = 0;
  let maxInFlight = 0;
  const blocksRef: { current: any[] } = { current: initialBlocks };
  const gates: Record<number, { promise: Promise<void>; resolve: () => void }> = {};

  const persistBlocks = (nextBlocks: any[]) => serializer.enqueue(async () => {
    const callIndex = log.filter((l) => l.startsWith('sync:start')).length + 1;
    log.push(`sync:start#${callIndex}`);
    inFlight++;
    maxInFlight = Math.max(maxInFlight, inFlight);
    if (gates[callIndex]) await gates[callIndex].promise;
    persisted.splice(0, persisted.length, ...nextBlocks);
    blocksRef.current = await mergePersistedBlocksInto(blocksRef.current, nextBlocks);
    inFlight--;
    log.push(`sync:end#${callIndex}`);
    return true;
  });

  const autosaveWrite = () => serializer.enqueue(async () => {
    log.push('autosave:start');
    inFlight++;
    maxInFlight = Math.max(maxInFlight, inFlight);
    const payload = [...blocksRef.current]; // late-bind: lido NA EXECUÇÃO
    persisted.splice(0, persisted.length, ...payload);
    inFlight--;
    log.push('autosave:end');
    return { payload };
  });

  return { serializer, persisted, log, persistBlocks, autosaveWrite, blocksRef, gates, maxInFlight: () => maxInFlight };
}

describe('integração com fila — mode alterado durante persist-policy (5C.3.3-C.1)', () => {
  it('E: persist-policy em voo → usuário altera mode da MESMA pergunta → merge não apaga o mode novo → autosave grava estado final', async () => {
    const db = makePageLikeDb([cameraBlock('Pergunta A', 'desc', undefined, true, 'auto')]);
    const policy = await validPolicy('Pergunta A', 'desc');
    db.gates[2] = deferred(); // 2ª persistência = persist-policy, em voo

    const syncPromise = syncCameraBlockPolicy('b1', 'c1', undefined, {
      getBlocks: () => db.blocksRef.current,
      persistBlocks: db.persistBlocks,
      compilePolicy: async () => ({ ok: true, policy }),
      applyBlocks: async (next) => { db.blocksRef.current = await mergePersistedBlocksInto(db.blocksRef.current, next); },
    });

    await vi.waitFor(() => expect(db.log.filter((l) => l.startsWith('sync:start')).length).toBe(2));

    // usuário altera mode (MESMA pergunta) durante persist-policy
    db.blocksRef.current = db.blocksRef.current.map((b: any) =>
      b.id === 'b1' ? { ...b, mode: 'reference' } : b
    );
    const autosave = db.autosaveWrite(); // fica na fila atrás do persist-policy

    db.gates[2].resolve();
    const [syncResult, autoResult] = await Promise.all([syncPromise, autosave]);

    expect(syncResult).toBe(true);
    // merge NÃO apagou o mode novo na ref autoritativa
    expect(db.blocksRef.current.find((b: any) => b.id === 'b1').mode).toBe('reference');

    // autosave posterior grava o estado final: mode novo + policy nova + hash correto + revalidation false
    const camFinal = db.persisted.find((b: any) => b.id === 'b1');
    expect(camFinal.mode).toBe('reference');
    expect(camFinal.cameraAiPolicy?.questionHash).toBe(policy.questionHash);
    expect(camFinal.cameraAiNeedsRevalidation).toBe(false);
    expect(autoResult.payload.find((b: any) => b.id === 'b1').mode).toBe('reference');
    expect(db.maxInFlight()).toBe(1);
  });
});