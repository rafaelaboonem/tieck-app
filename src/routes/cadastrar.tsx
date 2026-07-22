import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/cadastrar")({
  validateSearch: (search: Record<string, unknown>) => ({
    redirect: typeof search.redirect === "string" ? search.redirect : undefined,
  }),
  beforeLoad: ({ search }) => {
    throw redirect({
      to: "/cadastro",
      search: search.redirect ? { redirect: search.redirect } : undefined,
      replace: true,
    });
  },
});