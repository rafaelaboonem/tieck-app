import { hashQuestion } from "./hashing";

/**
 * 5C.3.3-B.2 — mantém a ref autoritativa (blocksRef) fresca após uma
 * persistência confirmada, sem clobberar edições mais novas.
 *
 * Regras por bloco:
 * - bloco ausente do payload persistido → preserva a versão local (edição
 *   mais nova que não fazia parte do payload);
 * - mesmo objeto de referência → inalterado;
 * - bloco `camera` → o payload persistido é autoritativo SOMENTE quando a
 *   pergunta do payload é a MESMA da versão local;
 * - bloco não-camera com objeto DIFERENTE → edição local mais nova durante a
 *   persistência → preserva a versão local.
 *
 * 5C.3.3-C — uma persistência confirmada de Camera NUNCA pode sobrescrever
 * uma edição local mais nova da própria pergunta. Se a pergunta local
 * (hash canônico de title + description) divergir da pergunta do payload
 * persistido, a versão local vence: o payload antigo não aplica
 * title/description, não limpa `cameraAiNeedsRevalidation` e não torna a
 * policy antiga ready.
 *
 * A comparação por identidade é segura porque o estado de React é imutável:
 * qualquer edição cria um objeto novo. A comparação por hash usa a MESMA
 * canonicalização do resto do fluxo (hashQuestion).
 */
export async function mergePersistedBlocksInto(current: any[], persisted: any[]): Promise<any[]> {
  const persistedById = new Map(persisted.map((b) => [b.id, b]));
  const result: any[] = [];
  for (const cur of current) {
    const per = persistedById.get(cur.id);
    if (!per) {
      result.push(cur); // não fazia parte do payload persistido → preserva
      continue;
    }
    if (cur === per) {
      result.push(cur); // mesmo objeto → nada mudou
      continue;
    }
    if (cur.type === "camera") {
      const persistedHash = await hashQuestion(per.title, per.description);
      const currentHash = await hashQuestion(cur.title, cur.description);
      if (persistedHash !== currentHash) {
        result.push(cur); // pergunta local mais nova → preserva (5C.3.3-C)
        continue;
      }
      result.push(per); // mesma pergunta → payload persistido é autoritativo
      continue;
    }
    result.push(cur); // bloco não-camera editado durante a persistência → preserva
  }
  return result;
}