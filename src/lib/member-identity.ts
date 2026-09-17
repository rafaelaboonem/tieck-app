/**
 * Identidade de membro — camada ÚNICA e pura (nome · iniciais · seed de avatar).
 *
 * Por que existe: a auditoria de identidade mostrou quatro lógicas divergentes
 * espalhadas pelo produto (DashboardLayout `.charAt(0).toUpperCase()`,
 * `admin.tsx` `<AvatarFallback>{(display_name || "?").charAt(0)}</AvatarFallback>`,
 * `equipe.tsx`/`organizar.tsx` caindo num ícone genérico e
 * `RealRecentExecutions` montando iniciais com `.split(" ").map(p => p[0])` — que
 * transformaria "Maria Vitória Souza" em "MVS"). Este módulo não substitui
 * nenhuma dessas telas: ele passa a ser o lugar oficial de onde elas poderão
 * puxar a mesma resposta, sem recalcular cada uma do seu jeito.
 *
 * Contrato de entrada único — cobre os quatro estados reais do produto:
 *   A) usuário completo com profile      (displayName/firstName/lastName + avatarUrl)
 *   B) workspace_member sem profile      (memberId + email normalizado)
 *   C) convite ainda sem user_id         (memberId + email, userId null)
 *   D) registro histórico               (só nome ou só e-mail)
 *
 * Nada aqui toca banco, rede ou React: só texto → texto.
 *
 * NÃO existe inferência de gênero nem heurística de nome: o banco não guarda
 * gênero confiável, então qualquer "escolha por nome" seria invenção. O avatar
 * automático é escolhido por ID determinístico (ver ./member-avatars).
 */

/** Último recurso do nome — nunca inventa pessoa, apenas admite o anônimo. */
export const MEMBER_NAME_FALLBACK = "Membro";

/** Último recurso das iniciais. */
export const MEMBER_INITIALS_FALLBACK = "?";

/**
 * Campos de identidade que qualquer superfície do produto consegue fornecer.
 * Todos opcionais: a resolução degrada em vez de quebrar.
 */
export type MemberIdentityInput = {
  /** `workspace_members.id` — estável mesmo antes do convite ser aceito. */
  memberId?: string | null;
  /** `workspace_members.user_id` / `profiles.id` — pode ser null em convite. */
  userId?: string | null;
  /** `profiles.display_name`. */
  displayName?: string | null;
  /** `profiles.first_name`. */
  firstName?: string | null;
  /** `profiles.last_name`. */
  lastName?: string | null;
  /** `workspace_members.email_normalized` (ou o e-mail do perfil). */
  email?: string | null;
};

/** Texto utilizável ou null — nunca devolve string vazia/só espaços. */
function nonEmptyOrNull(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Melhor fonte HUMANA de nome, em ordem canônica:
 *   display_name → first_name + last_name → e-mail → null
 *
 * Devolve `null` quando nada utilizável existe — quem chama decide se mostra
 * `MEMBER_NAME_FALLBACK` (texto) ou `MEMBER_INITIALS_FALLBACK` (iniciais).
 * Toda a precedência de nome do produto vive aqui e em nenhum outro lugar.
 */
export function getMemberNameSource(
  input: MemberIdentityInput | null | undefined,
): string | null {
  if (!input) return null;

  const displayName = nonEmptyOrNull(input.displayName);
  if (displayName) return displayName;

  const first = nonEmptyOrNull(input.firstName);
  const last = nonEmptyOrNull(input.lastName);
  const fullName = [first, last].filter(Boolean).join(" ").trim();
  if (fullName) return fullName;

  return nonEmptyOrNull(input.email);
}

/**
 * Nome humano canônico para exibição. Nunca vazio, nunca `undefined`:
 * sem nada utilizável devolve `MEMBER_NAME_FALLBACK`.
 *
 * Mesma cadeia de `getWorkspaceMemberLabel` (5E.1.1), que agora delega para cá.
 */
export function getMemberDisplayName(
  input: MemberIdentityInput | null | undefined,
): string {
  return getMemberNameSource(input) ?? MEMBER_NAME_FALLBACK;
}

/** Primeiro caractere "de verdade" — seguro para acentos e pares substitutos. */
function firstChar(value: string): string {
  return [...value][0] ?? "";
}

/**
 * Iniciais OFICIAIS do produto (máximo 2 caracteres).
 *
 *   "João Pereira"          → "JP"
 *   "Maria Vitória Souza"   → "MS"   (primeira + última palavra, não todas)
 *   "Rafael"                → "R"
 *   "  Ana   Ribeiro  "     → "AR"
 *   "rafael@email.com"      → "R"    (e-mail: primeira letra do endereço)
 *   ""  / null / undefined  → "?"
 *
 * Acentos são preservados (maiúscula de "joão" é "J") e o resultado nunca passa
 * de 2 caracteres.
 */
export function getInitials(value: string | null | undefined): string {
  const raw = nonEmptyOrNull(value);
  if (!raw) return MEMBER_INITIALS_FALLBACK;

  // E-mail não tem "primeira e última palavra": a inicial é a do endereço.
  if (raw.includes("@")) {
    const localPart = raw.slice(0, raw.indexOf("@")).trim();
    const initial = firstChar(localPart);
    return initial ? initial.toUpperCase() : MEMBER_INITIALS_FALLBACK;
  }

  const words = raw.split(/\s+/).filter(Boolean);
  if (words.length === 0) return MEMBER_INITIALS_FALLBACK;

  const first = firstChar(words[0]);
  const last = words.length > 1 ? firstChar(words[words.length - 1]) : "";
  const initials = `${first}${last}`.toUpperCase();

  return initials || MEMBER_INITIALS_FALLBACK;
}

/** Iniciais de um membro a partir do contrato completo (nome → e-mail → "?"). */
export function getMemberInitials(
  input: MemberIdentityInput | null | undefined,
): string {
  return getInitials(getMemberNameSource(input));
}

/**
 * Seed ESTÁVEL do avatar automático — nunca muda entre sessões, unidades ou
 * dispositivos, porque vem de identificador persistido, não de aleatoriedade.
 *
 * Ordem: `userId` → `memberId` → e-mail normalizado. E-mail é normalizado
 * (trim + minúsculas) para que "Ana@X.com" e "ana@x.com" caiam no mesmo avatar.
 * Sem nenhum dos três, devolve null e o avatar automático fica indisponível
 * (cai nas iniciais) — o que é honesto: sem identidade estável não há como
 * garantir o MESMO avatar sempre.
 */
export function resolveAvatarSeed(
  input: MemberIdentityInput | null | undefined,
): string | null {
  if (!input) return null;

  const userId = nonEmptyOrNull(input.userId);
  if (userId) return userId;

  const memberId = nonEmptyOrNull(input.memberId);
  if (memberId) return memberId;

  const email = nonEmptyOrNull(input.email);
  return email ? email.toLowerCase() : null;
}

/**
 * Índice determinístico no intervalo `0 <= index < total`.
 *
 * FNV-1a de 32 bits: sem dependência externa, sem `Math.random()`, mesma semente
 * sempre devolve o mesmo índice. `total` inválido (0, negativo, NaN, Infinity)
 * é tratado com segurança e devolve 0 — nunca NaN nem estouro de faixa.
 */
export function getStableAvatarIndex(
  seed: string | null | undefined,
  total: number,
): number {
  if (!Number.isFinite(total) || total <= 0) return 0;

  const size = Math.floor(total);
  const key = nonEmptyOrNull(seed);
  if (!key) return 0;

  let hash = 0x811c9dc5;
  for (let i = 0; i < key.length; i += 1) {
    hash ^= key.charCodeAt(i);
    // Math.imul mantém a multiplicação em 32 bits (sem perda para float64).
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }

  return hash % size;
}
