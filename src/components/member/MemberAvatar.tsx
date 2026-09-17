/**
 * MemberAvatar — avatar OFICIAL de membro do Tieck.
 *
 * Usa o Avatar oficial do produto (`@/components/ui/avatar`, o Radix do shadcn já
 * adotado pelas telas) em vez de criar um terceiro componente Radix. O avatar
 * transplantado do kit de dashboard (`dashboard/kit/ui/avatar`) deixa de ser
 * usado por este ponto, para não existirem duas verdades visuais.
 *
 * ───────────────────────────── QUEM DECIDE O QUÊ ────────────────────────────
 *
 * Com `avatarDisplayMode` (a escolha EXPLÍCITA do usuário, ver
 * @/lib/member-avatar-preference):
 *
 *   photo       → foto real; se não existir ou FALHAR ao carregar → automático
 *   automatic   → avatar ilustrado do seed, IGNORANDO a foto
 *   illustrated → ilustração escolhida; se o id não valer → automático
 *
 * Sem `avatarDisplayMode` (chamadas antigas, que não conhecem o modo), vale a
 * precedência histórica — foto → escolhido → automático — para que nenhuma tela
 * ainda não migrada mude de aparência sozinha.
 *
 * Em qualquer modo o fim da linha é o mesmo: iniciais (`getInitials`) e "?".
 *
 * Não infere gênero e não usa `Math.random()`: o avatar automático é escolhido
 * por id determinístico a partir de um seed persistido.
 *
 * Estado do dado (auditoria de identidade): `profiles.avatar_url` existe e é
 * nullable; `workspace_members.user_id` pode ser null (convite não aceito) e
 * nesse caso não há foto — o fallback de iniciais precisa cobrir isso. Resposta
 * avulsa de checklist NÃO é membro e não tem identidade confiável: nada aqui
 * aceita `visitor_id` como se fosse perfil.
 */
import * as React from "react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import {
  getInitials,
  getMemberNameSource,
  resolveAvatarSeed,
  type MemberIdentityInput,
} from "@/lib/member-identity";
import { getIllustratedAvatarSrc, resolveIllustratedAvatarSrc } from "@/lib/member-avatars";
import {
  isAvatarDisplayMode,
  type AvatarDisplayMode,
} from "@/lib/member-avatar-preference";

export type MemberAvatarSize = "xs" | "sm" | "md" | "lg" | "xl";

/**
 * Tamanhos comuns do produto, com o texto das iniciais já casado ao diâmetro.
 * `sm` (32px) mantém `text-base` de propósito: é o tamanho que as iniciais já
 * herdavam em "Últimas execuções" e o objetivo é não mudar o visual aprovado.
 */
const MEMBER_AVATAR_SIZE_CLASSES: Record<MemberAvatarSize, string> = {
  xs: "h-6 w-6 text-xs",
  sm: "h-8 w-8 text-base",
  md: "h-10 w-10 text-base",
  lg: "h-12 w-12 text-lg",
  xl: "h-16 w-16 text-2xl",
};

export type MemberAvatarProps = MemberIdentityInput & {
  /** `profiles.avatar_url` — foto real, usada quando o modo é "photo". */
  avatarUrl?: string | null;
  /**
   * Escolha explícita de como aparecer (ver @/lib/member-avatar-preference).
   * Ausente/inválida → precedência histórica (foto → escolhido → automático).
   */
  avatarDisplayMode?: AvatarDisplayMode | null;
  /** Escolha manual de ilustração ("avatar-14"). Vale no modo "illustrated". */
  selectedAvatarId?: string | null;
  /** Seed explícito do avatar automático (default: userId → memberId → e-mail). */
  seed?: string | null;
  size?: MemberAvatarSize;
  className?: string;
  /** Alt explícito; por padrão o nome resolvido da pessoa. */
  alt?: string;
  /**
   * O nome já aparece ao lado do avatar: nada a anunciar ao leitor de tela.
   * Use somente quando o nome estiver realmente visível no mesmo contexto.
   */
  decorative?: boolean;
};

function nonEmptyOrNull(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function MemberAvatar({
  avatarUrl,
  avatarDisplayMode,
  selectedAvatarId,
  seed,
  size = "md",
  className,
  alt,
  decorative = false,
  memberId,
  userId,
  displayName,
  firstName,
  lastName,
  email,
}: MemberAvatarProps) {
  const identity: MemberIdentityInput = {
    memberId,
    userId,
    displayName,
    firstName,
    lastName,
    email,
  };

  const nameSource = getMemberNameSource(identity);
  const initials = getInitials(nameSource);

  const photoUrl = nonEmptyOrNull(avatarUrl);

  /**
   * Foto que JÁ FALHOU, guardada por URL — não um booleano. Assim trocar de foto
   * zera a falha sem precisar de efeito de reset: a comparação é com a URL atual.
   * O Radix avisa pelo `onLoadingStatusChange` quando a imagem não carrega (ele
   * nem monta o `<img>` nesse caso), então nada quebrado é renderizado.
   */
  const [failedPhotoUrl, setFailedPhotoUrl] = React.useState<string | null>(null);
  const photoUsable = photoUrl !== null && photoUrl !== failedPhotoUrl;

  const handlePhotoLoadingStatus = React.useCallback(
    (status: string) => {
      if (status === "error") setFailedPhotoUrl(photoUrl);
    },
    [photoUrl],
  );

  const seedValue = nonEmptyOrNull(seed) ?? resolveAvatarSeed(identity);
  const chosenSrc = getIllustratedAvatarSrc(selectedAvatarId);
  const automaticSrc = resolveIllustratedAvatarSrc({ selectedAvatarId: null, seed: seedValue });

  const mode: AvatarDisplayMode = isAvatarDisplayMode(avatarDisplayMode)
    ? avatarDisplayMode
    : photoUsable
      ? "photo"
      : chosenSrc
        ? "illustrated"
        : "automatic";

  // Só "photo" pode mostrar a foto; "automatic" a ignora de propósito, e
  // "illustrated" usa a escolha (ou o automático, se o id não existir).
  const resolvedSrc =
    mode === "photo"
      ? photoUsable
        ? photoUrl
        : automaticSrc
      : mode === "illustrated"
        ? (chosenSrc ?? automaticSrc)
        : automaticSrc;

  // Sem nome e sem foto, um `alt` com o fallback ("Membro") não informa nada —
  // melhor deixar a imagem decorativa do que anunciar um rótulo genérico.
  const resolvedAlt = decorative ? "" : (alt ?? nameSource ?? "");

  return (
    <Avatar
      data-slot="member-avatar"
      data-avatar-display-mode={mode}
      className={cn(MEMBER_AVATAR_SIZE_CLASSES[size], className)}
      aria-hidden={decorative || undefined}
    >
      {resolvedSrc ? (
        // `object-cover` fica no uso (não mexe no Avatar global). Se a imagem
        // falhar, o Radix mantém o fallback e nada quebrado é renderizado.
        <AvatarImage
          data-slot="member-avatar-photo"
          src={resolvedSrc}
          alt={resolvedAlt}
          className="object-cover"
          onLoadingStatusChange={handlePhotoLoadingStatus}
        />
      ) : null}
      <AvatarFallback data-slot="member-avatar-fallback">{initials}</AvatarFallback>
    </Avatar>
  );
}
