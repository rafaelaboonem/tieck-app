import { createFileRoute } from "@tanstack/react-router";
import { timingSafeEqual } from "crypto";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

/**
 * Execution 5E.2D.2 — daily occurrence recovery entrypoint.
 *
 * GET /api/public/cron/execution-occurrences
 *
 * Protected by the same `CRON_SECRET` timing-safe contract as
 * `/api/public/cron/evidence-retention`. Only the Vercel Hobby daily cron
 * (`0 6 * * *`) may call this route.
 *
 * The handler:
 *   1. builds an EXPLICIT instant server-side (never accepts dates from the
 *      browser or the query string);
 *   2. calls EXACTLY ONCE the operational SECURITY DEFINER function
 *      `public.materialize_current_checklist_execution_occurrences(p_as_of)`
 *      through the server-only service_role client (the RPC derives each
 *      schedule's own local date from that instant and materializes
 *      [yesterday, today] per schedule — see migration 20260914120000);
 *   3. returns { inserted, asOf, window } with Cache-Control: no-store;
 *   4. fails closed with a sanitized 500 (no SQL text or internal details).
 *
 * The narrow per-schedule primitive is intentionally NOT callable here, no
 * table access (.from()) happens, and no data is written directly by this
 * route. Server-only: never import from browser code.
 */
export const Route = createFileRoute("/api/public/cron/execution-occurrences")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const authHeader = request.headers.get("Authorization");
        const cronSecret = process.env["CRON_SECRET"];

        if (!cronSecret) {
          console.error("CRON_SECRET not configured in environment");
          return new Response("Server configuration error", { status: 500 });
        }

        const expected = `Bearer ${cronSecret}`;

        if (
          !authHeader ||
          authHeader.length !== expected.length ||
          !timingSafeEqual(Buffer.from(authHeader), Buffer.from(expected))
        ) {
          return new Response("Unauthorized", { status: 401 });
        }

        try {
          // Explicit server-side instant — the cron never accepts a date from
          // the query string or any other client-controlled source.
          const asOf = new Date().toISOString();

          const { data, error } = await supabaseAdmin.rpc(
            "materialize_current_checklist_execution_occurrences",
            { p_as_of: asOf }
          );

          if (error || typeof data !== "number") {
            console.error("Occurrence materialization RPC failed");
            return new Response(
              JSON.stringify({ ok: false, error: "materialization_failed" }),
              { status: 500, headers: { "Content-Type": "application/json" } }
            );
          }

          return new Response(
            JSON.stringify({
              inserted: data,
              asOf,
              // Stable description: the RPC materializes [yesterday, today]
              // per schedule, each in its OWN stored IANA timezone.
              window: "yesterday + today (per-schedule timezone)",
            }),
            {
              status: 200,
              headers: {
                "Content-Type": "application/json",
                "Cache-Control": "no-store",
              },
            }
          );
        } catch (err: any) {
          console.error("Occurrence materialization cron error");
          return new Response(
            JSON.stringify({ ok: false, error: "materialization_failed" }),
            {
              status: 500,
              headers: { "Content-Type": "application/json" },
            }
          );
        }
      },
    },
  },
});
