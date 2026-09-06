export interface AutosaveCoalescer {
  /**
   * Timer do autosave disparou. Retorna `true` quando o autosave pode executar
   * agora; `false` quando um save está em voo — nesse caso a solicitação é
   * marcada como pendente e coalescida (N solicitações viram 1).
   */
  onTick: (isSaving: boolean) => boolean;
  /**
   * Fim de um save. Retorna `true` se deve executar exatamente UM autosave
   * coalescido com o estado MAIS RECENTE; `false` se não havia nada pendente.
   */
  consumePending: () => boolean;
  isPending: () => boolean;
}

/**
 * 5C.3.3-B.2 — autosave solicitado durante outro save não é perdido.
 *
 * Máquina mínima de pending/coalescing usada pela página:
 *
 *   timer do autosave dispara durante um save
 *   → onTick(true) marca pendente (sem iniciar writer concorrente)
 *   → quando o save atual terminar (finally), consumePending()
 *   → se true: UM autosave posterior roda com o estado mais recente
 *
 * 5 mudanças durante um save NÃO geram 5 writes: viram 1 autosave coalescido.
 * Sem recursão infinita: cada save consumido limpa o flag; um novo pending só
 * pode surgir de um timer real disparado durante o save seguinte.
 */
export function createAutosaveCoalescer(): AutosaveCoalescer {
  let pending = false;

  return {
    onTick(isSaving: boolean): boolean {
      if (isSaving) {
        pending = true;
        return false;
      }
      return true;
    },
    consumePending(): boolean {
      if (pending) {
        pending = false;
        return true;
      }
      return false;
    },
    isPending(): boolean {
      return pending;
    },
  };
}