/**
 * useOptimisticAvatarSelection — política de "clique, apareça, salve".
 *
 * Por que existe separado da tela: a escolha do avatar é a única seleção do
 * produto em que o feedback precisa ser IMEDIATO (a grade inteira muda de estado
 * visual) e, ao mesmo tempo, o salvamento pode falhar. Essa combinação tem duas
 * regras que não podem ficar espalhadas em JSX:
 *
 *   1. OTIMISMO: enquanto a gravação está em voo, a seleção mostrada é a nova.
 *   2. ROLLBACK: em qualquer desfecho a escolha otimista é descartada. No sucesso
 *      o valor salvo já é o novo; em erro a tela volta sozinha ao que está
 *      REALMENTE persistido — nunca fica mostrando um avatar que não foi gravado.
 *
 * GENÉRICO de propósito: a seleção deixou de ser só um id de ilustração e passou
 * a ser o modo + id (`AvatarSelection`, ver @/lib/member-avatar-preference). Como
 * o valor é um objeto novo a cada render, comparar por referência não serviria —
 * por isso quem chama informa `keyOf`, uma chave estável (`"photo"`,
 * `"automatic"`, `"avatar-14"`) usada para "já está selecionado" e para dizer
 * qual opção está salvando.
 *
 * Contrato com quem chama: `savedSelection` é o valor persistido e precisa
 * refletir a escrita ANTES de `save()` resolver (é o caso de `persistSettings` em
 * Configurações, que atualiza o estado local com o mesmo objeto que foi ao
 * banco). Assim otimista → salvo não pisca.
 *
 * Não fala com banco, nem com toast, nem com a fixture: o efeito colateral entra
 * por `save`, e o texto de sucesso/erro é decisão da tela. É o mesmo hook que uma
 * adoção futura em sidebar/equipe/admin pode reutilizar.
 */
import * as React from "react";

/** Resultado do salvamento: nada de exceção para controle de fluxo na tela. */
export type AvatarSelectionSaveResult = { ok: true } | { ok: false; message: string };

export type UseOptimisticAvatarSelectionResult<T> = {
  /** Seleção efetiva hoje: a otimista em voo, ou a última salva. */
  selection: T;
  /** Há um salvamento em voo (trava a galeria para não correr duas escritas). */
  isSaving: boolean;
  /**
   * Chave da opção que está salvando, ou `null` quando nada está em voo (ou no
   * valor de chave `null`, que aqui não existe: toda seleção tem chave).
   */
  pendingKey: string | null;
  /** Seleciona uma opção (só não escreve se ela já estiver ativa). */
  select: (selection: T) => Promise<void>;
};

export function useOptimisticAvatarSelection<T>(
  savedSelection: T,
  keyOf: (selection: T) => string,
  save: (selection: T) => Promise<AvatarSelectionSaveResult>,
): UseOptimisticAvatarSelectionResult<T> {
  /**
   * O otimista fica embrulhado em objeto porque `T` é genérico: sem o embrulho,
   * um `T` que pudesse ser `null` se confundiria com "nada em voo".
   */
  const [pending, setPending] = React.useState<{ value: T } | null>(null);
  const isSaving = pending !== null;

  const selection = pending ? pending.value : savedSelection;

  // `save` e `keyOf` são closures novas a cada render; guardar em ref evita
  // recriar `select` (e re-renderizar a grade inteira) por nada.
  const saveRef = React.useRef(save);
  saveRef.current = save;
  const keyOfRef = React.useRef(keyOf);
  keyOfRef.current = keyOf;

  const savedKey = keyOf(savedSelection);

  const select = React.useCallback(
    async (next: T) => {
      // Clique repetido na opção já ativa, ou clique durante um salvamento em voo,
      // não gera segunda escrita.
      if (pending !== null || keyOfRef.current(next) === savedKey) return;

      setPending({ value: next });

      try {
        await saveRef.current(next);
      } catch (error) {
        // Contrato: `save` devolve `{ ok: false }` em vez de lançar. Se algo
        // escapar mesmo assim, o `finally` abaixo já garante o rollback e a
        // exceção não vira rejeição solta no `onClick`.
        console.error("[useOptimisticAvatarSelection] falha ao salvar avatar:", error);
      } finally {
        // Sempre descarta o otimista — ver ROLLBACK no topo.
        setPending(null);
      }
    },
    [pending, savedKey],
  );

  return {
    selection,
    isSaving,
    pendingKey: pending ? keyOf(pending.value) : null,
    select,
  };
}
