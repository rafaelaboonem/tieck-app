import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const MIGRATION_PATH = resolve(
  process.cwd(),
  "supabase/migrations/20260908140000_6a521_response_expiry_state_machine.sql"
);
const migrationSource = readFileSync(MIGRATION_PATH, "utf8");

const CREATE_RESPONSE_PATH = resolve(
  process.cwd(),
  "supabase/migrations/20260814021314_017b217f-9abf-4dbf-ba9f-a5acb7724dc9.sql"
);
const createResponseSource = readFileSync(CREATE_RESPONSE_PATH, "utf8");

// ─────────────────────────────────────────────────────────────────────────────
// Oracle puro que espelha EXATAMENTE a regra SQL da 6A.5.2.1:
//   submitted + dataRetention ON  → submitted_at + retentionDays (default 3)
//   submitted + dataRetention OFF → NULL
//   submitted_at NULL             → "untouched" (conservador, nunca inventa timestamp)
//   in_progress                   → nunca é alvo da regra (TTL de sessão intacto)
// ─────────────────────────────────────────────────────────────────────────────

export type ExpiryOracleResult = string | null | "untouched";

export function resolveSubmittedRetentionExpiry(opts: {
  dataRetention: boolean;
  retentionDays: number | null;
  submittedAt: string | null;
}): ExpiryOracleResult {
  if (!opts.submittedAt) return "untouched"; // fail-safe: sem timestamp inventado
  if (!opts.dataRetention) return null;
  const days = opts.retentionDays ?? 3; // baseline: fallback de 3 dias
  return new Date(new Date(opts.submittedAt).getTime() + days * 86_400_000).toISOString();
}

export type SimResponse = {
  status: "in_progress" | "submitted";
  submittedAt: string | null;
  expiresAt: string | null;
};

/** Simula update_checklist_retention / backfill: só submetidas mudam. */
export function simulateRetentionUpdate(
  responses: SimResponse[],
  enabled: boolean,
  retentionDays: number | null
): SimResponse[] {
  return responses.map((r) => {
    if (r.status !== "submitted") return { ...r, expiresAt: r.expiresAt };
    const expiry = resolveSubmittedRetentionExpiry({
      dataRetention: enabled,
      retentionDays,
      submittedAt: r.submittedAt,
    });
    return { ...r, expiresAt: expiry === "untouched" ? r.expiresAt : expiry };
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Structural — contrato do SQL (migration)
// ─────────────────────────────────────────────────────────────────────────────

describe("Evidence 6A.5.2.1 — migration: contrato estrutural", () => {
  it("finalize usa o MESMO instante para submitted_at e expires_at (v_submitted_at)", () => {
    expect(migrationSource).toMatch(/submitted_at = v_submitted_at/);
    expect(migrationSource).toMatch(/expires_at = v_expires_at/);
    expect(migrationSource).toMatch(/v_submitted_at timestamptz := now\(\)/);
  });

  it("B) submitted + dataRetention ON → expires_at = submitted_at + retentionDays", () => {
    expect(migrationSource).toMatch(/v_expires_at := v_submitted_at \+ \(v_retention_days \|\| ' days'\)::interval/);
    expect(migrationSource).toContain("(c.settings->>'retentionDays')::int, 3");
  });

  it("C) submitted + dataRetention OFF → expires_at = NULL", () => {
    expect(migrationSource).toMatch(/v_expires_at := NULL/);
    expect(migrationSource).toContain("COALESCE((c.settings->>'dataRetention')::boolean, false)");
  });

  it("D) finalize NÃO usa created_at + 24h como submitted expiry", () => {
    // O único uso de instante é v_submitted_at (now()), calculado a partir de submitted_at.
    expect(migrationSource).not.toMatch(/expires_at.*created_at/);
    expect(migrationSource).not.toMatch(/created_at.*24 hours/);
    expect(migrationSource).not.toMatch(/now\(\) \+ interval '24 hours'/);
  });

  it("finalize preserva validações e idempotência existentes", () => {
    expect(migrationSource).toContain("invalid_response_token");
    expect(migrationSource).toContain("checklist_not_published");
    expect(migrationSource).toContain("invalid_evidence_id");
    expect(migrationSource).toContain("IF v_current_status = 'submitted' THEN");
    expect(migrationSource).toContain("already_submitted");
  });

  it("grants do finalize preservados (anon, authenticated, service_role)", () => {
    expect(migrationSource).toMatch(/REVOKE ALL ON FUNCTION public\.finalize_public_response\(text, uuid, jsonb\) FROM PUBLIC;/);
    expect(migrationSource).toMatch(/GRANT EXECUTE ON FUNCTION public\.finalize_public_response\(text, uuid, jsonb\) TO anon, authenticated, service_role;/);
  });

  it("E/F) update_checklist_retention ON e OFF filtram SOMENTE status='submitted'", () => {
    const retentionFn =
      migrationSource.match(
        /CREATE OR REPLACE FUNCTION public\.update_checklist_retention\([\s\S]*?\$\$;/
      )?.[0] ?? "";
    expect(retentionFn).toContain("update_checklist_retention");
    const matches = retentionFn.match(/AND status = 'submitted'/g) ?? [];
    expect(matches.length).toBeGreaterThanOrEqual(2);
    const onBranch = retentionFn.match(/IF p_is_enabled THEN[\s\S]*?ELSE/);
    expect(onBranch?.[0]).toContain("AND status = 'submitted'");
    const offBranch = retentionFn.match(/ELSE[\s\S]*?END IF;/);
    expect(offBranch?.[0]).toContain("AND status = 'submitted'");
  });

  it("G) update_checklist_retention NÃO toca in_progress (os 2 UPDATEs de resposta filtram status='submitted')", () => {
    const retentionFn =
      migrationSource.match(
        /CREATE OR REPLACE FUNCTION public\.update_checklist_retention\([\s\S]*?\$\$;/
      )?.[0] ?? "";
    const updateStatements = retentionFn.match(/UPDATE public\.checklist_responses[\s\S]*?status = 'submitted'/g) ?? [];
    expect(updateStatements.length).toBe(2);
  });

  it("H) backfill: submitted + retention ON → submitted_at + days (nunca created_at)", () => {
    const backfill = migrationSource.match(/WITH updated AS \([\s\S]*?RAISE NOTICE/)?.[0] ?? "";
    expect(backfill).toContain("r.status = 'submitted'");
    expect(backfill).toContain("r.submitted_at IS NOT NULL");
    expect(backfill).toContain("r.submitted_at + (COALESCE((c.settings->>'retentionDays')::int, 3)");
    expect(backfill).not.toContain("created_at");
  });

  it("I) backfill: retention OFF → NULL", () => {
    const backfill = migrationSource.match(/WITH updated AS \([\s\S]*?RAISE NOTICE/)?.[0] ?? "";
    expect(backfill).toContain("ELSE NULL");
  });

  it("J) backfill NÃO toca in_progress (WHERE r.status = 'submitted')", () => {
    const backfill = migrationSource.match(/WITH updated AS \([\s\S]*?RAISE NOTICE/)?.[0] ?? "";
    expect(backfill).toContain("AND r.status = 'submitted'");
  });

  it("K) submitted com submitted_at NULL → só warning, sem timestamp inventado", () => {
    expect(migrationSource).toContain("status = 'submitted' AND submitted_at IS NULL");
    expect(migrationSource).toMatch(/RAISE WARNING '6A\.5\.2\.1: % submitted response\(s\) sem submitted_at/);
    expect(migrationSource).toContain("AND r.submitted_at IS NOT NULL");
  });

  it("L) unschedule remove SOMENTE cleanup-expired-checklist-responses", () => {
    expect(migrationSource).toContain("extname = 'pg_cron'");
    expect(migrationSource).toContain("cron.job WHERE jobname = 'cleanup-expired-checklist-responses'");
    expect(migrationSource).toContain("PERFORM cron.unschedule('cleanup-expired-checklist-responses')");
    expect(migrationSource).not.toContain("cron.unschedule('cleanup-expired-checklist-responses') ||");
    const unscheduleCount = (migrationSource.match(/cron\.unschedule/g) ?? []).length;
    expect(unscheduleCount).toBe(1);
  });

  it("M/N) unschedule é idempotente e nunca falha (EXCEPTION WHEN OTHERS + guard pg_cron)", () => {
    expect(migrationSource).toMatch(/EXCEPTION WHEN OTHERS THEN/);
    expect(migrationSource).toMatch(/RAISE WARNING '6A\.5\.2\.1: não foi possível remover legacy cron job \(idempotente\)/);
  });

  it("migration NUNCA exclui rows nem remove storage objects", () => {
    expect(migrationSource).not.toMatch(/DELETE FROM public\.checklist_responses/i);
    expect(migrationSource).not.toMatch(/DELETE FROM public\.checklist_evidences/i);
    expect(migrationSource).not.toMatch(/storage\.from/i);
  });

  it("migration NÃO altera create_public_response (TTL de sessão 24h intacto)", () => {
    // A menção no comentário do header é documental; a função não é redefinida.
    expect(migrationSource).not.toMatch(/FUNCTION public\.create_public_response/);
    expect(createResponseSource).toContain("now() + interval '24 hours'");
  });

  it("Q) migration NÃO toca Camera AI / RPC 6A.3.3", () => {
    expect(migrationSource).not.toContain("camera_ai_attempts");
    expect(migrationSource).not.toContain("get_camera_ai_attempts_for_responses");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Oracle — semântica da state machine (A–K)
// ─────────────────────────────────────────────────────────────────────────────

describe("Evidence 6A.5.2.1 — regra de expiry (oracle)", () => {
  it("A) in_progress nunca é alvo da regra — TTL de sessão permanece", () => {
    const before: SimResponse[] = [
      { status: "in_progress", submittedAt: null, expiresAt: "2026-09-09T13:33:42.000Z" },
    ];
    const afterOn = simulateRetentionUpdate(before, true, 5);
    const afterOff = simulateRetentionUpdate(before, false, 5);
    expect(afterOn[0].expiresAt).toBe(before[0].expiresAt);
    expect(afterOff[0].expiresAt).toBe(before[0].expiresAt);
  });

  it("B) submitted + ON + 5 dias → submitted_at + 5 days", () => {
    const expiry = resolveSubmittedRetentionExpiry({
      dataRetention: true,
      retentionDays: 5,
      submittedAt: "2026-09-08T02:25:46Z",
    });
    expect(expiry).toBe("2026-09-13T02:25:46.000Z");
  });

  it("C) submitted + OFF → NULL", () => {
    const expiry = resolveSubmittedRetentionExpiry({
      dataRetention: false,
      retentionDays: 5,
      submittedAt: "2026-09-08T02:25:46Z",
    });
    expect(expiry).toBeNull();
  });

  it("D) regra NÃO usa created_at (assinatura do oracle só aceita submittedAt)", () => {
    // A função não tem parâmetro created_at — por construção, o expiry
    // só pode derivar de submittedAt.
    const fn = resolveSubmittedRetentionExpiry.toString();
    expect(fn).toContain("submittedAt");
    expect(fn).not.toContain("createdAt");
  });

  it("K) submitted_at NULL → untouched (conservador, sem exclusão prematura)", () => {
    const expiry = resolveSubmittedRetentionExpiry({
      dataRetention: true,
      retentionDays: 5,
      submittedAt: null,
    });
    expect(expiry).toBe("untouched");
  });

  it("default de retentionDays é 3 (baseline), sem inventar outro", () => {
    const expiry = resolveSubmittedRetentionExpiry({
      dataRetention: true,
      retentionDays: null,
      submittedAt: "2026-09-08T02:25:46Z",
    });
    expect(expiry).toBe("2026-09-11T02:25:46.000Z");
  });

  it("E) update ON → submitted recalculado", () => {
    const before: SimResponse[] = [
      { status: "submitted", submittedAt: "2026-09-08T02:25:46Z", expiresAt: "2026-09-09T02:25:34Z" },
    ];
    const after = simulateRetentionUpdate(before, true, 5);
    expect(after[0].expiresAt).toBe("2026-09-13T02:25:46.000Z");
  });

  it("F) update OFF → submitted expires_at = NULL", () => {
    const before: SimResponse[] = [
      { status: "submitted", submittedAt: "2026-09-08T02:25:46Z", expiresAt: "2026-09-13T02:25:46Z" },
    ];
    const after = simulateRetentionUpdate(before, false, 5);
    expect(after[0].expiresAt).toBeNull();
  });

  it("G) update ON/OFF → in_progress preservada (sessão não expira por retenção)", () => {
    const before: SimResponse[] = [
      { status: "in_progress", submittedAt: null, expiresAt: "2026-09-09T13:33:42.000Z" },
      { status: "submitted", submittedAt: "2026-09-08T02:25:46Z", expiresAt: "2026-09-09T02:25:34Z" },
    ];
    const afterOn = simulateRetentionUpdate(before, true, 5);
    const afterOff = simulateRetentionUpdate(before, false, 5);
    expect(afterOn[0].expiresAt).toBe("2026-09-09T13:33:42.000Z");
    expect(afterOff[0].expiresAt).toBe("2026-09-09T13:33:42.000Z");
    expect(afterOn[1].expiresAt).toBe("2026-09-13T02:25:46.000Z");
    expect(afterOff[1].expiresAt).toBeNull();
  });

  it("H/I) backfill = mesma regra (submitted ON → +days, OFF → NULL, in_progress intacta)", () => {
    const before: SimResponse[] = [
      { status: "submitted", submittedAt: "2026-09-08T02:25:46Z", expiresAt: "2026-09-09T02:25:34Z" },
      { status: "in_progress", submittedAt: null, expiresAt: "2026-09-09T13:33:42.000Z" },
    ];
    const on = simulateRetentionUpdate(before, true, 5);
    const off = simulateRetentionUpdate(before, false, 5);
    expect(on[0].expiresAt).toBe("2026-09-13T02:25:46.000Z");
    expect(off[0].expiresAt).toBeNull();
    expect(on[1].expiresAt).toBe(before[1].expiresAt);
    expect(off[1].expiresAt).toBe(before[1].expiresAt);
  });

  it("dado real: created 02:25:34 / submitted 02:25:46 / ON 5d → expires ≈ 09-13 02:25:46 (não 09-09)", () => {
    const expiry = resolveSubmittedRetentionExpiry({
      dataRetention: true,
      retentionDays: 5,
      submittedAt: "2026-09-08T02:25:46Z",
    });
    expect(expiry).toBe("2026-09-13T02:25:46.000Z");
    expect(expiry).not.toBe("2026-09-09T02:25:34.000Z");
  });

  it("sessão real in_progress e1c71016… permanece com TTL de 24h", () => {
    // O backfill/update jamais deve transformar esse expires_at em NULL nem
    // recalculá-lo com retentionDays.
    const before: SimResponse[] = [
      { status: "in_progress", submittedAt: null, expiresAt: "2026-09-09T13:33:42.467665+00" },
    ];
    const after = simulateRetentionUpdate(before, true, 5);
    expect(after[0].expiresAt).toBe("2026-09-09T13:33:42.467665+00");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Preservação 6A.5.1 / 6A.5.2
// ─────────────────────────────────────────────────────────────────────────────

describe("Evidence 6A.5.2.1 — preservação do cleaner 6A.5.2 e primitive 6A.5.1", () => {
  const cleanerSource = readFileSync(
    resolve(process.cwd(), "src/server/evidence/retention-cleanup.server.ts"),
    "utf8"
  );

  it("O) cleaner 6A.5.2 continua selecionando por expires_at (sem conhecer status)", () => {
    expect(cleanerSource).toContain('.not("expires_at", "is", null)');
    expect(cleanerSource).toContain('.lte("expires_at", nowIso)');
    expect(cleanerSource).toContain("deleteResponseWithEvidence");
    // Nenhuma consulta a dataRetention/status no runner — só a coluna canônica.
    expect(cleanerSource).not.toMatch(/['"]dataRetention['"]/);
    expect(cleanerSource).not.toMatch(/settings->>/);
  });

  it("P) migration não redefine o primitive storage-first 6A.5.1 (deleteResponseWithEvidence é TS, não SQL)", () => {
    // A menção no comentário do header é documental; não há definição/invocação SQL.
    expect(migrationSource).not.toMatch(/deleteResponseWithEvidence\(/);
    expect(migrationSource).not.toMatch(/storage\.from/);
  });
});