import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  ensureCanonicalResponseSession,
  resolveCameraActiveSession,
  assertSameResponseSession,
  type ResponseSession,
} from '../execution-response-session';

const HOUR = 60 * 60 * 1000;

function memoryPersistence(initial?: ResponseSession | null) {
  let store: ResponseSession | null = initial ?? null;
  return {
    read: () => store,
    write: (_cid: string, s: ResponseSession) => {
      store = s;
    },
    clear: () => {
      store = null;
    },
    current: () => store,
  };
}

function inflightRegistry() {
  let current: Promise<ResponseSession | null> | null = null;
  return {
    get: () => current,
    set: (p: Promise<ResponseSession | null> | null) => {
      current = p;
    },
  };
}

function makeCreateCounter() {
  let calls = 0;
  const create = vi.fn(async (cid: string): Promise<ResponseSession> => {
    calls += 1;
    return { responseId: `r-${calls}`, responseToken: `t-${calls}`, checklistId: cid, createdAt: Date.now() };
  });
  return { create, calls: () => calls };
}

const session = (over: Partial<ResponseSession> & { responseId: string; responseToken: string }): ResponseSession => ({
  checklistId: 'c1',
  createdAt: Date.now(),
  ...over,
});

describe('Execution 6A.3.2 — contrato de linkage (seção 5)', () => {
  it('câmera primeiro → submit depois: mesma resposta R1/T1, create uma única vez', async () => {
    const persistence = memoryPersistence();
    const inflight = inflightRegistry();
    const { create, calls } = makeCreateCounter();

    // 1. Camera block chama ensure → R1/T1
    const cameraSession = await ensureCanonicalResponseSession({
      checklistId: 'c1',
      persistence,
      inflight,
      create,
    });

    // 2. verify usa T1 → camera_ai_attempts.response_id = R1
    const verifyResponseId = cameraSession!.responseId; // resolve_public_response(T1)

    // 3. submit chama ensure → reutiliza R1/T1 (não cria outra resposta)
    const submitSession = await ensureCanonicalResponseSession({
      checklistId: 'c1',
      persistence,
      inflight,
      create,
    });

    // 4. finalize_public_response usa T1 → finaliza R1
    expect(submitSession!.responseToken).toBe(cameraSession!.responseToken);
    expect(submitSession!.responseId).toBe(cameraSession!.responseId);
    expect(verifyResponseId).toBe(cameraSession!.responseId);
    expect(assertSameResponseSession(cameraSession, submitSession)).toBe(true);

    // 5. consultas por R1 encontram as tentativas de R1
    expect(submitSession!.responseId).toBe('r-1');
    expect(calls()).toBe(1);
  });

  it('B) submit sem câmera: comportamento atual preservado (uma sessão criada e finalizada)', async () => {
    const persistence = memoryPersistence();
    const inflight = inflightRegistry();
    const { create, calls } = makeCreateCounter();

    const submitSession = await ensureCanonicalResponseSession({ checklistId: 'c1', persistence, inflight, create });
    expect(submitSession!.responseId).toBe('r-1');
    expect(calls()).toBe(1);
  });
});

describe('Execution 6A.3.2 — casos obrigatórios A–H', () => {
  it('A) câmera primeiro → submit depois: mesma sessão', async () => {
    const persistence = memoryPersistence();
    const inflight = inflightRegistry();
    const { create } = makeCreateCounter();

    const camera = await ensureCanonicalResponseSession({ checklistId: 'c1', persistence, inflight, create });
    const submit = await ensureCanonicalResponseSession({ checklistId: 'c1', persistence, inflight, create });
    expect(assertSameResponseSession(camera, submit)).toBe(true);
  });

  it('C) múltiplas verificações/retries na mesma resposta → mesmo response_id, create uma vez', async () => {
    const persistence = memoryPersistence();
    const inflight = inflightRegistry();
    const { create, calls } = makeCreateCounter();

    const first = await ensureCanonicalResponseSession({ checklistId: 'c1', persistence, inflight, create });
    for (let i = 0; i < 3; i++) {
      const again = await ensureCanonicalResponseSession({ checklistId: 'c1', persistence, inflight, create });
      expect(again!.responseId).toBe(first!.responseId);
      expect(again!.responseToken).toBe(first!.responseToken);
    }
    expect(calls()).toBe(1);
  });

  it('D) reload com sessionStorage válida → reutiliza a mesma sessão (sem create)', async () => {
    const persistence = memoryPersistence(
      session({ responseId: 'r-1', responseToken: 't-1' })
    );
    const { create, calls } = makeCreateCounter();

    const reloaded = await ensureCanonicalResponseSession({
      checklistId: 'c1',
      persistence: persistence as any,
      inflight: inflightRegistry(), // novo registry = nova página
      create,
    });
    expect(reloaded!.responseId).toBe('r-1');
    expect(reloaded!.responseToken).toBe('t-1');
    expect(calls()).toBe(0);
  });

  it('E) sessão expirada → nova sessão criada corretamente', async () => {
    const expired = session({
      responseId: 'r-old',
      responseToken: 't-old',
      createdAt: Date.now() - 25 * HOUR,
    });
    const persistence = memoryPersistence(expired);
    const { create, calls } = makeCreateCounter();

    const fresh = await ensureCanonicalResponseSession({
      checklistId: 'c1',
      persistence: persistence as any,
      inflight: inflightRegistry(),
      create,
      isExpired: (s) => Date.now() - s.createdAt > 23 * HOUR,
    });
    expect(fresh!.responseId).toBe('r-1');
    expect(fresh!.responseToken).toBe('t-1');
    expect(persistence.current()!.responseId).toBe('r-1');
    expect(calls()).toBe(1);
  });

  it('F) após envio concluído e clear → nova execução cria nova resposta', async () => {
    const persistence = memoryPersistence();
    const { create, calls } = makeCreateCounter();

    const first = await ensureCanonicalResponseSession({ checklistId: 'c1', persistence, inflight: inflightRegistry(), create });
    // clearResponseSession após o submit
    persistence.clear();
    const second = await ensureCanonicalResponseSession({ checklistId: 'c1', persistence, inflight: inflightRegistry(), create });
    expect(second!.responseId).not.toBe(first!.responseId);
    expect(calls()).toBe(2);
  });

  it('G) duplo clique/concurrency → responseSessionPromise dedup: create uma única vez', async () => {
    const persistence = memoryPersistence();
    const inflight = inflightRegistry();
    let resolveCreate: (s: ResponseSession) => void = () => {};
    let createCalls = 0;
    const create = () =>
      new Promise<ResponseSession>((res) => {
        createCalls += 1;
        resolveCreate = res;
      });

    const p1 = ensureCanonicalResponseSession({ checklistId: 'c1', persistence, inflight, create });
    const p2 = ensureCanonicalResponseSession({ checklistId: 'c1', persistence, inflight, create });
    expect(createCalls).toBe(1); // nenhum segundo create disparado

    resolveCreate(session({ responseId: 'r-1', responseToken: 't-1' }));
    const [s1, s2] = await Promise.all([p1, p2]);
    expect(createCalls).toBe(1);
    expect(assertSameResponseSession(s1, s2)).toBe(true);
  });

  it('H) forceNew rotaciona a sessão e o verify seguinte usa a sessão ATUAL (nunca um prop stale)', async () => {
    const persistence = memoryPersistence();
    const { create, calls } = makeCreateCounter();

    const before = await ensureCanonicalResponseSession({ checklistId: 'c1', persistence, inflight: inflightRegistry(), create });
    expect(before!.responseId).toBe('r-1');

    // Recovery path: 401 → ensureResponseSession({ forceNew: true })
    const rotated = await ensureCanonicalResponseSession({
      checklistId: 'c1',
      persistence,
      inflight: inflightRegistry(),
      create,
      forceNew: true,
    });
    expect(rotated!.responseId).toBe('r-2');
    expect(calls()).toBe(2);

    // Próxima verificação resolve a sessão canônica ATUAL (r-2), nunca o snapshot antigo.
    const nextVerify = await resolveCameraActiveSession({
      sessionOverride: null,
      ensureResponseSession: () => ensureCanonicalResponseSession({ checklistId: 'c1', persistence, inflight: inflightRegistry(), create }),
    });
    expect(nextVerify!.responseId).toBe('r-2');
    expect(nextVerify!.responseToken).toBe('t-2');
  });
});

describe('Execution 6A.3.2 — resolveCameraActiveSession (verificação nunca usa prop stale)', () => {
  it('sem override → usa o resultado atual de ensureResponseSession', async () => {
    const ensureResponseSession = vi.fn(async () =>
      session({ responseId: 'r-current', responseToken: 't-current' })
    );
    const active = await resolveCameraActiveSession({ sessionOverride: null, ensureResponseSession });
    expect(active!.responseId).toBe('r-current');
    expect(ensureResponseSession).toHaveBeenCalledTimes(1);
  });

  it('com override (retry de recovery) → respeita o override explícito', async () => {
    const ensureResponseSession = vi.fn(async () =>
      session({ responseId: 'r-current', responseToken: 't-current' })
    );
    const active = await resolveCameraActiveSession({
      sessionOverride: session({ responseId: 'r-override', responseToken: 't-override' }),
      ensureResponseSession,
    });
    expect(active!.responseId).toBe('r-override');
    expect(ensureResponseSession).not.toHaveBeenCalled();
  });
});

describe('Execution 6A.3.2 — wiring estrutural', () => {
  const cameraSource = readFileSync(resolve(process.cwd(), 'src/components/PublicCameraBlock.tsx'), 'utf8');
  const engineSource = readFileSync(resolve(process.cwd(), 'src/components/ExecutionEngine.tsx'), 'utf8');

  it('PublicCameraBlock resolve a sessão via ensureResponseSession, sem preferir prop snapshot', () => {
    expect(cameraSource).toContain('resolveCameraActiveSession(');
    // Não existe mais cadeia `session ?? ...` para o token.
    expect(cameraSource).not.toMatch(/session\s*\?\?\s*\(?await ensureResponseSession/);
    // Interface não expõe mais o prop `session`.
    expect(cameraSource).not.toMatch(/session\?: \{ responseId: string; responseToken: string \}/);
  });

  it('ExecutionEngine não passa mais `session=` ao PublicCameraBlock', () => {
    expect(engineSource).not.toContain('session={readResponseSession()}');
  });

  it('ExecutionEngine usa o resolver canônico compartilhado e preserva o dedup in-flight', () => {
    expect(engineSource).toContain('ensureCanonicalResponseSession(');
    expect(engineSource).toContain('responseSessionPromise');
  });

  it('verify e submit usam o mesmo ensureResponseSession (fonte única)', () => {
    // O submit chama ensureResponseSession() e o camera block recebe a MESMA função.
    expect(engineSource).toContain('const session = await ensureResponseSession();');
    expect(engineSource).toContain('ensureResponseSession={ensureResponseSession}');
  });
});