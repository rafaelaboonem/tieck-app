import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";

// ─────────────────────────────────────────────────────────────────────────────
// Mocks: supabaseAdmin (selection query) + deleteResponseWithEvidence (6A.5.1)
// ─────────────────────────────────────────────────────────────────────────────

const h = vi.hoisted(() => {
  const admin: any = { from: vi.fn() };
  const deleteFn = vi.fn();
  return { admin, deleteFn };
});

vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: h.admin,
}));

vi.mock("@/server/evidence/delete-response-with-evidence.server", () => ({
  deleteResponseWithEvidence: h.deleteFn,
}));

import {
  isRetentionCandidate,
  runEvidenceRetentionCleanup,
  EVIDENCE_RETENTION_BATCH_SIZE,
} from "@/server/evidence/retention-cleanup.server";
import { Route } from "@/routes/api/public/cron/evidence-retention";

const NOW = "2026-09-09T12:00:00.000Z";

const row = (id: string, expiresAt: string | null, status = "in_progress") => ({
  id,
  status,
  expires_at: expiresAt,
});

// Captures the query-builder chain so tests can assert the SQL contract.
const chain = {
  not: null as any,
  lte: null as any,
  order: null as any,
  limit: null as any,
};

function seedCandidates(rows: any[]) {
  h.admin.from.mockImplementation((table: string) => {
    if (table === "checklist_responses") {
      return {
        select: vi.fn(() => ({
          not: vi.fn((col: string, op: string, val: unknown) => {
            chain.not = { col, op, val };
            return {
              lte: vi.fn((lteCol: string, lteVal: unknown) => {
                chain.lte = { col: lteCol, val: lteVal };
                return {
                  order: vi.fn((orderCol: string, opts: any) => {
                    chain.order = { col: orderCol, opts };
                    return {
                      limit: vi.fn(async (n: number) => {
                        chain.limit = { n };
                        return { data: rows.slice(0, n), error: null };
                      }),
                    };
                  }),
                };
              }),
            };
          }),
        })),
      };
    }
    throw new Error(`unexpected table ${table}`);
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Candidate rule (A–G)
// ─────────────────────────────────────────────────────────────────────────────

describe("Evidence 6A.5.2 — isRetentionCandidate (expires_at é a fonte de verdade)", () => {
  it("A) expires_at no passado → candidato", () => {
    expect(isRetentionCandidate({ expires_at: "2026-09-08T10:00:00.000Z" }, NOW)).toBe(true);
  });

  it("B) expires_at no futuro → não candidato", () => {
    expect(isRetentionCandidate({ expires_at: "2026-09-10T10:00:00.000Z" }, NOW)).toBe(false);
  });

  it("C) expires_at null → não candidato (retenção desligada / sem TTL)", () => {
    expect(isRetentionCandidate({ expires_at: null }, NOW)).toBe(false);
  });

  it("D) in_progress abandonada (submitted_at null) com expires_at passado → candidato", () => {
    // A regra não depende de status nem de submitted_at — só do deadline canônico.
    expect(isRetentionCandidate({ expires_at: "2026-09-08T10:00:00.000Z" }, NOW)).toBe(true);
  });

  it("E) in_progress com expires_at futuro → preservado", () => {
    expect(isRetentionCandidate({ expires_at: "2026-09-10T10:00:00.000Z" }, NOW)).toBe(false);
  });

  it("F) completed/submitted com expires_at passado → candidato", () => {
    expect(isRetentionCandidate({ expires_at: "2026-09-08T10:00:00.000Z" }, NOW)).toBe(true);
  });

  it("G) completed/submitted com expires_at null → preservado permanentemente", () => {
    expect(isRetentionCandidate({ expires_at: null }, NOW)).toBe(false);
  });

  it("formato timestamptz com offset é comparado por instante (não lexicograficamente)", () => {
    expect(isRetentionCandidate({ expires_at: "2026-09-08T10:00:00+00:00" }, NOW)).toBe(true);
    expect(isRetentionCandidate({ expires_at: "2026-09-10T10:00:00+00:00" }, NOW)).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Runner — selection contract, batch, failure isolation
// ─────────────────────────────────────────────────────────────────────────────

describe("Evidence 6A.5.2 — runEvidenceRetentionCleanup", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.deleteFn.mockReset();
    h.deleteFn.mockResolvedValue({ ok: true, responseId: "x", removedFileCount: 0 });
  });

  it("A2) seleção usa not-null + lte now + order ASC + limit batch (sem filtro de status)", async () => {
    seedCandidates([row("r1", "2026-09-08T10:00:00.000Z")]);
    await runEvidenceRetentionCleanup(h.admin, { nowIso: NOW, batchSize: 50 });
    expect(chain.not).toEqual({ col: "expires_at", op: "is", val: null });
    expect(chain.lte).toEqual({ col: "expires_at", val: NOW });
    expect(chain.order).toEqual({ col: "expires_at", opts: { ascending: true } });
    expect(chain.limit).toEqual({ n: 50 });
  });

  it("H) chama deleteResponseWithEvidence para cada candidato, com o id correto", async () => {
    seedCandidates([row("r1", "2026-09-08T10:00:00.000Z"), row("r2", "2026-09-08T11:00:00.000Z")]);
    const result = await runEvidenceRetentionCleanup(h.admin, { nowIso: NOW });
    expect(h.deleteFn).toHaveBeenCalledTimes(2);
    expect(h.deleteFn.mock.calls[0][0]).toBe("r1");
    expect(h.deleteFn.mock.calls[1][0]).toBe("r2");
    expect(result).toEqual({ ok: true, scanned: 2, deleted: 2, failed: 0, skipped: 0 });
  });

  it("sem candidatos → execução vazia bem-sucedida", async () => {
    seedCandidates([]);
    const result = await runEvidenceRetentionCleanup(h.admin, { nowIso: NOW });
    expect(result).toEqual({ ok: true, scanned: 0, deleted: 0, failed: 0, skipped: 0 });
    expect(h.deleteFn).not.toHaveBeenCalled();
  });

  it("K) storage failure em uma response não aborta o lote — continua para as próximas", async () => {
    seedCandidates([
      row("r1", "2026-09-08T10:00:00.000Z"),
      row("r2", "2026-09-08T11:00:00.000Z"),
      row("r3", "2026-09-08T12:00:00.000Z"),
    ]);
    h.deleteFn
      .mockResolvedValueOnce({ ok: false, code: "storage_failure", responseId: "r1" })
      .mockResolvedValueOnce({ ok: true, responseId: "r2", removedFileCount: 1 })
      .mockResolvedValueOnce({ ok: true, responseId: "r3", removedFileCount: 0 });
    const result = await runEvidenceRetentionCleanup(h.admin, { nowIso: NOW });
    expect(h.deleteFn).toHaveBeenCalledTimes(3);
    expect(result).toEqual({ ok: true, scanned: 3, deleted: 2, failed: 1, skipped: 0 });
  });

  it("L) response que falhou permanece elegível para retry natural na próxima execução", async () => {
    seedCandidates([row("r1", "2026-09-08T10:00:00.000Z")]);
    h.deleteFn.mockResolvedValue({ ok: false, code: "storage_failure", responseId: "r1" });
    // Execução 1: falha, row preservada (expires_at continua vencido).
    const first = await runEvidenceRetentionCleanup(h.admin, { nowIso: NOW });
    expect(first.failed).toBe(1);
    // Execução 2: a mesma row é selecionada de novo (a fila é a própria row expirada).
    const second = await runEvidenceRetentionCleanup(h.admin, { nowIso: NOW });
    expect(second.failed).toBe(1);
    expect(h.deleteFn).toHaveBeenCalledTimes(2);
    // Nenhum delete direto de DB aconteceu fora do primitive (que não foi chamado com sucesso).
  });

  it("M) not_found concorrente → skipped/idempotente (não vira falha nem erro fatal)", async () => {
    seedCandidates([
      row("r1", "2026-09-08T10:00:00.000Z"),
      row("r2", "2026-09-08T11:00:00.000Z"),
    ]);
    h.deleteFn
      .mockResolvedValueOnce({ ok: false, code: "not_found", responseId: "r1" })
      .mockResolvedValueOnce({ ok: true, responseId: "r2", removedFileCount: 0 });
    const result = await runEvidenceRetentionCleanup(h.admin, { nowIso: NOW });
    expect(result).toEqual({ ok: true, scanned: 2, deleted: 1, failed: 0, skipped: 1 });
  });

  it("erro inesperado do primitive → contabilizado como failed, lote continua", async () => {
    seedCandidates([row("r1", "2026-09-08T10:00:00.000Z"), row("r2", "2026-09-08T11:00:00.000Z")]);
    h.deleteFn.mockRejectedValueOnce(new Error("boom")).mockResolvedValueOnce({ ok: true, responseId: "r2", removedFileCount: 0 });
    const result = await runEvidenceRetentionCleanup(h.admin, { nowIso: NOW });
    expect(result).toEqual({ ok: true, scanned: 2, deleted: 1, failed: 1, skipped: 0 });
  });

  it("R) batch limit respeitado — processa no máximo batchSize, mesmo com mais candidatos", async () => {
    seedCandidates([
      row("r1", "2026-09-08T10:00:00.000Z"),
      row("r2", "2026-09-08T11:00:00.000Z"),
      row("r3", "2026-09-08T12:00:00.000Z"),
    ]);
    const result = await runEvidenceRetentionCleanup(h.admin, { nowIso: NOW, batchSize: 2 });
    expect(chain.limit).toEqual({ n: 2 });
    expect(h.deleteFn).toHaveBeenCalledTimes(2);
    expect(result.scanned).toBe(2);
  });

  it("constante de batch padrão = 100", () => {
    expect(EVIDENCE_RETENTION_BATCH_SIZE).toBe(100);
  });

  it("T) resultado não expõe storage paths nem tokens", async () => {
    seedCandidates([row("r1", "2026-09-08T10:00:00.000Z")]);
    const result = await runEvidenceRetentionCleanup(h.admin, { nowIso: NOW });
    const json = JSON.stringify(result);
    expect(json).not.toContain("storage_path");
    expect(json).not.toContain("path");
    expect(json).not.toContain("token");
    expect(json).not.toContain("visitor");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Route — auth (N–Q)
// ─────────────────────────────────────────────────────────────────────────────

describe("Evidence 6A.5.2 — GET /api/public/cron/evidence-retention", () => {
  const SECRET = "cron-secret-6a52";

  type GetHandler = (ctx: { request: Request }) => Promise<Response>;
  const getHandler = (Route as any).options?.server?.handlers?.GET as GetHandler;

  const get = (token?: string) =>
    getHandler({
      request: new Request("http://localhost/api/public/cron/evidence-retention", {
        method: "GET",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      }),
    });

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.CRON_SECRET = SECRET;
    h.deleteFn.mockResolvedValue({ ok: true, responseId: "x", removedFileCount: 0 });
    seedCandidates([]);
  });

  afterEach(() => {
    delete process.env.CRON_SECRET;
  });

  it("N) CRON_SECRET ausente → 500 server configuration error", async () => {
    delete process.env.CRON_SECRET;
    const res = await get(SECRET);
    expect(res.status).toBe(500);
    expect(await res.text()).toBe("Server configuration error");
  });

  it("O) Authorization ausente → 401", async () => {
    const res = await get();
    expect(res.status).toBe(401);
  });

  it("P) Authorization incorreto → 401", async () => {
    const res = await get("wrong-secret-6a52");
    expect(res.status).toBe(401);
    expect(h.deleteFn).not.toHaveBeenCalled();
  });

  it("Q) Authorization correto → 200 e processamento executado", async () => {
    seedCandidates([row("r1", "2026-09-08T10:00:00.000Z")]);
    const res = await get(SECRET);
    expect(res.status).toBe(200);
    const payload = await res.json();
    expect(payload.ok).toBe(true);
    expect(payload.deleted).toBe(1);
    expect(h.deleteFn).toHaveBeenCalledTimes(1);
  });

  it("erro de query → 500 sanitizado (cleanup_failed)", async () => {
    h.admin.from.mockImplementation(() => {
      throw new Error("selection boom");
    });
    const res = await get(SECRET);
    expect(res.status).toBe(500);
    const payload = await res.json();
    expect(payload).toEqual({ ok: false, error: "cleanup_failed" });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Structural guarantees (I, J, U, V)
// ─────────────────────────────────────────────────────────────────────────────

describe("Evidence 6A.5.2 — estrutura / segurança", () => {
  const routePath = path.resolve(__dirname, "../../../routes/api/public/cron/evidence-retention.ts");
  const runnerPath = path.resolve(__dirname, "../retention-cleanup.server.ts");
  const vercelPath = path.resolve(__dirname, "../../../../vercel.json");

  it("I) cron NÃO invoca cleanup_expired_responses (legacy SQL) — só pode citar em comentário, nunca chamar", () => {
    const routeSource = fs.readFileSync(routePath, "utf8");
    const runnerSource = fs.readFileSync(runnerPath, "utf8");
    // Nenhuma invocação (nem via rpc nem chamada direta) pode existir.
    expect(routeSource).not.toContain('rpc("cleanup_expired_responses")');
    expect(runnerSource).not.toContain('rpc("cleanup_expired_responses")');
    expect(routeSource).not.toContain("cleanup_expired_responses(");
    expect(runnerSource).not.toContain("cleanup_expired_responses(");
  });

  it("J) cron NÃO executa delete direto de checklist_responses — só seleciona; o delete vive no primitive 6A.5.1", () => {
    const runnerSource = fs.readFileSync(runnerPath, "utf8");
    expect(runnerSource).not.toContain(".delete()");
    expect(runnerSource).not.toContain(".delete(");
    expect(runnerSource).toContain('.select("id, status, expires_at")');
    expect(runnerSource).toContain("deleteResponseWithEvidence");
  });

  it("rota é GET protegida por CRON_SECRET com timingSafeEqual", () => {
    const routeSource = fs.readFileSync(routePath, "utf8");
    expect(routeSource).toContain("GET:");
    expect(routeSource).toContain("timingSafeEqual");
    expect(routeSource).toContain('process.env["CRON_SECRET"]');
    expect(routeSource).toContain("runEvidenceRetentionCleanup");
  });

  it("U) vercel.json preserva buildCommand", () => {
    const vercel = JSON.parse(fs.readFileSync(vercelPath, "utf8"));
    expect(vercel.buildCommand).toBe("npm run build");
  });

  it("V) vercel.json mantém a schedule diária (0 6 * * *) do evidence-retention (5E.2D.2 adicionou o segundo cron)", () => {
    const vercel = JSON.parse(fs.readFileSync(vercelPath, "utf8"));
    // 5E.2D.2: um segundo cron diário (execution-occurrences) entrou no
    // registro; a invariante desta fase é que o cron de evidence-retention
    // permanece registrado, diário, às 0 6 * * *.
    expect(vercel.crons).toEqual(
      expect.arrayContaining([
        {
          path: "/api/public/cron/evidence-retention",
          schedule: "0 6 * * *",
        },
      ])
    );
  });
});