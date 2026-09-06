import { describe, it, expect, vi } from 'vitest';
import { syncCameraBlockPolicy } from '../policy-sync';
import { hashQuestion } from '../hashing';
import type { CameraVerificationPolicyV1 } from '../schema.functions';

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

function makeHarness() {
  let blocks: any[] = [];
  const calls: string[] = [];
  const compiledRef: { current: CameraVerificationPolicyV1 | undefined } = { current: undefined };
  const persistBlocks = vi.fn(async (next: any[]) => {
    calls.push('persist');
    blocks = next;
    return true;
  });
  const compilePolicy = vi.fn(async () => {
    calls.push('compile');
    return { ok: true, policy: compiledRef.current };
  });
  const applyBlocks = vi.fn((next: any[]) => {
    blocks = next;
  });
  return {
    deps: { getBlocks: () => blocks, persistBlocks, compilePolicy, applyBlocks },
    persistBlocks,
    compilePolicy,
    applyBlocks,
    calls,
    compiledRef,
    setBlocks: (b: any[]) => { blocks = b; },
    getBlocks: () => blocks,
  };
}

describe('syncCameraBlockPolicy — ordem autoritativa (5C.3.3-B)', () => {
  it('A/B: compile só inicia DEPOIS que a persistência da pergunta termina', async () => {
    const h = makeHarness();
    const policy = await validPolicy('Pia limpa?', 'Foto da pia');
    h.compiledRef.current = policy;
    h.setBlocks([cameraBlock('Pia limpa?', 'Foto da pia', undefined, true)]); // stale: sem policy

    let resolvePersist: (v: boolean) => void = () => {};
    const pendingPersist = new Promise<boolean>((r) => { resolvePersist = r; });
    h.persistBlocks.mockImplementationOnce(async (next: any[]) => {
      h.calls.push('persist');
      h.setBlocks(next);
      return pendingPersist;
    });

    const syncPromise = syncCameraBlockPolicy('b1', 'c1', undefined, h.deps);
    await vi.waitFor(() => expect(h.persistBlocks).toHaveBeenCalledTimes(1));

    expect(h.compilePolicy).not.toHaveBeenCalled(); // pendente → compile NÃO inicia

    resolvePersist(true);
    const ok = await syncPromise;

    expect(ok).toBe(true);
    expect(h.compilePolicy).toHaveBeenCalledWith('c1', 'b1');
    expect(h.calls).toEqual(['persist', 'compile', 'persist']);
    expect(h.applyBlocks).toHaveBeenCalledWith(expect.arrayContaining([
      expect.objectContaining({ cameraAiNeedsRevalidation: false, cameraAiPolicy: policy }),
    ]));
  });

  it('C: persistência inicial falha → compile não inicia, revalidation continua true', async () => {
    const h = makeHarness();
    const policy = await validPolicy('Pia limpa?', 'Foto da pia');
    h.compiledRef.current = policy;
    h.setBlocks([cameraBlock('Pia limpa?', 'Foto da pia', undefined, true)]);
    h.persistBlocks.mockResolvedValueOnce(false);

    const ok = await syncCameraBlockPolicy('b1', 'c1', undefined, h.deps);

    expect(ok).toBe(false);
    expect(h.compilePolicy).not.toHaveBeenCalled();
    expect(h.applyBlocks).not.toHaveBeenCalled();
    expect(h.getBlocks()[0].cameraAiNeedsRevalidation).toBe(true);
  });

  it('D: compile retorna policy correta → revalidation NÃO vira false ainda (persistência pendente)', async () => {
    const h = makeHarness();
    const policy = await validPolicy('Pia limpa?', 'Foto da pia');
    h.compiledRef.current = policy;
    h.setBlocks([cameraBlock('Pia limpa?', 'Foto da pia', undefined, true)]);

    let resolvePolicyPersist: (v: boolean) => void = () => {};
    const pendingPolicyPersist = new Promise<boolean>((r) => { resolvePolicyPersist = r; });
    h.persistBlocks.mockResolvedValueOnce(true).mockReturnValueOnce(pendingPolicyPersist);

    const syncPromise = syncCameraBlockPolicy('b1', 'c1', undefined, h.deps);

    await vi.waitFor(() => expect(h.compilePolicy).toHaveBeenCalled());
    // policy correta retornou, mas a persistência dela ainda está pendente:
    // nada foi aplicado localmente e o flag continua true.
    expect(h.applyBlocks).not.toHaveBeenCalled();
    expect(h.getBlocks()[0].cameraAiNeedsRevalidation).toBe(true);

    resolvePolicyPersist(true);
    const ok = await syncPromise;

    expect(ok).toBe(true);
    expect(h.applyBlocks).toHaveBeenCalledWith(expect.arrayContaining([
      expect.objectContaining({ cameraAiPolicy: policy, cameraAiNeedsRevalidation: false }),
    ]));
  });

  it('E: policy correta persistida com sucesso → somente então revalidation false', async () => {
    const h = makeHarness();
    const policy = await validPolicy('Pia limpa?', 'Foto da pia');
    h.compiledRef.current = policy;
    h.setBlocks([cameraBlock('Pia limpa?', 'Foto da pia', undefined, true)]);

    const ok = await syncCameraBlockPolicy('b1', 'c1', undefined, h.deps);

    expect(ok).toBe(true);
    expect(h.calls).toEqual(['persist', 'compile', 'persist']);
    expect(h.applyBlocks).toHaveBeenCalledWith(expect.arrayContaining([
      expect.objectContaining({ cameraAiPolicy: policy, cameraAiNeedsRevalidation: false }),
    ]));
  });

  it('F: persistência da policy falha → revalidation continua true, nada aplicado', async () => {
    const h = makeHarness();
    const policy = await validPolicy('Pia limpa?', 'Foto da pia');
    h.compiledRef.current = policy;
    h.setBlocks([cameraBlock('Pia limpa?', 'Foto da pia', undefined, true)]);
    h.persistBlocks.mockResolvedValueOnce(true).mockResolvedValueOnce(false);

    const ok = await syncCameraBlockPolicy('b1', 'c1', undefined, h.deps);

    expect(ok).toBe(false);
    expect(h.persistBlocks).toHaveBeenCalledTimes(2);
    expect(h.applyBlocks).not.toHaveBeenCalled();
    expect(h.getBlocks()[0].cameraAiNeedsRevalidation).toBe(true);
  });

  it('G: compile retorna hash divergente → policy descartada e NÃO persistida, revalidation true', async () => {
    const h = makeHarness();
    const wrongPolicy = await validPolicy('Outra pergunta', 'Desc');
    h.compiledRef.current = wrongPolicy;
    h.setBlocks([cameraBlock('Pia limpa?', 'Foto da pia', undefined, true)]);

    const ok = await syncCameraBlockPolicy('b1', 'c1', undefined, h.deps);

    expect(ok).toBe(false);
    // apenas a persistência da pergunta aconteceu — a policy stale nunca foi gravada
    expect(h.persistBlocks).toHaveBeenCalledTimes(1);
    const persisted = h.persistBlocks.mock.calls[0][0];
    expect(persisted[0].cameraAiPolicy).toBeUndefined();
    expect(persisted[0].cameraAiNeedsRevalidation).toBe(true);
    expect(h.applyBlocks).not.toHaveBeenCalled();
  });

  it('H: fluxo completo (save) → persist pergunta → compile → validar hash → persist policy → revalidation false', async () => {
    const h = makeHarness();
    const oldPolicy = await validPolicy('Pergunta antiga', 'Desc');
    const newPolicy = await validPolicy('Pergunta nova', 'Desc');
    h.compiledRef.current = newPolicy;
    h.setBlocks([cameraBlock('Pergunta antiga', 'Desc', oldPolicy, false)]);

    const ok = await syncCameraBlockPolicy(
      'b1',
      'c1',
      { title: 'Pergunta nova', cameraAiNeedsRevalidation: true },
      h.deps
    );

    expect(ok).toBe(true);
    expect(h.calls).toEqual(['persist', 'compile', 'persist']);
    const applied = h.applyBlocks.mock.calls[0][0][0];
    expect(applied.cameraAiPolicy.questionHash).toBe(newPolicy.questionHash);
    expect(applied.cameraAiNeedsRevalidation).toBe(false);
  });

  it('pergunta muda durante a operação → policy stale nunca é persistida nem aplicada', async () => {
    const h = makeHarness();
    const policyForA = await validPolicy('Pergunta A', 'Desc');
    h.compiledRef.current = policyForA;
    h.setBlocks([cameraBlock('Pergunta A', 'Desc', undefined, true)]);

    // compile suspenso: permite trocar a pergunta de forma determinística enquanto
    // a sincronização está parada no `await compilePolicy`.
    let resolveCompile: (v: any) => void = () => {};
    h.compilePolicy.mockImplementationOnce(() => new Promise((r) => { resolveCompile = r; }));

    const syncPromise = syncCameraBlockPolicy('b1', 'c1', undefined, h.deps);
    await vi.waitFor(() => expect(h.compilePolicy).toHaveBeenCalled());

    // usuário troca a pergunta enquanto o compile está em voo
    h.setBlocks([cameraBlock('Pergunta B', 'Desc', undefined, true)]);
    resolveCompile({ ok: true, policy: policyForA });

    const ok = await syncPromise;

    expect(ok).toBe(false);
    expect(h.persistBlocks).toHaveBeenCalledTimes(1); // a policy stale nunca foi persistida
    expect(h.applyBlocks).not.toHaveBeenCalled();
    expect(h.getBlocks()[0].cameraAiNeedsRevalidation).toBe(true);
  });

  it('policy já corresponde à pergunta → apenas persiste, sem compile', async () => {
    const h = makeHarness();
    const policy = await validPolicy('Pia limpa?', 'Foto da pia');
    h.setBlocks([cameraBlock('Pia limpa?', 'Foto da pia', policy, false)]);

    const ok = await syncCameraBlockPolicy(
      'b1',
      'c1',
      { title: 'Pia limpa?', description: 'Foto da pia' },
      h.deps
    );

    expect(ok).toBe(true);
    expect(h.compilePolicy).not.toHaveBeenCalled();
    expect(h.persistBlocks).toHaveBeenCalledTimes(1);
  });
});