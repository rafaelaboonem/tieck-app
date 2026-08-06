import { createFileRoute } from "@tanstack/react-router";
import { AuthPage } from "@/components/AuthPage";
import { z } from "zod";

const loginSearchSchema = z.object({
  redirect: z.string().optional(),
});

export const Route = createFileRoute("/login")({
  component: LoginRoute,
  validateSearch: (search) => loginSearchSchema.parse(search),
});

function LoginRoute() {
  const { redirect } = Route.useSearch();
  return <AuthPage mode="login" redirect={redirect} />;
}
