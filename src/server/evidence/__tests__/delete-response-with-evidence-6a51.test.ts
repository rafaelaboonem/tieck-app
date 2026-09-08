import { describe, it, expect, vi, beforeEach } from "vitest";
import fs from "node:fs";
import path from "node:path";

import {
  isSafeStoragePath,
  normalizeEvidenceBucket,
  collectEvidencePathsByBucket,
  isStorageNotFoundError,
  deleteResponseWithEvidence,
  resolveResponseDeleteAuthorization,
} from "@/server/evidence/delete-response-with-evidence.server";

// ─────────────────────────────────────────────────────────────────────────────
// Mock supabaseAdmin for the endpoint tests
// ─────────────────────────────────────────────────────────────────────────────

const h = vi.hoisted(() => {
  const admin: any = {
    auth: { getUser: vi.fn() },
    from: vi.fn(),
    rpc: vi.fn(),
    storage: { from: vi.fn() },
  };
  return { admin };
});

vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: h.admin,
}));

import { Route } from "@/routes/api/checklist-responses/delete";

type PostHandler = (ctx: { request: Request }) => Promise<Response>;
const postHandler = (Route as any).options?.server?.handlers?.POST as PostHandler;

const post = (body: unknown, token = "tok-1") =>
  postHandler({
    request: new Request("http://localhost/api/checklist-responses/delete", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    }),
  });

const noAuthPost = (body: unknown) =>
  postHandler({
    request: new Request("http://localhost/api/checklist-responses/delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  });

// ─────────────────────────────────────────────────────────────────────────────
// Small mock client builder for helper-level tests
// ─────────────────────────────────────────────────────────────────────────────

type MockOpts = {
  response?: any;
  evidences?: any[];
  checklist?: any;
  access?: any[];
  removeError?: any | null;
  removeErrors?: (any | null)[];
  deleteData?: any[] | null;
  deleteError?: any | null;
};

function makeClient(opts: MockOpts) {
  const removeCalls: { bucket: string; paths: string[] }[] = [];
  const storageFrom = vi.fn((bucket: string) => ({
    remove: vi.fn(async (paths: string[]) => {
      const idx = removeCalls.length;
      const err = opts.removeError ?? opts.removeErrors?.[idx] ?? null;
      removeCalls.push({ bucket, paths });
      return { data: err ? null : { path: paths }, error: err };
    }),
  }));

  const delSelect = vi.fn(async () => ({ data: opts.deleteData ?? [{ id: "r1" }], error: opts.deleteError ?? null }));

  const from = vi.fn((table: string) => {
    if (table === "checklist_responses") {
      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            maybeSingle: vi.fn(async () => ({ data: opts.response ?? null, error: null })),
          })),
        })),
        delete: vi.fn(() => ({
          eq: vi.fn(() => ({ select: delSelect })),
        })),
      };
    }
    if (table === "checklist_evidences") {
      return {
        select: vi.fn(() => ({
          eq: vi.fn(async () => ({ data: opts.evidences ?? [], error: null })),
        })),
      };
    }
    if (table === "checklists") {
      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            maybeSingle: vi.fn(async () => ({ data: opts.checklist ?? null, error: null })),
          })),
        })),
      };
    }
    throw new Error(`unexpected table ${table}`);
  });

  const rpc = vi.fn(async (fnName: string) => {
    if (fnName === "get_checklist_access") return { data: opts.access ?? [], error: null };
    throw new Error(`unexpected rpc ${fnName}`);
  });

  const client = { from, rpc, storage: { from: storageFrom } } as any;
  return { client, from, rpc, storageFrom, removeCalls, delSelect };
}

const ev = (id: string, bucket: string | null, storagePath: string) => ({
  id,
  response_id: "r1",
  checklist_id: "chk-1",
  origin_bucket: bucket,
  storage_path: storagePath,
});

// ─────────────────────────────────────────────────────────────────────────────
// Pure helpers
// ─────────────────────────────────────────────────────────────────────────────

describe("Evidence 6A.5.1 — path safety / batching helpers", () => {
  it("isSafeStoragePath rejeita vazio, absoluto, backslash, traversal e segmentos vazios", () => {
    expect(isSafeStoragePath("")).toBe(false);
    expect(isSafeStoragePath("  ")).toBe(false);
    expect(isSafeStoragePath("/abs/path.jpg")).toBe(false);
    expect(isSafeStoragePath("a\\b.jpg")).toBe(false);
    expect(isSafeStoragePath("a/../b.jpg")).toBe(false);
    expect(isSafeStoragePath("../x.jpg")).toBe(false);
    expect(isSafeStoragePath("a//b.jpg")).toBe(false);
    expect(isSafeStoragePath("chk/blk/uuid.jpg")).toBe(true);
  });

  it("normalizeEvidenceBucket usa o valor persistido e cai para checklist-evidences", () => {
    expect(normalizeEvidenceBucket("checklist-assets")).toBe("checklist-assets");
    expect(normalizeEvidenceBucket(null)).toBe("checklist-evidences");
    expect(normalizeEvidenceBucket("  ")).toBe("checklist-evidences");
  });

  it("collectEvidencePathsByBucket agrupa por bucket e conta inválidos", () => {
    const { byBucket, invalidCount } = collectEvidencePathsByBucket([
      ev("e1", "checklist-evidences", "chk/blk/a.jpg"),
      ev("e2", "checklist-evidences", "chk/blk/b.jpg"),
      ev("e3", "checklist-assets", "legacy/c.jpg"),
      ev("e4", null, "../evil.jpg"),
    ]);
    expect(invalidCount).toBe(1);
    expect(byBucket.get("checklist-evidences")).toEqual(["chk/blk/a.jpg", "chk/blk/b.jpg"]);
    expect(byBucket.get("checklist-assets")).toEqual(["legacy/c.jpg"]);
  });

  it("isStorageNotFoundError aceita 404 / not found, mas não falha real", () => {
    expect(isStorageNotFoundError({ statusCode: 404, message: "The resource was not found" })).toBe(true);
    expect(isStorageNotFoundError({ message: "No such object" })).toBe(true);
    expect(isStorageNotFoundError({ statusCode: 500, message: "boom" })).toBe(false);
    expect(isStorageNotFoundError(null)).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Helper deletion matrix (A–I)
// ─────────────────────────────────────────────────────────────────────────────

describe("Evidence 6A.5.1 — deleteResponseWithEvidence", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("A) response sem evidence → delete DB normalmente, sem chamada Storage", async () => {
    const { client, storageFrom, delSelect } = makeClient({ response: { id: "r1", checklist_id: "chk-1" }, evidences: [] });
    const result = await deleteResponseWithEvidence("r1", client);
    expect(result).toEqual({ ok: true, responseId: "r1", removedFileCount: 0 });
    expect(storageFrom).not.toHaveBeenCalled();
    expect(delSelect).toHaveBeenCalled();
  });

  it("B) 1 evidence → Storage remove ocorre ANTES do DB delete", async () => {
    const { client, storageFrom, removeCalls, delSelect } = makeClient({
      response: { id: "r1", checklist_id: "chk-1" },
      evidences: [ev("e1", "checklist-evidences", "chk/blk/a.jpg")],
    });
    await deleteResponseWithEvidence("r1", client);
    expect(storageFrom).toHaveBeenCalledWith("checklist-evidences");
    expect(removeCalls[0].paths).toEqual(["chk/blk/a.jpg"]);
    // O remove resolve antes do delete: compara ordem de invocação dos mocks.
    const removeMock = (storageFrom.mock.results[0].value as any)?.remove;
    expect(removeMock).toBeDefined();
    expect(removeMock.mock.invocationCallOrder[0]).toBeLessThan(delSelect.mock.invocationCallOrder[0]);
  });

  it("C) response com 3 evidences → todos os paths removidos em batch", async () => {
    const { client, removeCalls } = makeClient({
      response: { id: "r1", checklist_id: "chk-1" },
      evidences: [
        ev("e1", "checklist-evidences", "chk/blk/a.jpg"),
        ev("e2", "checklist-evidences", "chk/blk/b.jpg"),
        ev("e3", "checklist-evidences", "chk/blk/c.jpg"),
      ],
    });
    const result = await deleteResponseWithEvidence("r1", client);
    expect(result).toEqual({ ok: true, responseId: "r1", removedFileCount: 3 });
    expect(removeCalls).toHaveLength(1);
    expect(removeCalls[0].paths.sort()).toEqual(["chk/blk/a.jpg", "chk/blk/b.jpg", "chk/blk/c.jpg"]);
  });

  it("D) approved + retake evidences → ambos removidos", async () => {
    const { client, removeCalls } = makeClient({
      response: { id: "r1", checklist_id: "chk-1" },
      evidences: [
        ev("e-ok", "checklist-evidences", "chk/blk/approved.jpg"),
        ev("e-rt", "checklist-evidences", "chk/blk/retake.jpg"),
      ],
    });
    const result = await deleteResponseWithEvidence("r1", client);
    expect(result.ok).toBe(true);
    expect(removeCalls[0].paths.sort()).toEqual(["chk/blk/approved.jpg", "chk/blk/retake.jpg"]);
  });

  it("E) evidences em buckets diferentes → chamadas agrupadas por bucket", async () => {
    const { client, storageFrom, removeCalls } = makeClient({
      response: { id: "r1", checklist_id: "chk-1" },
      evidences: [
        ev("e1", "checklist-evidences", "chk/blk/a.jpg"),
        ev("e2", "checklist-assets", "legacy/b.jpg"),
      ],
    });
    await deleteResponseWithEvidence("r1", client);
    expect(storageFrom).toHaveBeenCalledTimes(2);
    expect(storageFrom).toHaveBeenCalledWith("checklist-evidences");
    expect(storageFrom).toHaveBeenCalledWith("checklist-assets");
    expect(removeCalls.map((c) => c.bucket).sort()).toEqual(["checklist-assets", "checklist-evidences"]);
  });

  it("F) storage failure → response NÃO deletada", async () => {
    const { client, delSelect } = makeClient({
      response: { id: "r1", checklist_id: "chk-1" },
      evidences: [ev("e1", "checklist-evidences", "chk/blk/a.jpg")],
      removeError: { statusCode: 500, message: "storage down" },
    });
    const result = await deleteResponseWithEvidence("r1", client);
    expect(result).toEqual({ ok: false, code: "storage_failure", responseId: "r1" });
    expect(delSelect).not.toHaveBeenCalled();
  });

  it("G) storage success → response deletada", async () => {
    const { client, delSelect } = makeClient({
      response: { id: "r1", checklist_id: "chk-1" },
      evidences: [ev("e1", "checklist-evidences", "chk/blk/a.jpg")],
    });
    const result = await deleteResponseWithEvidence("r1", client);
    expect(result.ok).toBe(true);
    expect(delSelect).toHaveBeenCalled();
  });

  it("H) objeto já ausente (404) → delete continua idempotente", async () => {
    const { client, delSelect } = makeClient({
      response: { id: "r1", checklist_id: "chk-1" },
      evidences: [ev("e1", "checklist-evidences", "chk/blk/a.jpg")],
      removeError: { statusCode: 404, message: "The resource was not found" },
    });
    const result = await deleteResponseWithEvidence("r1", client);
    expect(result.ok).toBe(true);
    expect(delSelect).toHaveBeenCalled();
  });

  it("I) path inválido/traversal → fail-closed; DB preservado e Storage não chamado", async () => {
    const { client, storageFrom, delSelect } = makeClient({
      response: { id: "r1", checklist_id: "chk-1" },
      evidences: [ev("e1", "checklist-evidences", "../../evil.jpg")],
    });
    const result = await deleteResponseWithEvidence("r1", client);
    expect(result).toEqual({ ok: false, code: "invalid_path", responseId: "r1" });
    expect(storageFrom).not.toHaveBeenCalled();
    expect(delSelect).not.toHaveBeenCalled();
  });

  it("response inexistente → not_found, sem Storage/delete", async () => {
    const { client, storageFrom, delSelect } = makeClient({ response: null });
    const result = await deleteResponseWithEvidence("nope", client);
    expect(result).toEqual({ ok: false, code: "not_found", responseId: "nope" });
    expect(storageFrom).not.toHaveBeenCalled();
    expect(delSelect).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Authorization matrix (J–O)
// ─────────────────────────────────────────────────────────────────────────────

describe("Evidence 6A.5.1 — resolveResponseDeleteAuthorization", () => {
  const base = { response: { id: "r1", checklist_id: "chk-1" } };

  it("J) dono de checklist pessoal → autorizado", async () => {
    const { client } = makeClient({ ...base, checklist: { id: "chk-1", user_id: "u1", workspace_id: null } });
    const r = await resolveResponseDeleteAuthorization("r1", "u1", client);
    expect(r).toEqual({ allowed: true });
  });

  it("K) outro usuário em checklist pessoal → 403 (forbidden)", async () => {
    const { client } = makeClient({ ...base, checklist: { id: "chk-1", user_id: "u1", workspace_id: null } });
    const r = await resolveResponseDeleteAuthorization("r1", "u2", client);
    expect(r).toEqual({ allowed: false, code: "forbidden" });
  });

  it("L) workspace Owner → autorizado via get_checklist_access", async () => {
    const { client } = makeClient({ ...base, checklist: { id: "chk-1", user_id: "x", workspace_id: "ws-1" }, access: [{ can_manage: true }] });
    const r = await resolveResponseDeleteAuthorization("r1", "owner-1", client);
    expect(r).toEqual({ allowed: true });
  });

  it("M) workspace Admin → autorizado (can_manage=true)", async () => {
    const { client } = makeClient({ ...base, checklist: { id: "chk-1", user_id: "x", workspace_id: "ws-1" }, access: [{ can_manage: true }] });
    const r = await resolveResponseDeleteAuthorization("r1", "admin-1", client);
    expect(r).toEqual({ allowed: true });
  });

  it("N) workspace Editor → autorizado (can_manage=true)", async () => {
    const { client } = makeClient({ ...base, checklist: { id: "chk-1", user_id: "x", workspace_id: "ws-1" }, access: [{ can_manage: true }] });
    const r = await resolveResponseDeleteAuthorization("r1", "editor-1", client);
    expect(r).toEqual({ allowed: true });
  });

  it("O) workspace Viewer → proibido (can_manage=false)", async () => {
    const { client } = makeClient({ ...base, checklist: { id: "chk-1", user_id: "x", workspace_id: "ws-1" }, access: [{ can_manage: false }] });
    const r = await resolveResponseDeleteAuthorization("r1", "viewer-1", client);
    expect(r).toEqual({ allowed: false, code: "forbidden" });
  });

  it("response ou checklist inexistente → not_found", async () => {
    const { client } = makeClient({ response: null });
    expect(await resolveResponseDeleteAuthorization("nope", "u1", client)).toEqual({ allowed: false, code: "not_found" });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Endpoint behavior (P–U) + structural
// ─────────────────────────────────────────────────────────────────────────────

describe("Evidence 6A.5.1 — POST /api/checklist-responses/delete", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.admin.auth.getUser.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });
    h.admin.rpc.mockResolvedValue({ data: [{ can_manage: true }], error: null });
  });

  const seedOkFlow = () => {
    const delSelect = vi.fn(async () => ({ data: [{ id: "r1" }], error: null }));
    h.admin.from.mockImplementation((table: string) => {
      if (table === "checklist_responses") {
        return {
          select: vi.fn(() => ({ eq: vi.fn(() => ({ maybeSingle: vi.fn(async () => ({ data: { id: "r1", checklist_id: "chk-1" }, error: null })) })) })),
          delete: vi.fn(() => ({ eq: vi.fn(() => ({ select: delSelect })) })),
        };
      }
      if (table === "checklist_evidences") {
        return { select: vi.fn(() => ({ eq: vi.fn(async () => ({ data: [], error: null })) })) };
      }
      if (table === "checklists") {
        return { select: vi.fn(() => ({ eq: vi.fn(() => ({ maybeSingle: vi.fn(async () => ({ data: { id: "chk-1", user_id: "u1", workspace_id: "ws-1" }, error: null })) })) })) };
      }
      throw new Error(`unexpected table ${table}`);
    });
    h.admin.storage.from.mockReturnValue({ remove: vi.fn(async () => ({ data: { path: ["x"] }, error: null })) });
    return { delSelect };
  };

  it("P) request unauthenticated → 401", async () => {
    const res = await noAuthPost({ responseId: "00000000-0000-0000-0000-000000000001" });
    expect(res.status).toBe(401);
    expect(h.admin.auth.getUser).not.toHaveBeenCalled();
  });

  it("P2) token inválido → 401", async () => {
    h.admin.auth.getUser.mockResolvedValue({ data: { user: null }, error: new Error("bad") });
    const res = await post({ responseId: "00000000-0000-0000-0000-000000000001" }, "bad-token");
    expect(res.status).toBe(401);
  });

  it("input inválido (não-uuid) → 400", async () => {
    const res = await post({ responseId: "not-a-uuid" });
    expect(res.status).toBe(400);
  });

  it("K2) outro usuário em checklist pessoal → 403", async () => {
    h.admin.auth.getUser.mockResolvedValue({ data: { user: { id: "u2" } }, error: null });
    h.admin.from.mockImplementation((table: string) => {
      if (table === "checklist_responses") {
        return { select: vi.fn(() => ({ eq: vi.fn(() => ({ maybeSingle: vi.fn(async () => ({ data: { id: "r1", checklist_id: "chk-1" }, error: null })) })) })) };
      }
      if (table === "checklists") {
        return { select: vi.fn(() => ({ eq: vi.fn(() => ({ maybeSingle: vi.fn(async () => ({ data: { id: "chk-1", user_id: "u1", workspace_id: null }, error: null })) })) })) };
      }
      throw new Error(`unexpected table ${table}`);
    });
    const res = await post({ responseId: "00000000-0000-0000-0000-000000000001" }, "tok-u2");
    expect(res.status).toBe(403);
    const payload = await res.json();
    expect(payload.code).toBe("forbidden");
  });

  it("O2) Viewer workspace → 403", async () => {
    seedOkFlow();
    h.admin.rpc.mockResolvedValue({ data: [{ can_manage: false }], error: null });
    const res = await post({ responseId: "00000000-0000-0000-0000-000000000001" });
    expect(res.status).toBe(403);
  });

  it("response inexistente → 404", async () => {
    h.admin.from.mockImplementation((table: string) => {
      if (table === "checklist_responses") {
        return { select: vi.fn(() => ({ eq: vi.fn(() => ({ maybeSingle: vi.fn(async () => ({ data: null, error: null })) })) })) };
      }
      throw new Error(`unexpected table ${table}`);
    });
    const res = await post({ responseId: "00000000-0000-0000-0000-000000000001" });
    expect(res.status).toBe(404);
  });

  it("G2) sucesso autorizado → 200 e response deletada", async () => {
    const { delSelect } = seedOkFlow();
    const res = await post({ responseId: "00000000-0000-0000-0000-000000000001" });
    expect(res.status).toBe(200);
    expect(delSelect).toHaveBeenCalled();
  });

  it("F2) storage failure → 500 e row preservada (delete não executado)", async () => {
    const { delSelect } = seedOkFlow();
    h.admin.storage.from.mockReturnValue({ remove: vi.fn(async () => ({ data: null, error: { statusCode: 500, message: "down" } })) });
    h.admin.from.mockImplementation((table: string) => {
      if (table === "checklist_responses") {
        return {
          select: vi.fn(() => ({ eq: vi.fn(() => ({ maybeSingle: vi.fn(async () => ({ data: { id: "r1", checklist_id: "chk-1" }, error: null })) })) })),
          delete: vi.fn(() => ({ eq: vi.fn(() => ({ select: delSelect })) })),
        };
      }
      if (table === "checklist_evidences") {
        return { select: vi.fn(() => ({ eq: vi.fn(async () => ({ data: [{ id: "e1", response_id: "r1", checklist_id: "chk-1", origin_bucket: "checklist-evidences", storage_path: "chk/blk/a.jpg" }], error: null })) })) };
      }
      if (table === "checklists") {
        return { select: vi.fn(() => ({ eq: vi.fn(() => ({ maybeSingle: vi.fn(async () => ({ data: { id: "chk-1", user_id: "u1", workspace_id: "ws-1" }, error: null })) })) })) };
      }
      throw new Error(`unexpected table ${table}`);
    });
    const res = await post({ responseId: "00000000-0000-0000-0000-000000000001" });
    expect(res.status).toBe(500);
    expect(delSelect).not.toHaveBeenCalled();
  });

  it("Q) cliente envia somente responseId — bucket/path do browser nunca são usados", async () => {
    seedOkFlow();
    const res = await post({
      responseId: "00000000-0000-0000-0000-000000000001",
      storagePath: "../../evil.jpg",
      bucket: "public-bucket",
      origin_bucket: "public-bucket",
    });
    expect(res.status).toBe(200);
    // storage.from nunca recebeu o bucket do browser
    expect(h.admin.storage.from).not.toHaveBeenCalledWith("public-bucket");
    // e o único remove (se houver) usou paths do banco — aqui sem evidences → nenhuma chamada
    expect(h.admin.storage.from).not.toHaveBeenCalled();
  });

  it("U) delete concorrente do mesmo response → segunda chamada recebe 409", async () => {
    seedOkFlow();
    const p1 = post({ responseId: "00000000-0000-0000-0000-000000000001" });
    const p2 = post({ responseId: "00000000-0000-0000-0000-000000000001" });
    const [r1, r2] = await Promise.all([p1, p2]);
    expect([r1.status, r2.status].sort()).toEqual([200, 409]);
  });

  it("V) service role permanece server-only (endpoint usa supabaseAdmin; componente não importa client.server)", () => {
    const endpointSource = fs.readFileSync(path.resolve(__dirname, "../../../routes/api/checklist-responses/delete.ts"), "utf8");
    expect(endpointSource).toContain('from "@/integrations/supabase/client.server"');
    const tabSource = fs.readFileSync(path.resolve(__dirname, "../../../components/SubmissionsTab.tsx"), "utf8");
    expect(tabSource).not.toContain("client.server");
    expect(tabSource).not.toContain("service_role");
  });

  it("R) SubmissionsTab não contém mais delete direto de checklist_responses", () => {
    const tabSource = fs.readFileSync(path.resolve(__dirname, "../../../components/SubmissionsTab.tsx"), "utf8");
    expect(tabSource).not.toContain('.from("checklist_responses").delete()');
    expect(tabSource).toContain("/api/checklist-responses/delete");
  });
});