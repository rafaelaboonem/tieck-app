/**
 * AvatarPicker — escolha OFICIAL de avatar do Tieck.
 *
 * Onde vive: Configurações → Minha conta, na seção "Avatar".
 *
 * Dois blocos, um único item selecionado:
 *   "Usar como avatar"      → [ Sua foto ] [ Automático ]   (cards compactos)
 *   "Escolha uma ilustração" → os 20 avatares do registry   (círculos)
 *
 * Componente CONTROLADO: não guarda seleção nem fala com o banco. Quem decide o
 * que está selecionado é a tela (otimista + rollback) e quem grava é
 * `buildSettingsWithAvatarSelection` (@/lib/member-avatar-preference) em
 * `profiles.settings` — modo e id numa escrita só.
 *
 * "Sua foto" só aparece para quem TEM foto (`hasPhoto`): não existe placeholder
 * de uma opção que não pode ser escolhida. "Automático" não é um avatar especial
 * — é o avatar ilustrado determinístico do seed, mostrado aqui para que voltar ao
 * automático seja previsível.
 *
 * A lista de opções vem do registry (`ILLUSTRATED_AVATARS`) — nunca de um array
 * paralelo escrito à mão aqui. Acrescentar avatar no registry acrescenta opção na
 * galeria, sem tocar neste arquivo. O ID é a chave (estável, persistida); a
 * POSIÇÃO na grade é só estética. Os ids internos (`avatar-07`) não aparecem como
 * texto para o usuário — o rótulo acessível fala "avatar 7".
 *
 * Acessibilidade: cada opção é um `<button>` real com `aria-pressed`, rótulo
 * próprio, foco visível e navegação por teclado. A seleção nunca é indicada
 * apenas por cor (tem check visível e rótulo).
 */
import * as React from "react";
import { Check, Loader2 } from "lucide-react";

import { MemberAvatar } from "@/components/member/MemberAvatar";
import { cn } from "@/lib/utils";
import type { MemberIdentityInput } from "@/lib/member-identity";
import { ILLUSTRATED_AVATARS, isIllustratedAvatarId } from "@/lib/member-avatars";
import type { AvatarSelection } from "@/lib/member-avatar-preference";

import "./member-avatar-picker.css";

/** Rótulo da opção "sem escolha manual". */
export const AUTOMATIC_AVATAR_OPTION_LABEL = "Usar avatar automático";

/** Rótulo da opção "usar a foto real do perfil". */
export const PHOTO_AVATAR_OPTION_LABEL = "Usar sua foto";

/**
 * Número humano de um id (`"avatar-07"` → `"7"`). Deriva do ID, não da posição,
 * então reordenar a galeria não renomeia nada.
 */
export function formatIllustratedAvatarNumber(id: string): string {
  const digits = id.replace(/^avatar-/, "").replace(/^0+/, "");
  return digits.length > 0 ? digits : "0";
}

/** Rótulo acessível de uma opção ilustrada: `"Selecionar avatar 7"`. */
export function formatIllustratedAvatarOptionLabel(id: string): string {
  return `Selecionar avatar ${formatIllustratedAvatarNumber(id)}`;
}

export type AvatarPickerProps = {
  /** Seleção efetiva (modo + id quando ilustrado). Um único item fica ativo. */
  selection: AvatarSelection;
  /** A conta tem foto real? Sem foto, a opção "Sua foto" não é renderizada. */
  hasPhoto?: boolean;
  /** `profiles.avatar_url`, para a prévia do item "Sua foto". */
  photoUrl?: string | null;
  /** Identidade usada nas prévias (nome/e-mail para as iniciais, id para o seed). */
  identity?: MemberIdentityInput;
  /** Recebe a seleção escolhida (modo + id), já pronta para persistir. */
  onSelect: (selection: AvatarSelection) => void;
  /** Trava a galeria enquanto um salvamento está em voo (evita duas escritas). */
  disabled?: boolean;
  /** Há um salvamento em voo. */
  pending?: boolean;
  /** Chave da opção que está salvando (`"photo"`, `"automatic"` ou o id). */
  pendingKey?: string | null;
  className?: string;
};

function SelectionCheck({
  className,
  checkClassName,
}: {
  className?: string;
  checkClassName?: string;
}) {
  return (
    <span
      data-slot="avatar-option-check"
      aria-hidden="true"
      className={cn(
        "absolute flex h-5 w-5 items-center justify-center rounded-full bg-pink-500 text-white ring-2 ring-white",
        className,
      )}
    >
      <Check className={cn("h-3 w-3", checkClassName)} strokeWidth={3} />
    </span>
  );
}

function LoadingOverlay({ rounded }: { rounded: string }) {
  return (
    <span
      data-slot="avatar-option-loading"
      className={cn(
        "absolute inset-0 flex items-center justify-center bg-white/70",
        rounded,
      )}
    >
      <Loader2 className="h-4 w-4 animate-spin text-pink-500" />
    </span>
  );
}

/**
 * Opção ilustrada (círculo) — sem rótulo visível: as 20 formam uma biblioteca
 * visual, e o nome acessível diz "avatar N".
 */
function IllustratedOption({
  avatarId,
  src,
  selected,
  disabled,
  loading,
  onSelect,
}: {
  avatarId: string;
  src: string;
  selected: boolean;
  disabled?: boolean;
  loading?: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      data-slot="avatar-option"
      data-avatar-id={avatarId}
      data-selected={selected ? "true" : "false"}
      aria-pressed={selected}
      aria-label={formatIllustratedAvatarOptionLabel(avatarId)}
      title={formatIllustratedAvatarOptionLabel(avatarId)}
      disabled={disabled}
      onClick={onSelect}
      className={cn(
        "ti-avatar-option relative flex h-12 w-12 shrink-0 items-center justify-center rounded-full border bg-white p-0 sm:h-14 sm:w-14",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 focus-visible:ring-offset-2",
        selected
          ? "border-pink-500 ring-2 ring-pink-500 ring-offset-2 ring-offset-white"
          : "border-neutral-200",
        disabled ? "cursor-default opacity-60" : "cursor-pointer",
      )}
    >
      <span className="pointer-events-none flex h-full w-full items-center justify-center overflow-hidden rounded-full">
        <img
          src={src}
          alt=""
          aria-hidden="true"
          draggable={false}
          className="h-full w-full rounded-full object-cover"
        />
      </span>

      {selected ? (
        <SelectionCheck className="-bottom-0.5 -right-0.5" checkClassName="h-3 w-3" />
      ) : null}

      {loading ? <LoadingOverlay rounded="rounded-full" /> : null}
    </button>
  );
}

/**
 * Opção especial ("Sua foto" / "Automático") — card compacto com avatar + rótulo,
 * para que a escolha entre "foto" e "automático" se leia como escolha, e não como
 * dois avatares anônimos.
 */
function SpecialOption({
  optionId,
  label,
  caption,
  selected,
  disabled,
  loading,
  onSelect,
  children,
}: {
  optionId: "photo" | "automatic";
  label: string;
  caption: string;
  selected: boolean;
  disabled?: boolean;
  loading?: boolean;
  onSelect: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      data-slot="avatar-special-option"
      data-avatar-id={optionId}
      data-selected={selected ? "true" : "false"}
      aria-pressed={selected}
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onSelect}
      className={cn(
        "ti-avatar-option ti-avatar-special relative flex w-[104px] shrink-0 flex-col items-center gap-2 rounded-xl border bg-white px-3 py-3",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 focus-visible:ring-offset-2",
        selected
          ? "border-pink-500 ring-2 ring-pink-500 ring-offset-2 ring-offset-white"
          : "border-neutral-200",
        disabled ? "cursor-default opacity-60" : "cursor-pointer",
      )}
    >
      <span className="pointer-events-none flex h-12 w-12 items-center justify-center overflow-hidden rounded-full">
        {children}
      </span>
      <span className="text-[11px] font-medium leading-4 text-neutral-700">{caption}</span>

      {selected ? (
        <SelectionCheck className="-right-1.5 -top-1.5" checkClassName="h-3 w-3" />
      ) : null}

      {loading ? <LoadingOverlay rounded="rounded-xl" /> : null}
    </button>
  );
}

export function AvatarPicker({
  selection,
  hasPhoto = false,
  photoUrl = null,
  identity,
  onSelect,
  disabled = false,
  pending = false,
  pendingKey = null,
  className,
}: AvatarPickerProps) {
  // Id desconhecido não conta como escolha manual: vale o Automático, igual à
  // leitura de settings (nunca renderiza imagem quebrada por valor antigo).
  const illustratedSelected =
    selection.mode === "illustrated" && isIllustratedAvatarId(selection.avatarId)
      ? selection.avatarId
      : null;

  const photoSelected = selection.mode === "photo" && hasPhoto;
  const automaticSelected = !photoSelected && illustratedSelected === null;

  const isLoading = (key: string) => pending && pendingKey === key;

  return (
    <div data-slot="avatar-picker" className={cn("space-y-6", className)}>
      <div role="group" aria-label="Usar como avatar">
        <p className="text-sm font-medium text-neutral-900">Usar como avatar</p>

        <div className="mt-3 flex flex-wrap gap-3">
          {hasPhoto ? (
            <SpecialOption
              optionId="photo"
              label={PHOTO_AVATAR_OPTION_LABEL}
              caption="Sua foto"
              selected={photoSelected}
              disabled={disabled}
              loading={isLoading("photo")}
              onSelect={() => onSelect({ mode: "photo" })}
            >
              <MemberAvatar
                {...identity}
                avatarUrl={photoUrl}
                avatarDisplayMode="photo"
                size="lg"
                className="h-full w-full"
                decorative
              />
            </SpecialOption>
          ) : null}

          <SpecialOption
            optionId="automatic"
            label={AUTOMATIC_AVATAR_OPTION_LABEL}
            caption="Automático"
            selected={automaticSelected}
            disabled={disabled}
            loading={isLoading("automatic")}
            onSelect={() => onSelect({ mode: "automatic" })}
          >
            {/* A prévia do Automático é o MemberAvatar oficial com modo
                automático: é, por construção, o avatar para o qual a pessoa
                volta — o mesmo seed que o resto do produto usaria. */}
            <MemberAvatar
              {...identity}
              avatarDisplayMode="automatic"
              size="lg"
              className="h-full w-full"
              decorative
            />
          </SpecialOption>
        </div>
      </div>

      <div role="group" aria-label="Escolha uma ilustração">
        <p className="text-sm font-medium text-neutral-900">Escolha uma ilustração</p>

        <div className="mt-3 grid grid-cols-5 justify-items-center gap-x-3 gap-y-2 sm:grid-cols-6 md:grid-cols-8">
          {ILLUSTRATED_AVATARS.map((avatar) => (
            <IllustratedOption
              key={avatar.id}
              avatarId={avatar.id}
              src={avatar.src}
              selected={illustratedSelected === avatar.id}
              disabled={disabled}
              loading={isLoading(avatar.id)}
              onSelect={() => onSelect({ mode: "illustrated", avatarId: avatar.id })}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
