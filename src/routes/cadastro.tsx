import { createFileRoute } from "@tanstack/react-router";
import { AuthPage } from "@/components/AuthPage";

export const Route = createFileRoute("/cadastro")({
  component: CadastrarRoute,
  validateSearch: (search: Record<string, unknown>) => ({
    redirect: typeof search.redirect === "string" ? (search.redirect as string) : undefined,
  }),
});

function CadastrarRoute() {
  const { redirect } = Route.useSearch();
  return <AuthPage mode="signup" redirect={redirect} />;
}