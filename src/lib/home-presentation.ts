/**
 * Home 6B.2L — regras de APRESENTAÇÃO da nova `/inicio`, puras e testáveis.
 *
 * Nada aqui consulta dados: o nome vem do perfil já carregado e o gate de
 * criação de workspace é a MESMA regra do shell (dropdown do perfil), só
 * reescrita em função pura para não existir uma segunda política.
 */

/**
 * Primeiro nome exibido na saudação.
 *
 * Fontes aceitas (nesta ordem, todas REAIS e já usadas pelo app):
 * `profiles.display_name` → `user_metadata.full_name` → `user_metadata.name`.
 * E-mail NUNCA é usado como nome (não é um nome).
 * Sem fonte confiável → `null` (a saudação cai no fallback neutro "Bom dia.").
 */
export function resolveFirstName(
  ...sources: Array<string | null | undefined>
): string | null {
  for (const source of sources) {
    if (typeof source !== "string") continue;
    const token = source.trim().split(/\s+/)[0];
    if (!token) continue;
    return token.charAt(0).toLocaleUpperCase("pt-BR") + token.slice(1);
  }
  return null;
}

/** Saudação + subtítulo do header editorial da Home. */
export function buildHomeGreeting(firstName: string | null): {
  title: string;
  subtitle: string;
} {
  return {
    title: firstName ? `Bom dia, ${firstName}.` : "Bom dia.",
    subtitle: "Vamos organizar o que precisa da sua atenção hoje.",
  };
}

/**
 * Quem pode abrir o fluxo de criação de workspace na Home.
 *
 * Espelha EXATAMENTE o gate já existente no shell
 * (`DashboardLayout`: `profile?.is_admin || workspaces.length === 0`):
 * nenhum usuário sem permissão vê a ação, e quem ainda não tem workspace
 * nenhum sempre pode criar o primeiro.
 */
export function canCreateWorkspace(params: {
  isAdmin: boolean | null | undefined;
  workspaceCount: number;
}): boolean {
  return params.workspaceCount === 0 || params.isAdmin === true;
}
