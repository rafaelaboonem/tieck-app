import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom";
import React from "react";

// ─────────────────────────────────────────────────────────────────────────────
// Mocks
// ─────────────────────────────────────────────────────────────────────────────

let fetchImpl: ReturnType<typeof vi.fn>;

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: vi.fn((table: string) => {
      const chain = (result: any) => {
        const c = {
          select: vi.fn(() => c),
          eq: vi.fn(() => c),
          not: vi.fn(() => c),
          order: vi.fn(() => c),
          is: vi.fn(() => c),
          single: vi.fn(async () => result),
          maybeSingle: vi.fn(async () => result),
          then: (resolve: (v: any) => any) => Promise.resolve(result).then(resolve),
        };
        return c;
      };
      if (table === "checklists") {
        return chain({ data: { blocks: [], settings: {}, user_id: "u1" }, error: null });
      }
      if (table === "checklist_responses") {
        return chain({
          data: [{
            id: "resp-1",
            visitor_id: "v-1",
            created_at: "2026-08-02T10:00:00Z",
            expires_at: "2026-09-02T10:00:00Z",
            answers: {},
          }],
          error: null,
        });
      }
      if (table === "checklist_analytics") {
        return chain({ data: [], error: null });
      }
      if (table === "profiles") {
        return chain({ data: { plan_type: "free" }, error: null });
      }
      return chain({ data: null, error: null });
    }),
    rpc: vi.fn(async () => ({ data: [], error: null })),
    auth: {
      getUser: vi.fn(async () => ({ data: { user: { id: "u1" } }, error: null })),
      getSession: vi.fn(async () => ({ data: { session: { access_token: "tok-1" } }, error: null })),
    },
    storage: {
      from: vi.fn(() => ({
        createSignedUrl: vi.fn(async () => ({ data: { signedUrl: "https://signed.example/priv" }, error: null })),
      })),
    },
  },
}));

vi.mock("@/lib/evidence-signed-url", () => ({
  getEvidenceSignedUrl: vi.fn(async () => "https://signed.example/priv"),
}));

import { SubmissionsTab } from "@/components/SubmissionsTab";

async function renderTab() {
  render(<SubmissionsTab checklistId="chk-1" />);
  await waitFor(() => {
    expect(screen.getByText("Visitante v-1")).toBeInTheDocument();
  });
}

describe("Evidence 6A.5.1 — SubmissionsTab delete seguro", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fetchImpl = vi.fn();
    global.fetch = fetchImpl as unknown as typeof fetch;
  });

  it("T) sucesso → response removida da UI e chamada ao endpoint com responseId + Bearer", async () => {
    fetchImpl.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ ok: true, responseId: "resp-1" }),
    });
    await renderTab();

    fireEvent.click(screen.getByLabelText("Excluir resposta de Visitante v-1"));

    await waitFor(() => {
      expect(screen.getByText("Nenhum envio encontrado.")).toBeInTheDocument();
    });
    expect(screen.queryByText("Visitante v-1")).toBeNull();

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe("/api/checklist-responses/delete");
    expect(init.method).toBe("POST");
    expect(init.headers.Authorization).toBe("Bearer tok-1");
    expect(JSON.parse(init.body)).toEqual({ responseId: "resp-1" });
  });

  it("S) erro server-side → row permanece na UI + toast genérico", async () => {
    fetchImpl.mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({ ok: false, code: "storage_failure" }),
    });
    await renderTab();

    fireEvent.click(screen.getByLabelText("Excluir resposta de Visitante v-1"));

    await waitFor(() => {
      expect(fetchImpl).toHaveBeenCalledTimes(1);
    });
    // A resposta continua visível (nenhuma remoção otimista).
    expect(screen.getByText("Visitante v-1")).toBeInTheDocument();
    expect(screen.queryByText("Nenhum envio encontrado.")).toBeNull();
  });

  it("S2) erro de rede → row permanece + toast genérico", async () => {
    fetchImpl.mockRejectedValue(new TypeError("Failed to fetch"));
    await renderTab();

    fireEvent.click(screen.getByLabelText("Excluir resposta de Visitante v-1"));
    await waitFor(() => {
      expect(fetchImpl).toHaveBeenCalledTimes(1);
    });
    expect(screen.getByText("Visitante v-1")).toBeInTheDocument();
  });

  it("U) duplo clique → apenas UMA chamada destrutiva é disparada", async () => {
    let resolveFetch: (v: any) => void = () => {};
    fetchImpl.mockImplementation(
      () => new Promise((resolve) => { resolveFetch = resolve; })
    );
    await renderTab();

    const trash = screen.getByLabelText("Excluir resposta de Visitante v-1");
    fireEvent.click(trash);

    // O fetch dispara após o getSession (microtask) — aguarda a primeira chamada.
    await waitFor(() => {
      expect(fetchImpl).toHaveBeenCalledTimes(1);
    });

    // Enquanto o delete está em andamento o botão fica desabilitado → duplo clique não dispara.
    const disabledTrash = screen.getByLabelText("Excluir resposta de Visitante v-1");
    expect(disabledTrash).toBeDisabled();
    fireEvent.click(disabledTrash);
    expect(fetchImpl).toHaveBeenCalledTimes(1);

    resolveFetch({ ok: true, status: 200, json: async () => ({ ok: true, responseId: "resp-1" }) });
    await waitFor(() => {
      expect(screen.getByText("Nenhum envio encontrado.")).toBeInTheDocument();
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});