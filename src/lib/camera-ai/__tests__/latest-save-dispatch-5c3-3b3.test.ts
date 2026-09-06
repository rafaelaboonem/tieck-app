import { describe, it, expect, vi } from 'vitest';
import { createLatestSaveDispatch } from '../latest-save-dispatch';
import { createAutosaveCoalescer } from '../autosave-coalescer';
import { createWriteSerializer } from '../write-serializer';

type SaveFn = (silent: boolean) => Promise<void>;

function deferred<T = void>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((res) => { resolve = res; });
  return { promise, resolve };
}

/**
 * 5C.3.3-B.3 — espelha EXATAMENTE a orquestração da página:
 *
 * - `saveChecklist` monta o `checklistData` (title, theme, settings...) a partir
 *   da CLOSURE da renderização (como a página faz no topo da função);
 * - `blocks` são late-bound: lidos de uma ref DENTRO do op serializado (B.2);
 * - `registerLatestSave` é chamado a cada "render" com a closure mais recente;
 * - timer do autosave → `coalescer.onTick(isSaving)`;
 * - finally de um save → `dispatch.finishSave(coalescer, ...)`.
 *
 * A única diferença intencional em relação à página: title/theme são parâmetros
 * da closure simulada (em vez de estado React), o que reproduz exatamente o
 * risco de callbacks React capturarem valores de uma renderização antiga.
 */
function makePageHarness() {
  const serializer = createWriteSerializer();
  const coalescer = createAutosaveCoalescer();
  const dispatch = createLatestSaveDispatch<SaveFn>();
  const stateRef: { current: any[] } = { current: [{ id: 'b1', type: 'camera' }] };
  const writes: Array<{ title: string; theme: string; blocks: any[] }> = [];
  let gate: { promise: Promise<void>; resolve: () => void } | null = null;
  let inFlight = 0;
  let maxInFlight = 0;

  // espelha o saveChecklist da página: checklistData da closure, blocks late-bound
  function makeSaveClosure(title: string, theme: string): SaveFn {
    return async (silent: boolean) => {
      await serializer.enqueue(async () => {
        inFlight++;
        maxInFlight = Math.max(maxInFlight, inFlight);
        try {
          if (gate) await gate.promise;
          const payload = { title, theme, blocks: [...stateRef.current] };
          writes.push(payload);
        } finally {
          inFlight--;
        }
      });
    };
  }

  return {
    serializer,
    coalescer,
    dispatch,
    stateRef,
    writes,
    makeSaveClosure,
    setGate: (g: { promise: Promise<void>; resolve: () => void }) => { gate = g; },
    maxInFlight: () => maxInFlight,
  };
}

describe('latest-save-dispatch (5C.3.3-B.3) — closure antiga', () => {
  it('A→B obrigatório: save em voo com title "Versão A" → render "Versão B" → autosave coalescido persiste "Versão B", nunca "Versão A"', async () => {
    const h = makePageHarness();

    // render A: closure captura title "Versão A"
    const saveA = h.makeSaveClosure('Versão A', 'dark');
    h.dispatch.registerLatestSave(saveA);

    // save A começa e fica em voo na fila (gate)
    const g = deferred();
    h.setGate(g);
    const saveAPromise = saveA(true);

    // durante o save: NOVA renderização → nova closure com title "Versão B"
    const saveB = h.makeSaveClosure('Versão B', 'light');
    h.dispatch.registerLatestSave(saveB);

    // timer do autosave dispara enquanto o save está em voo → pendente
    expect(h.coalescer.onTick(true)).toBe(false);
    expect(h.coalescer.isPending()).toBe(true);

    // save A termina
    g.resolve();
    await saveAPromise;
    expect(h.writes).toHaveLength(1);
    expect(h.writes[0].title).toBe('Versão A');

    // finally: consome a pendência e dispara UM save pela closure MAIS RECENTE
    expect(h.dispatch.finishSave(h.coalescer, true)).toBe(true);
    expect(h.coalescer.isPending()).toBe(false);

    await vi.waitFor(() => expect(h.writes).toHaveLength(2));
    expect(h.writes[1].title).toBe('Versão B'); // NUNCA 'Versão A'
    expect(h.writes[1].theme).toBe('light');
    expect(h.maxInFlight()).toBe(1); // H: nunca dois writers em voo
    expect(h.dispatch.finishSave(h.coalescer, true)).toBe(false); // sem loop
  });

  it('demonstra o risco pré-B.3: dispatch pela closure do save que terminou gravaria "Versão A"', async () => {
    const h = makePageHarness();
    const saveA = h.makeSaveClosure('Versão A', 'dark');
    h.dispatch.registerLatestSave(saveA);

    const g = deferred();
    h.setGate(g);
    const saveAPromise = saveA(true);

    // render B durante o save em voo (closure nova registrada, mas o BUG usa a antiga)
    const saveB = h.makeSaveClosure('Versão B', 'light');
    h.dispatch.registerLatestSave(saveB);
    expect(h.coalescer.onTick(true)).toBe(false);

    g.resolve();
    await saveAPromise;

    // ANTES da B.3, o finally chamava `saveChecklist(...)` — a MESMA closure do
    // save que acabou de terminar (saveA), ignorando a renderização B:
    if (h.coalescer.consumePending()) await saveA(true);
    await vi.waitFor(() => expect(h.writes).toHaveLength(2));
    expect(h.writes[1].title).toBe('Versão A'); // BUG: persistiria o título antigo
  });

  it('outro setting fora de blocks: theme muda durante o save → write coalescido usa o theme NOVO', async () => {
    const h = makePageHarness();

    const saveA = h.makeSaveClosure('Pergunta', 'dark');
    h.dispatch.registerLatestSave(saveA);

    const g = deferred();
    h.setGate(g);
    const saveAPromise = saveA(true);

    // render B muda apenas o theme
    const saveB = h.makeSaveClosure('Pergunta', 'light');
    h.dispatch.registerLatestSave(saveB);
    expect(h.coalescer.onTick(true)).toBe(false);

    g.resolve();
    await saveAPromise;
    expect(h.dispatch.finishSave(h.coalescer, true)).toBe(true);

    await vi.waitFor(() => expect(h.writes).toHaveLength(2));
    expect(h.writes[1].theme).toBe('light'); // theme novo, não 'dark'
    expect(h.writes[1].title).toBe('Pergunta');
  });

  it('coalescing preservado: 5 solicitações durante o save → exatamente UM autosave posterior', async () => {
    const h = makePageHarness();
    const saveA = h.makeSaveClosure('Versão A', 'dark');
    h.dispatch.registerLatestSave(saveA);
    const saveB = h.makeSaveClosure('Versão B', 'light');
    h.dispatch.registerLatestSave(saveB);

    const saveAPromise = saveA(true);
    for (let i = 0; i < 5; i++) {
      expect(h.coalescer.onTick(true)).toBe(false);
    }
    expect(h.coalescer.isPending()).toBe(true);
    await saveAPromise;

    expect(h.dispatch.finishSave(h.coalescer, true)).toBe(true); // exatamente UM
    await vi.waitFor(() => expect(h.writes).toHaveLength(2));
    expect(h.writes[1].title).toBe('Versão B');
    expect(h.writes).toHaveLength(2); // nenhum write extra
    expect(h.dispatch.finishSave(h.coalescer, true)).toBe(false); // sem cascata
  });

  it('sem pendência → finishSave não dispara nada', async () => {
    const h = makePageHarness();
    const saveA = h.makeSaveClosure('Versão A', 'dark');
    h.dispatch.registerLatestSave(saveA);

    await saveA(true);
    expect(h.dispatch.finishSave(h.coalescer, true)).toBe(false);
    expect(h.writes).toHaveLength(1);
  });

  it('blocks continuam late-bound (B.2 preservado): write posterior lê a ref atual, não o snapshot pré-fila', async () => {
    const h = makePageHarness();
    const saveA = h.makeSaveClosure('Versão A', 'dark');
    h.dispatch.registerLatestSave(saveA);
    const saveB = h.makeSaveClosure('Versão B', 'light');
    h.dispatch.registerLatestSave(saveB);

    const g = deferred();
    h.setGate(g);
    const saveAPromise = saveA(true);

    // edição de blocks durante o save em voo (ref atualizada por um fluxo autoritativo)
    h.stateRef.current = [...h.stateRef.current, { id: 'b2', type: 'text', value: 'novo' }];
    expect(h.coalescer.onTick(true)).toBe(false);

    g.resolve();
    await saveAPromise;
    expect(h.dispatch.finishSave(h.coalescer, true)).toBe(true);

    await vi.waitFor(() => expect(h.writes).toHaveLength(2));
    expect(h.writes[1].blocks).toHaveLength(2); // blocks lidos NA EXECUÇÃO
    expect(h.writes[1].blocks[1].id).toBe('b2');
  });
});