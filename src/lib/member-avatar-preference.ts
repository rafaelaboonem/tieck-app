/**
 * Preferência de avatar — a ÚNICA regra de leitura/escrita do avatar dentro de
 * `profiles.settings`.
 *
 * Por que existe: `profiles.settings` é um jsonb COMPARTILHADO — já guarda
 * `save_for_later` e `product_updates` (Minha conta → Comportamento /
 * Notificações). Qualquer gravação precisa ser ADITIVA: sobrescrever o objeto
 * inteiro apagaria configurações que não são desta tela. Este módulo garante isso
 * e mais três coisas que o banco não garante:
 *
 *  1. Só se grava ID VÁLIDO (existente no registry). Um id desconhecido — escolha
 *     antiga, asset retirado, valor corrompido — nunca é gravado nem renderizado
 *     como imagem quebrada: ele simplesmente não vale como escolha manual.
 *  2. O MODO é explícito (`avatar_display_mode`), não deduzido: o usuário escolhe
 *     entre "foto real", "automático" e "ilustração". Antes disso a precedência
 *     era implícita e criava uma ambiguidade real de produto — quem tem foto
 *     escolhia uma ilustração e continuava vendo a foto, sem entender por quê.
 *  3. "Automático" NÃO apaga a última ilustração escolhida. A representação
 *     depende primeiro do modo; `illustrated_avatar_id` fica guardado para que
 *     voltar de "foto" ou "automático" recupere a escolha anterior.
 *
 * É PURA: não toca banco, rede nem React — recebe o jsonb, devolve o próximo
 * jsonb. Quem escreve no Supabase é a tela, com o objeto devolvido aqui.
 */
import type { Json } from "@/integrations/supabase/types";

import {
  ILLUSTRATED_AVATARS,
  isIllustratedAvatarId,
  type IllustratedAvatarRegistry,
} from "./member-avatars";

/** Chave em `profiles.settings`. Guarda só o ID (`"avatar-14"`), nunca URL/imagem. */
export const ILLUSTRATED_AVATAR_SETTINGS_KEY = "illustrated_avatar_id";

/** Chave em `profiles.settings`. Guarda só o modo: `"photo" | "automatic" | "illustrated"`. */
export const AVATAR_DISPLAY_MODE_SETTINGS_KEY = "avatar_display_mode";

/**
 * `profiles.settings` como objeto plano — a mesma forma que o Supabase tipa a
 * coluna (`settings?: Json` → `{ [key: string]: Json | undefined }`). Usar o alias
 * evita `as any` no `update()` e deixa explícito que isto é o jsonb do banco.
 */
export type ProfileSettings = { [key: string]: Json | undefined };

/**
 * Como o usuário escolheu aparecer no Tieck.
 *
 *   photo       → a foto real (`profiles.avatar_url`), e SÓ ela
 *   automatic   → avatar ilustrado determinístico pelo seed, ignorando a foto
 *   illustrated → a ilustração escolhida à mão (`illustrated_avatar_id`)
 *
 * Não existe modo "nenhum": "?" é fallback visual, não preferência.
 */
export type AvatarDisplayMode = "photo" | "automatic" | "illustrated";

/**
 * Seleção completa — modo + (quando ilustrado) o id. É o valor que a UI manipula
 * e o que vai inteiro para o banco em UMA escrita, para que modo e id nunca
 * fiquem inconsistentes.
 */
export type AvatarSelection =
  | { mode: "photo" }
  | { mode: "automatic" }
  | { mode: "illustrated"; avatarId: string };

/** Modos válidos — mesma lista do tipo, em runtime (guarda de valor cru do jsonb). */
export const AVATAR_DISPLAY_MODES: readonly AvatarDisplayMode[] = [
  "photo",
  "automatic",
  "illustrated",
];

/**
 * Cópia de trabalho do jsonb. Objeto plano → cópia rasa (as outras chaves ficam
 * intactas). Qualquer outra coisa (null, array, string, número) → objeto vazio,
 * porque não há chave nomeada a preservar nesses casos.
 */
function asSettingsCopy(settings: unknown): ProfileSettings {
  if (!settings || typeof settings !== "object" || Array.isArray(settings)) return {};
  return { ...(settings as ProfileSettings) };
}

/** Valor bruto de uma chave, sem validação nenhuma. */
function rawValue(settings: unknown, key: string): unknown {
  return asSettingsCopy(settings)[key];
}

/** True apenas para um dos três modos — string arbitrária do jsonb não vale. */
export function isAvatarDisplayMode(value: unknown): value is AvatarDisplayMode {
  return (
    typeof value === "string" &&
    (AVATAR_DISPLAY_MODES as readonly string[]).includes(value.trim())
  );
}

/**
 * Modo GRAVADO no profile, ou `null` quando a chave não existe (usuário que
 * nunca escolheu — ver `resolveAvatarSelection` para a regra de compatibilidade).
 */
export function readAvatarDisplayMode(settings: unknown): AvatarDisplayMode | null {
  const raw = rawValue(settings, AVATAR_DISPLAY_MODE_SETTINGS_KEY);
  return isAvatarDisplayMode(raw) ? (raw.trim() as AvatarDisplayMode) : null;
}

/**
 * Escolha manual VÁLIDA salva pelo usuário, ou `null` quando não há escolha.
 *
 * `null` cobre todos os casos de não-existe: chave ausente, valor não-texto, id
 * que não está no registry (`avatar-99`) ou objeto de settings inválido.
 */
export function readIllustratedAvatarId(
  settings: unknown,
  registry: IllustratedAvatarRegistry = ILLUSTRATED_AVATARS,
): string | null {
  const raw = rawValue(settings, ILLUSTRATED_AVATAR_SETTINGS_KEY);
  if (!isIllustratedAvatarId(raw, registry)) return null;
  return (raw as string).trim();
}

/**
 * Chave estável de uma seleção — usada para comparar "já está selecionado" e para
 * dizer qual opção está salvando. A ilustração é identificada pelo ID (nunca por
 * posição na galeria).
 */
export function avatarSelectionKey(selection: AvatarSelection): string {
  return selection.mode === "illustrated" ? selection.avatarId : selection.mode;
}

/**
 * Seleção efetiva hoje, já resolvendo o que o banco NÃO garante:
 *
 *  • modo gravado válido → é ele quem manda;
 *  • modo ausente (conta antiga, criada antes deste recurso):
 *      com foto (`hasPhoto`)        → "photo"
 *      sem foto, mas com ilustração escolhida → "illustrated"
 *      sem nada                     → "automatic"
 *    As três linhas existem para não mudar o avatar de ninguém sem que a pessoa
 *    peça: uma escolha ilustrada salva antes do modo existir continua valendo;
 *  • modo "photo" numa conta SEM foto  → "automatic" (não há foto para mostrar);
 *  • modo "illustrated" com id inválido/ausente → "automatic" (nunca imagem
 *    quebrada, nunca opção "meio selecionada").
 *
 * O registry é injetável para que a mesma regra valha numa biblioteca maior.
 */
export function resolveAvatarSelection(
  settings: unknown,
  options: { hasPhoto: boolean; registry?: IllustratedAvatarRegistry },
): AvatarSelection {
  const registry = options.registry ?? ILLUSTRATED_AVATARS;
  const chosen = readIllustratedAvatarId(settings, registry);

  const mode: AvatarDisplayMode =
    readAvatarDisplayMode(settings) ??
    (options.hasPhoto ? "photo" : chosen ? "illustrated" : "automatic");

  if (mode === "photo") {
    return options.hasPhoto ? { mode: "photo" } : { mode: "automatic" };
  }

  if (mode === "illustrated") {
    return chosen ? { mode: "illustrated", avatarId: chosen } : { mode: "automatic" };
  }

  return { mode: "automatic" };
}

/**
 * Próximo objeto de `settings` com a seleção aplicada — modo e id numa escrita só
 * (atômica: nunca existe um estado em que o modo diga "ilustrated" e o id seja de
 * outro avatar).
 *
 *   illustrated + id válido → grava modo e id
 *   illustrated + id inválido → grava "automatic" (não grava lixo nem aponta para
 *                               asset inexistente)
 *   photo / automatic       → grava SÓ o modo, preservando `illustrated_avatar_id`
 *                             como "última escolha", para que voltar ao ilustrado
 *                             recupere o avatar anterior
 *
 * Nunca muta a entrada: devolve um objeto novo, pronto para o `update`. Todas as
 * outras chaves de settings são preservadas.
 */
export function buildSettingsWithAvatarSelection(
  settings: unknown,
  selection: AvatarSelection,
  registry: IllustratedAvatarRegistry = ILLUSTRATED_AVATARS,
): ProfileSettings {
  if (selection.mode === "illustrated" && isIllustratedAvatarId(selection.avatarId, registry)) {
    const next = buildSettingsWithIllustratedAvatar(settings, selection.avatarId, registry);
    next[AVATAR_DISPLAY_MODE_SETTINGS_KEY] = "illustrated";
    return next;
  }

  const next = asSettingsCopy(settings);
  next[AVATAR_DISPLAY_MODE_SETTINGS_KEY] = selection.mode === "photo" ? "photo" : "automatic";
  return next;
}

/**
 * Próximo objeto de `settings` com a escolha ilustrada aplicada:
 *   avatarId válido → grava a chave (preservando TODAS as outras propriedades)
 *   null/undefined  → REMOVE a chave
 *   id inválido     → REMOVE a chave (não grava lixo)
 *
 * É a operação de BAIXO nível do `illustrated_avatar_id`, usada por
 * `buildSettingsWithAvatarSelection`. Remover a chave não é mais o que "voltar ao
 * automático" faz — o modo é quem manda; isto só apaga a última escolha quando
 * alguém realmente quer esquecê-la.
 */
export function buildSettingsWithIllustratedAvatar(
  settings: unknown,
  avatarId: string | null | undefined,
  registry: IllustratedAvatarRegistry = ILLUSTRATED_AVATARS,
): ProfileSettings {
  const next = asSettingsCopy(settings);

  if (avatarId != null && isIllustratedAvatarId(avatarId, registry)) {
    next[ILLUSTRATED_AVATAR_SETTINGS_KEY] = (avatarId as string).trim();
  } else {
    delete next[ILLUSTRATED_AVATAR_SETTINGS_KEY];
  }

  return next;
}
