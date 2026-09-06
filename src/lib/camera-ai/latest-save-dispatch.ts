import type { AutosaveCoalescer } from './autosave-coalescer';

/**
 * 5C.3.3-B.3 — autosave coalescido NUNCA roda pela closure antiga.
 *
 * A fila FIFO (B.1) serializa writers e o late-bind (B.2) garante que `blocks`
 * sejam lidos NA EXECUÇÃO do write. Porém o `checklistData` (title, theme,
 * font, colors, settings, notificações, retention, branding, etc.) é montado
 * a partir da CLOSURE do `saveChecklist` que iniciou o save. Se o usuário
 * editar durante um save em voo, a nova renderização cria uma closure NOVA —
 * e o autosave pendente precisa rodar por ELA, nunca pela closure do save que
 * acabou de terminar.
 *
 * Uso na página (espelhado nos testes):
 *
 *   const latestSaveDispatch = useRef(createLatestSaveDispatch<SaveChecklistFn>()).current;
 *
 *   const saveChecklist = useCallback(async (...) => { ... }, [deps]);
 *   latestSaveDispatch.registerLatestSave(saveChecklist); // chamado a cada render
 *
 *   } finally {
 *     // consome a pendência e dispara UM save pela closure MAIS RECENTE
 *     if (user) latestSaveDispatch.finishSave(pendingAutosaveCoalescer, user, targetId ? undefined : false, true);
 *   }
 *
 * Sem loop: `finishSave` consome a pendência exatamente uma vez; uma nova
 * pendência só pode surgir de um timer real disparado durante o save seguinte.
 */
export interface LatestSaveDispatch<TFn extends (...args: any[]) => any> {
  /** Chamado a cada renderização com o `saveChecklist` mais recente. */
  registerLatestSave(cb: TFn): void;
  /** Retorna o `saveChecklist` da renderização mais recente. */
  getLatestSave(): TFn | null;
  /**
   * Fim de um save. Se o coalescer tem autosave pendente, consome a pendência
   * e dispara EXATAMENTE UM save pela closure MAIS RECENTE (nunca pela closure
   * do save que acabou de terminar). Retorna `true` quando um save foi
   * disparado, `false` quando não havia pendência (ou nenhuma closure
   * registrada — que não pode acontecer na página, pois registerLatestSave
   * roda a cada render antes de qualquer save).
   */
  finishSave(coalescer: AutosaveCoalescer, ...args: Parameters<TFn>): boolean;
}

export function createLatestSaveDispatch<TFn extends (...args: any[]) => any>(): LatestSaveDispatch<TFn> {
  let latest: TFn | null = null;
  return {
    registerLatestSave(cb: TFn): void {
      latest = cb;
    },
    getLatestSave(): TFn | null {
      return latest;
    },
    finishSave(coalescer: AutosaveCoalescer, ...args: Parameters<TFn>): boolean {
      if (!coalescer.consumePending()) return false;
      const cb = latest;
      if (!cb) return false;
      cb(...args);
      return true;
    },
  };
}