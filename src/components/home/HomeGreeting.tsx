import { buildHomeGreeting } from "@/lib/home-presentation";

/**
 * Home 6B.2L — saudação editorial abaixo da topbar.
 *
 * O nome vem do perfil já carregado (`resolveFirstName`, chamado na rota).
 * Sem fonte confiável o texto é o fallback neutro "Bom dia." — nunca um nome
 * inventado e nunca um nome derivado do e-mail.
 */
export function HomeGreeting({ firstName }: { firstName: string | null }) {
  const { title, subtitle } = buildHomeGreeting(firstName);

  return (
    <section aria-label="Saudação" data-testid="home-greeting" className="space-y-1">
      <h1
        data-testid="home-greeting-title"
        className="text-2xl font-semibold tracking-tight text-neutral-900 sm:text-[28px]"
      >
        {title}
      </h1>
      <p data-testid="home-greeting-subtitle" className="text-sm text-neutral-500">
        {subtitle}
      </p>
    </section>
  );
}
