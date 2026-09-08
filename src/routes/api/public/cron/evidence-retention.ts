import { createFileRoute } from "@tanstack/react-router";
import { timingSafeEqual } from "crypto";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { runEvidenceRetentionCleanup } from "@/server/evidence/retention-cleanup.server";

/**
 * Evidence 6A.5.2 — automatic retention cleanup entrypoint.
 *
 * GET /api/public/cron/evidence-retention
 *
 * Protected by the same `CRON_SECRET` timing-safe contract as
 * `/api/public/cron/overdue-assignments`. Only schedules (Vercel cron,
 * `0 6 * * *`) may call this route.
 *
 * The legacy SQL-only cleanup function `cleanup_expired_responses` is
 * intentionally NOT invoked: it deletes DB rows without removing Storage
 * objects (LEGACY / NÃO USAR para respostas com evidências persistidas).
 */
export const Route = createFileRoute("/api/public/cron/evidence-retention")({
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
          const result = await runEvidenceRetentionCleanup(supabaseAdmin);
          return new Response(JSON.stringify(result), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        } catch (err: any) {
          console.error("Evidence retention cron error:", err?.message ?? err);
          return new Response(
            JSON.stringify({ ok: false, error: "cleanup_failed" }),
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