import { createFileRoute } from "@tanstack/react-router";
import { AuthPage } from "@/components/AuthPage";
import { z } from "zod";

const searchSchema = z.object({
  redirect: z.string().optional(),
});

export const Route = createFileRoute("/cadastro")({
  component: CadastrarRoute,
  validateSearch: (search) => searchSchema.parse(search),
});

function CadastrarRoute() {
  const { redirect } = Route.useSearch();
  return <AuthPage mode="signup" redirect={redirect} />;
}
