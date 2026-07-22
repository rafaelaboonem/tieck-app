import { createFileRoute } from "@tanstack/react-router";
import { AuthPage } from "@/components/AuthPage";

export const Route = createFileRoute("/login")({
  component: LoginRoute,
  validateSearch: (search: Record<string, unknown>) => ({
    redirect: typeof search.redirect === "string" ? (search.redirect as string) : undefined,
  }),
});

function LoginRoute() {
  const { redirect } = Route.useSearch();
  return <AuthPage mode="login" redirect={redirect} />;
}