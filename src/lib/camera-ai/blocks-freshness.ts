/**
 * 5C.3.3-B.2 — mantém a ref autoritativa (blocksRef) fresca após uma
 * persistência confirmada, sem clobberar edições mais novas.
 *
 * Regras por bloco:
 * - bloco ausente do payload persistido → preserva a versão local (edição
 *   mais nova que não fazia parte do payload);
 * - mesmo objeto de referência → inalterado;
 * - bloco `camera` → o payload persistido é autoritativo (policy nova,
 *   questionHash, revalidation);
 * - bloco não-camera com objeto DIFERENTE → edição local mais nova durante a
 *   persistência → preserva a versão local.
 *
 * A comparação por identidade é segura porque o estado de React é imutável:
 * qualquer edição cria um objeto novo.
 */
export function mergePersistedBlocksInto(current: any[], persisted: any[]): any[] {
  const persistedById = new Map(persisted.map((b) => [b.id, b]));
  return current.map((cur) => {
    const per = persistedById.get(cur.id);
    if (!per) return cur; // não fazia parte do payload persistido → preserva
    if (cur === per) return cur; // mesmo objeto → nada mudou
    if (cur.type === "camera") return per; // payload autoritativo para a câmera
    return cur; // bloco não-camera editado durante a persistência → preserva
  });
}