/**
 * Execution 5E.2D.2 — /api/public/cron/execution-occurrences route + vercel.json.
 *
 * Behavioral tests drive the real GET handler (Route.options.server.handlers)
 * with the service_role client mocked (no network); structural tests verify
 * the route source and the vercel.json cron registry.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";

const h = vi.hoisted(() => {
  const admin: any = { rpc: vi.fn() };
  return { admin };
});

vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: h.admin,
}));

import { Route } from "@/routes/api/public/cron/execution-occurrences";

const SECRET = "cron-secret-5e2d2";

type GetHandler = (ctx: { request: Request }) => Promise<Response>;
const getHandler = (Route as any).options?.server?.handlers?.GET as GetHandler;

const get = (token?: string, url = "http://localhost/api/public/cron/execution-occurrences") =>
  getHandler({
    request: new Request(url, {
      method: "GET",
      headers: token !== undefined ? { Authorization: `Bearer ${token}` } : {},
    }),
  });

beforeEach(() => {
  vi.clearAllMocks();
  process.env.CRON_SECRET = SECRET;
  h.admin.rpc.mockResolvedValue({ data: 3, error: null });
});

afterEach(() => {
  delete process.env.CRON_SECRET;
});

// ───────────────────────────── auth contract ────────────────────────────────

describe("5E.2D.2 route auth (CRON_SECRET timing-safe)", () => {
  it("missing CRON_SECRET → 500 'Server configuration error'", async () => {
    delete process.env.CRON_SECRET;
    const res = await get(SECRET);
    expect(res.status).toBe(500);
    expect(await res.text()).toBe("Server configuration error");
    expect(h.admin.rpc).not.toHaveBeenCalled();
  });

  it("missing Authorization header → 401", async () => {
    const res = await get();
    expect(res.status).toBe(401);
    expect(h.admin.rpc).not.toHaveBeenCalled();
  });

  it("wrong token → 401", async () => {
    const res = await get("wrong-secret-5e2d2");
    expect(res.status).toBe(401);
    expect(h.admin.rpc).not.toHaveBeenCalled();
  });

  it("different-length token → 401 WITHOUT throwing from timingSafeEqual", async () => {
    const res = await get("x");
    expect(res.status).toBe(401);
    const res2 = await get(`${SECRET}-with-a-much-longer-suffix`);
    expect(res2.status).toBe(401);
    expect(h.admin.rpc).not.toHaveBeenCalled();
  });

  it("correct token → 200 and the response never echoes the secret", async () => {
    const res = await get(SECRET);
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).not.toContain(SECRET);
  });
});

// ───────────────────────────── RPC contract ─────────────────────────────────

describe("5E.2D.2 route RPC contract", () => {
  it("calls the operational RPC exactly once with a valid ISO p_as_of", async () => {
    const res = await get(SECRET);
    expect(res.status).toBe(200);
    expect(h.admin.rpc).toHaveBeenCalledTimes(1);
    const [fnName, args] = h.admin.rpc.mock.calls[0];
    expect(fnName).toBe("materialize_current_checklist_execution_occurrences");
    expect(Object.keys(args).sort()).toEqual(["p_as_of"]);
    expect(args.p_as_of).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    expect(!Number.isNaN(Date.parse(args.p_as_of))).toBe(true);
  });

  it("success payload contains inserted, asOf and window; Cache-Control is no-store", async () => {
    const res = await get(SECRET);
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect(res.headers.get("Content-Type")).toContain("application/json");
    const payload = await res.json();
    expect(payload.inserted).toBe(3);
    expect(payload.asOf).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    expect(typeof payload.window).toBe("string");
    expect(payload.window.length).toBeGreaterThan(0);
    expect(Object.keys(payload).sort()).toEqual(["asOf", "inserted", "window"]);
  });

  it("zero inserted rows is still success with inserted = 0", async () => {
    h.admin.rpc.mockResolvedValue({ data: 0, error: null });
    const res = await get(SECRET);
    expect(res.status).toBe(200);
    expect((await res.json()).inserted).toBe(0);
  });

  it("RPC error → 500 sanitized { ok:false, error:'materialization_failed' } (no SQL text)", async () => {
    h.admin.rpc.mockResolvedValue({
      data: null,
      error: { message: "occurrence_as_of_invalid: sensitive pg detail" },
    });
    const res = await get(SECRET);
    expect(res.status).toBe(500);
    const text = await res.text();
    expect(JSON.parse(text)).toEqual({ ok: false, error: "materialization_failed" });
    expect(text).not.toContain("occurrence_as_of_invalid");
    expect(text).not.toContain("sensitive pg detail");
  });

  it("invalid RPC result (non-number) → 500 sanitized", async () => {
    h.admin.rpc.mockResolvedValue({ data: "not-a-number", error: null });
    const res = await get(SECRET);
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ ok: false, error: "materialization_failed" });
  });

  it("thrown exception → 500 sanitized, no internal message leaked", async () => {
    h.admin.rpc.mockRejectedValue(new Error("internal boom detail"));
    const res = await get(SECRET);
    expect(res.status).toBe(500);
    const text = await res.text();
    expect(JSON.parse(text)).toEqual({ ok: false, error: "materialization_failed" });
    expect(text).not.toContain("internal boom detail");
  });

  it("no browser-controlled dates: query string is ignored and the RPC still gets a fresh p_as_of", async () => {
    await get(SECRET, "http://localhost/api/public/cron/execution-occurrences?asOf=1999-01-01&from=2020-01-01");
    expect(h.admin.rpc).toHaveBeenCalledTimes(1);
    const [, args] = h.admin.rpc.mock.calls[0];
    expect(args.p_as_of).not.toBe("1999-01-01");
    expect(args.p_as_of).not.toBe("2020-01-01");
    expect(args.p_as_of).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});

// ───────────────────────── structural guarantees ────────────────────────────

describe("5E.2D.2 structural guarantees", () => {
  const routePath = path.resolve(__dirname, "../../routes/api/public/cron/execution-occurrences.ts");
  const vercelPath = path.resolve(__dirname, "../../../vercel.json");

  it("route is GET-only, server-side, and never calls the narrow primitive or tables", () => {
    const src = fs.readFileSync(routePath, "utf8");
    // Code only (comments stripped): Buffer.from( must not mask .from( table access.
    const code = src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/[^\n]*/g, " ");
    expect(src).toContain("createFileRoute(\"/api/public/cron/execution-occurrences\")");
    expect(src).toContain("GET:");
    expect(code).not.toMatch(/POST|PUT|PATCH|DELETE/);
    expect(code).not.toContain("materialize_checklist_execution_occurrence_for_schedule");
    expect(code.replace(/Buffer\.from\(/g, "")).not.toMatch(/\.from\(/);
    expect(code).not.toMatch(/\.insert\(|\.update\(|\.delete\(/);
    expect(code).toContain('supabaseAdmin.rpc(\n            "materialize_current_checklist_execution_occurrences",');
    expect(code).toContain("timingSafeEqual");
    expect(code).toContain('process.env["CRON_SECRET"]');
    expect(code).toContain("new Date().toISOString()");
  });

  it("route never reads client-controlled input (no searchParams/query usage)", () => {
    const src = fs.readFileSync(routePath, "utf8");
    const code = src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/[^\n]*/g, " ");
    expect(code).not.toMatch(/searchParams|URLSearchParams|request\.url/);
  });

  it("no secret materializes in the route source", () => {
    const src = fs.readFileSync(routePath, "utf8");
    expect(src).not.toContain(SECRET);
    expect(src).not.toMatch(/CRON_SECRET\s*=\s*["']/);
  });

  it("vercel.json preserves buildCommand and the evidence-retention cron", () => {
    const vercel = JSON.parse(fs.readFileSync(vercelPath, "utf8"));
    expect(vercel.buildCommand).toBe("npm run build");
    expect(vercel.crons).toEqual(
      expect.arrayContaining([
        { path: "/api/public/cron/evidence-retention", schedule: "0 6 * * *" },
      ])
    );
  });

  it("vercel.json contains EXACTLY the two daily crons", () => {
    const vercel = JSON.parse(fs.readFileSync(vercelPath, "utf8"));
    expect(vercel.crons).toHaveLength(2);
    expect(vercel.crons).toEqual(
      expect.arrayContaining([
        { path: "/api/public/cron/evidence-retention", schedule: "0 6 * * *" },
        { path: "/api/public/cron/execution-occurrences", schedule: "0 6 * * *" },
      ])
    );
    const paths = vercel.crons.map((c: { path: string }) => c.path);
    expect(new Set(paths).size).toBe(2);
  });
});
