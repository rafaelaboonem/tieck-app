import { createFileRoute, redirect } from "@tanstack/react-router";
import { z } from "zod";

const searchSchema = z.object({
  redirect: z.string().optional(),
});

export const Route = createFileRoute("/cadastrar")({
  validateSearch: (search) => searchSchema.parse(search),
  beforeLoad: ({ search }) => {
    throw redirect({
      to: "/cadastro",
      search: search.redirect ? { redirect: search.redirect } : {},
      replace: true,
    });
  },
});
