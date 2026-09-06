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
 * - persistBlocks: serializer + confirmação + merge SÍNCRONO da ref autoritativa;
 * - autosave: enfileirado, lendo blocksRef NA EXECUÇÃO (late-bind);
 * - applyBlocks da sync: merge por bloco no estado local.
 */
function makePageLikeDb(initialBlocks: any[]) {
  const serializer = createWriteSerializer();
  const persisted: any[] = [];
  const log: string[] = [];
  let inFlight = 0;
  let maxInFlight = 0;
  const blocksRef: { current: any[] } = { current: initialBlocks };

  const persistBlocks = (nextBlocks: any[]) => serializer.enqueue(async () => {
    const callIndex = log.filter((l) => l.startsWith('sync:start')).length + 1;
    log.push(`sync:start#${callIndex}`);
    inFlight++;
    maxInFlight = Math.max(maxInFlight, inFlight);
    if (gates[callIndex]) await gates[callIndex].promise;
    persisted.splice(0, persisted.length, ...nextBlocks);
    blocksRef.current = mergePersistedBlocksInto(blocksRef.current, nextBlocks);
    inFlight--;
    log.push(`sync:end#${callIndex}`);
    return true;
  });

  const gates: Record<number, { promise: Promise<void>; resolve: () => void }> = {};

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

describe('mergePersistedBlocksInto (5C.3.3-B.2)', () => {
  it('payload persistido é autoritativo para o bloco camera', () => {
    const current = [cameraBlock('A', 'd', undefined, true)];
    const persisted = [{ ...current[0], cameraAiPolicy: { version: 1 } as any, cameraAiNeedsRevalidation: false }];
    const merged = mergePersistedBlocksInto(current, persisted);
    expect(merged[0].cameraAiNeedsRevalidation).toBe(false);
    expect(merged[0].cameraAiPolicy).toEqual({ version: 1 });
  });

  it('bloco não-camera editado durante a persistência (objeto novo) é preservado', () => {
    const textOld = { id: 't1', type: 'text', value: 'original' };
    const textNew = { id: 't1', type: 'text', value: 'editado' };
    const merged = mergePersistedBlocksInto([textNew], [textOld]);
    expect(merged[0].value).toBe('editado');
  });

  it('bloco ausente do payload persistido é preservado', () => {
    const merged = mergePersistedBlocksInto(
      [{ id: 't1', type: 'text', value: 'novo' }],
      [{ id: 'b1', type: 'camera' }]
    );
    expect(merged).toHaveLength(1);
    expect(merged[0].id).toBe('t1');
  });
});

describe('autosave durante persist-policy — late-bind (5C.3.3-B.2)', () => {
  it('A/B/C/H: autosave dispara na SEGUNDA persistência → espera e executa com a policy nova', async () => {
    const db = makePageLikeDb([cameraBlock('Pergunta A', 'Desc', undefined, true)]);
    const policy = await validPolicy('Pergunta A', 'Desc');

    // segura a 2ª persistência (persist-policy); a 1ª roda livre
    db.gates[2] = deferred();

    // snapshot capturado ANTES de esperar na fila (o que NÃO deve ser usado)
    const staleSnapshot = [...db.blocksRef.current];

    const syncPromise = syncCameraBlockPolicy('b1', 'c1', undefined, {
      getBlocks: () => db.blocksRef.current,
      persistBlocks: db.persistBlocks,
      compilePolicy: async () => ({ ok: true, policy }),
      applyBlocks: (next) => { db.blocksRef.current = mergePersistedBlocksInto(db.blocksRef.current, next); },
    });

    // aguarda a SEGUNDA persistência (persist-policy) ficar em voo
    await vi.waitFor(() => expect(db.log.filter((l) => l.startsWith('sync:start')).length).toBe(2));

    // autosave dispara agora: fica atrás na fila; o payload é lido NA EXECUÇÃO
    const autosave = db.autosaveWrite();

    db.gates[2].resolve();
    const [syncResult, autoResult] = await Promise.all([syncPromise, autosave]);

    expect(syncResult).toBe(true);
    expect(db.maxInFlight()).toBe(1); // H: nunca dois writers em voo

    // B: payload obtido no momento da execução — com a policy nova — não no snapshot stale
    expect(autoResult.payload).toBeDefined();
    const camPayload = autoResult.payload.find((b: any) => b.id === 'b1');
    expect(camPayload.cameraAiPolicy?.questionHash).toBe(policy.questionHash);
    expect(camPayload.cameraAiNeedsRevalidation).toBe(false);
    expect(staleSnapshot[0].cameraAiPolicy).toBeUndefined(); // snapshot pré-fila era stale

    // C: estado final no banco continua com a policy nova
    const camFinal = db.persisted.find((b: any) => b.id === 'b1');
    expect(camFinal.cameraAiPolicy?.questionHash).toBe(policy.questionHash);
    expect(camFinal.cameraAiNeedsRevalidation).toBe(false);
    expect(camFinal.title).toBe('Pergunta A');

    // ordem: persist-pergunta → persist-policy → autosave (nunca o contrário)
    expect(db.log[db.log.length - 1]).toBe('autosave:end');
    expect(db.log.indexOf('sync:end#2')).toBeLessThan(db.log.indexOf('autosave:start'));
  });

  it('F: edição em OUTRO bloco durante persist-policy → autosave posterior mantém ambos', async () => {
    const db = makePageLikeDb([
      cameraBlock('Pergunta A', 'Desc', undefined, true),
      { id: 't1', type: 'text', value: 'original' },
    ]);
    const policy = await validPolicy('Pergunta A', 'Desc');
    db.gates[2] = deferred();

    const syncPromise = syncCameraBlockPolicy('b1', 'c1', undefined, {
      getBlocks: () => db.blocksRef.current,
      persistBlocks: db.persistBlocks,
      compilePolicy: async () => ({ ok: true, policy }),
      applyBlocks: (next) => { db.blocksRef.current = mergePersistedBlocksInto(db.blocksRef.current, next); },
    });

    await vi.waitFor(() => expect(db.log.filter((l) => l.startsWith('sync:start')).length).toBe(2));

    // usuário edita o bloco de texto enquanto persist-policy está em voo
    db.blocksRef.current = db.blocksRef.current.map((b: any) =>
      b.id === 't1' ? { ...b, value: 'editado-durante-sync' } : b
    );
    const autosave = db.autosaveWrite();

    db.gates[2].resolve();
    await Promise.all([syncPromise, autosave]);

    const cam = db.persisted.find((b: any) => b.id === 'b1');
    const txt = db.persisted.find((b: any) => b.id === 't1');
    expect(cam.cameraAiPolicy?.questionHash).toBe(policy.questionHash);
    expect(cam.cameraAiNeedsRevalidation).toBe(false);
    expect(txt.value).toBe('editado-durante-sync');
    expect(db.maxInFlight()).toBe(1);
  });

  it('D: autosave durante a PRIMEIRA persistência → espera na fila; estado final fica com a policy', async () => {
    const db = makePageLikeDb([cameraBlock('Pergunta A', 'Desc', undefined, true)]);
    const policy = await validPolicy('Pergunta A', 'Desc');
    db.gates[1] = deferred();

    const syncPromise = syncCameraBlockPolicy('b1', 'c1', undefined, {
      getBlocks: () => db.blocksRef.current,
      persistBlocks: db.persistBlocks,
      compilePolicy: async () => ({ ok: true, policy }),
      applyBlocks: (next) => { db.blocksRef.current = mergePersistedBlocksInto(db.blocksRef.current, next); },
    });

    await vi.waitFor(() => expect(db.log.filter((l) => l.startsWith('sync:start')).length).toBe(1));

    // autosave dispara durante a PRIMEIRA persistência → espera na fila
    const autosave = db.autosaveWrite();

    db.gates[1].resolve();
    const [syncResult, autoResult] = await Promise.all([syncPromise, autosave]);

    expect(syncResult).toBe(true);
    // o autosave roda ENTRE persist-pergunta e persist-policy (payload ainda
    // sem policy, pois a policy só existe após o compile); o write FINAL da
    // sync (persist-policy) é quem deixa o estado autoritativo.
    expect(db.log.indexOf('autosave:start')).toBeGreaterThan(db.log.indexOf('sync:end#1'));
    expect(db.log.indexOf('sync:start#2')).toBeGreaterThan(db.log.indexOf('autosave:end'));
    const camFinal = db.persisted.find((b: any) => b.id === 'b1');
    expect(camFinal.cameraAiPolicy?.questionHash).toBe(policy.questionHash);
    expect(camFinal.cameraAiNeedsRevalidation).toBe(false);
    expect(autoResult.payload).toBeDefined();
    expect(db.maxInFlight()).toBe(1);
  });
});