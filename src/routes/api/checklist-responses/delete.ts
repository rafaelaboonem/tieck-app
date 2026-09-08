import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  deleteResponseWithEvidence,
  resolveResponseDeleteAuthorization,
} from "@/server/evidence/delete-response-with-evidence.server";

/**
 * Evidence 6A.5.1 — authenticated endpoint for manually deleting a checklist
 * response. The browser only supplies `responseId`; buckets and storage paths
 * are resolved server-side from the database via the service role.
 */
const DeleteResponseSchema = z.object({
  responseId: z.string().uuid(),
});

// Concurrency guard: one destructive delete per response at a time.
const inFlightDeletes = new Set<string>();

export const Route = createFileRoute("/api/checklist-responses/delete")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const requestId = crypto.randomUUID();
        try {
          const authHeader = request.headers.get("Authorization");
          if (!authHeader?.startsWith("Bearer ")) {
            return new Response(JSON.stringify({ ok: false, code: "unauthorized", requestId }), { status: 401 });
          }
          const token = authHeader.split(" ")[1];
          const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
          if (authError || !user) {
            return new Response(JSON.stringify({ ok: false, code: "unauthorized", requestId }), { status: 401 });
          }

          const body = await request.json().catch(() => null);
          const parsed = DeleteResponseSchema.safeParse(body ?? {});
          if (!parsed.success) {
            return new Response(JSON.stringify({ ok: false, code: "invalid_input", requestId }), { status: 400 });
          }
          const { responseId } = parsed.data;

          if (inFlightDeletes.has(responseId)) {
            return new Response(JSON.stringify({ ok: false, code: "already_in_progress", requestId }), { status: 409 });
          }
          inFlightDeletes.add(responseId);
          try {
            const authorization = await resolveResponseDeleteAuthorization(responseId, user.id, supabaseAdmin);
            if (!authorization.allowed) {
              return new Response(
                JSON.stringify({ ok: false, code: authorization.code, requestId }),
                { status: authorization.code === "not_found" ? 404 : 403 }
              );
            }

            const result = await deleteResponseWithEvidence(responseId, supabaseAdmin);
            if (!result.ok) {
              return new Response(
                JSON.stringify({ ok: false, code: result.code, requestId }),
                { status: result.code === "not_found" ? 404 : 500 }
              );
            }

            return new Response(JSON.stringify({ ok: true, responseId, requestId }), { status: 200 });
          } finally {
            inFlightDeletes.delete(responseId);
          }
        } catch (error) {
          console.error("[Response-Delete] Unexpected error:", error);
          return new Response(JSON.stringify({ ok: false, code: "internal_error", requestId }), { status: 500 });
        }
      },
    },
  },
});