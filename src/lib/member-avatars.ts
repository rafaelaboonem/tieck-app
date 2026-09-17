/**
 * Avatares ilustrados do Tieck — biblioteca OFICIAL completa (20).
 *
 * LOTE 1: avatar-01 … avatar-12. LOTE 2: avatar-13 … avatar-20. Todos em
 * `src/assets/member-avatars/`, com IDs definitivos: `avatar-01` sempre aponta
 * para este mesmo personagem, em qualquer tela e em qualquer momento.
 *
 * Com as 20 entradas no lugar, o MAPEAMENTO AUTOMÁTICO passa a ser DEFINITIVO:
 * o mesmo seed devolve sempre o mesmo avatar (o índice depende do tamanho do
 * registry, que agora é o final). A SELEÇÃO MANUAL continua resolvendo por id,
 * então acrescentar avatares no futuro nunca reescreve a escolha de ninguém.
 *
 * ─────────────────────────── O REGISTRY É A VERDADE ─────────────────────────
 *
 * Duas regras estruturais, e as duas existem para não travar o produto no
 * tamanho de hoje:
 *
 *  1. NÃO existe constante de quantidade. O total é `ILLUSTRATED_AVATARS.length`
 *     — acrescentar (ou remover) uma entrada atualiza índice, sorteio automático
 *     e galeria ao mesmo tempo. Um número escrito à mão divergiria em silêncio no
 *     dia em que a biblioteca mudasse de tamanho.
 *  2. CADA entrada carrega o seu próprio `id` ESTÁVEL ("avatar-01" … "avatar-20").
 *     A escolha do usuário fica guardada por ID, nunca por posição: reordenar a
 *     galeria (por estética, por popularidade, por alfabeto) não troca o avatar
 *     de ninguém, e posição nenhuma é persistida.
 *
 * Biblioteca inicial aprovada (20): avatar-01 … avatar-20, servida em WebP
 * 256×256 lossless (mesma arte, mesmo enquadramento, ~95,9% menos bytes que os
 * PNGs 1254² originais).
 *
 * Precedência final de avatar (implementada em `MemberAvatar`):
 *   1. foto real (`profiles.avatar_url`)
 *   2. avatar ilustrado ESCOLHIDO pelo usuário (`selectedAvatarId`)
 *   3. avatar ilustrado AUTOMÁTICO (`getStableAvatarIndex(seed, length)`)
 *   4. iniciais
 *   5. "?"
 *
 * Seleção por ID determinístico, NUNCA por gênero: o banco não guarda gênero
 * confiável, e "nome feminino/masculino" seria invenção. Também não existe
 * `Math.random()` em lugar nenhum: o mesmo seed devolve sempre o mesmo avatar,
 * então refresh, outra unidade e outro dispositivo coincidem.
 *
 * O que é persistido depois é só a CHAVE ("avatar-14"), nunca a imagem nem URL
 * fixa — o src pode mudar de bucket/CDN sem migrar escolha de ninguém.
 */
import { getStableAvatarIndex } from "./member-identity";

// Os 20 assets são importados estaticamente (o bundler resolve a URL no build) —
// nada de base64, URL externa, CDN ou Supabase Storage.
//
// Formato físico: WebP 256×256 LOSSLESS (asset 1:1 no maior tamanho de exibição
// previsto). O formato é detalhe de arquivo — os IDs, a precedência e a escolha
// persistida não mudam se a biblioteca trocar de formato outra vez.
import avatar01 from "@/assets/member-avatars/avatar-01.webp";
import avatar02 from "@/assets/member-avatars/avatar-02.webp";
import avatar03 from "@/assets/member-avatars/avatar-03.webp";
import avatar04 from "@/assets/member-avatars/avatar-04.webp";
import avatar05 from "@/assets/member-avatars/avatar-05.webp";
import avatar06 from "@/assets/member-avatars/avatar-06.webp";
import avatar07 from "@/assets/member-avatars/avatar-07.webp";
import avatar08 from "@/assets/member-avatars/avatar-08.webp";
import avatar09 from "@/assets/member-avatars/avatar-09.webp";
import avatar10 from "@/assets/member-avatars/avatar-10.webp";
import avatar11 from "@/assets/member-avatars/avatar-11.webp";
import avatar12 from "@/assets/member-avatars/avatar-12.webp";
import avatar13 from "@/assets/member-avatars/avatar-13.webp";
import avatar14 from "@/assets/member-avatars/avatar-14.webp";
import avatar15 from "@/assets/member-avatars/avatar-15.webp";
import avatar16 from "@/assets/member-avatars/avatar-16.webp";
import avatar17 from "@/assets/member-avatars/avatar-17.webp";
import avatar18 from "@/assets/member-avatars/avatar-18.webp";
import avatar19 from "@/assets/member-avatars/avatar-19.webp";
import avatar20 from "@/assets/member-avatars/avatar-20.webp";

/** Uma entrada da galeria: id estável + de onde vem a imagem. */
export type IllustratedAvatar = {
  /** Chave persistível: `avatar-01` … `avatar-20`. Nunca muda, nunca é índice. */
  id: string;
  /** Caminho/URL do asset resolvido pelo bundler (hoje WebP 256×256). */
  src: string;
};

/**
 * Registry — a fonte de verdade.
 *
 * Estado: COMPLETO — 20 entradas (avatar-01 … avatar-20), o lote final aprovado.
 *
 * Os IDs são DEFINITIVOS: `avatar-01` sempre representa este mesmo personagem.
 * Nunca reordenar, renumerar ou derivar id da posição do array — a ordem pode
 * mudar, a identidade não.
 *
 * O mapeamento automático (`getStableAvatarIndex(seed, length)`) é DEFINITIVO a
 * partir daqui: nenhuma escolha automática foi persistida durante a construção da
 * biblioteca, e agora o tamanho do registry não muda mais sozinho.
 */
export const ILLUSTRATED_AVATARS: readonly IllustratedAvatar[] = Object.freeze([
  { id: "avatar-01", src: avatar01 },
  { id: "avatar-02", src: avatar02 },
  { id: "avatar-03", src: avatar03 },
  { id: "avatar-04", src: avatar04 },
  { id: "avatar-05", src: avatar05 },
  { id: "avatar-06", src: avatar06 },
  { id: "avatar-07", src: avatar07 },
  { id: "avatar-08", src: avatar08 },
  { id: "avatar-09", src: avatar09 },
  { id: "avatar-10", src: avatar10 },
  { id: "avatar-11", src: avatar11 },
  { id: "avatar-12", src: avatar12 },
  { id: "avatar-13", src: avatar13 },
  { id: "avatar-14", src: avatar14 },
  { id: "avatar-15", src: avatar15 },
  { id: "avatar-16", src: avatar16 },
  { id: "avatar-17", src: avatar17 },
  { id: "avatar-18", src: avatar18 },
  { id: "avatar-19", src: avatar19 },
  { id: "avatar-20", src: avatar20 },
] as IllustratedAvatar[]);

/** Registry injetável — existe para provar/testar o comportamento futuro. */
export type IllustratedAvatarRegistry = readonly IllustratedAvatar[];

/**
 * Formato do id: `avatar-` + pelo menos dois dígitos.
 *
 * O mínimo é dois (para ordenar bonito), sem teto: uma biblioteca maior no futuro
 * não invalida ids.
 */
const ILLUSTRATED_AVATAR_ID_RE = /^avatar-\d{2,}$/;

/** True apenas para o FORMATO do id — não diz que o asset existe. */
export function isIllustratedAvatarIdFormat(value: unknown): boolean {
  return typeof value === "string" && ILLUSTRATED_AVATAR_ID_RE.test(value.trim());
}

/**
 * Um id é válido para SELEÇÃO quando o formato confere E ele existe no registry.
 * É esta a checagem que o produto deve usar: regex sozinho aceitaria um
 * "avatar-99" que nunca existiu.
 */
export function isIllustratedAvatarId(
  value: unknown,
  registry: IllustratedAvatarRegistry = ILLUSTRATED_AVATARS,
): boolean {
  return findIllustratedAvatar(value as string, registry) !== null;
}

/** Quantos avatares ilustrados existem. Único total possível: o do registry. */
export function getIllustratedAvatarCount(
  registry: IllustratedAvatarRegistry = ILLUSTRATED_AVATARS,
): number {
  return registry.length;
}

/** Entrada completa a partir do id, ou null quando o id não está no registry. */
export function findIllustratedAvatar(
  id: string | null | undefined,
  registry: IllustratedAvatarRegistry = ILLUSTRATED_AVATARS,
): IllustratedAvatar | null {
  if (!isIllustratedAvatarIdFormat(id)) return null;
  const key = (id as string).trim();
  return registry.find((avatar) => avatar.id === key) ?? null;
}

/** Src do avatar ilustrado, ou null quando o id não existe (ainda) no registry. */
export function getIllustratedAvatarSrc(
  id: string | null | undefined,
  registry: IllustratedAvatarRegistry = ILLUSTRATED_AVATARS,
): string | null {
  const avatar = findIllustratedAvatar(id, registry);
  if (!avatar) return null;
  return avatar.src.length > 0 ? avatar.src : null;
}

/**
 * Chave canônica a partir de um índice: 0 → "avatar-01", 6 → "avatar-07".
 *
 * Serve para MONTAR o registry (ou para a galeria futura), não para validar
 * seleção: um id só vale se existir no registry.
 */
export function formatIllustratedAvatarId(index: number): string {
  const safe = Number.isFinite(index) && index > 0 ? Math.floor(index) : 0;
  return `avatar-${String(safe + 1).padStart(2, "0")}`;
}

/**
 * Id do avatar AUTOMÁTICO para um seed estável.
 *
 * O índice sai do tamanho REAL do registry (`getStableAvatarIndex(seed, length)`),
 * então a faixa acompanha a biblioteca sozinha — nenhum total escrito à mão aqui.
 *
 * Devolve null quando não há seed (sem userId/memberId/e-mail) ou quando o
 * registry está vazio: nesses casos não existe garantia de mesmo avatar entre
 * sessões, e é mais honesto cair nas iniciais do que sortear.
 */
export function resolveAutomaticIllustratedAvatarId(
  seed: string | null | undefined,
  registry: IllustratedAvatarRegistry = ILLUSTRATED_AVATARS,
): string | null {
  if (typeof seed !== "string" || seed.trim().length === 0) return null;
  if (registry.length === 0) return null;

  const index = getStableAvatarIndex(seed, registry.length);
  return registry[index]?.id ?? null;
}

/**
 * Src a usar entre os avatares ilustrados: ESCOLHIDO vence o AUTOMÁTICO.
 *
 * A escolha manual é resolvida por ID (`findIllustratedAvatar`), nunca por
 * posição — é isso que mantém `avatar-14` sendo `avatar-14` depois de a galeria
 * ganhar entradas novas ou ser reordenada.
 *
 * Se o escolhido não existir no registry (escolha antiga, asset retirado, id
 * desconhecido), tenta o automático do seed. Se nada existir, devolve null e a
 * precedência segue para as iniciais — remover a escolha manual volta
 * naturalmente ao avatar automático.
 */
export function resolveIllustratedAvatarSrc(
  options: {
    selectedAvatarId?: string | null;
    seed?: string | null;
  },
  registry: IllustratedAvatarRegistry = ILLUSTRATED_AVATARS,
): string | null {
  const selected = getIllustratedAvatarSrc(options.selectedAvatarId, registry);
  if (selected) return selected;

  return getIllustratedAvatarSrc(
    resolveAutomaticIllustratedAvatarId(options.seed, registry),
    registry,
  );
}
