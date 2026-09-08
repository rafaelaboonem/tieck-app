import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom";
import React from "react";

// ─────────────────────────────────────────────────────────────────────────────
// Mocks
// ─────────────────────────────────────────────────────────────────────────────

const EV_ACTIONABLE = "00000000-0000-0000-0000-0000000000e1";

let attemptsFixture: any[] = [];

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
      if (table === "checklist_evidences") {
        return chain({ data: { id: EV_ACTIONABLE, storage_path: "chk/resp/blk/idem.jpg" }, error: null });
      }
      return chain({ data: null, error: null });
    }),
    rpc: vi.fn(async (fn: string) => {
      if (fn === "get_camera_ai_attempts_for_responses") {
        return { data: attemptsFixture, error: null };
      }
      return { data: null, error: null };
    }),
    auth: { getUser: vi.fn(async () => ({ data: { user: { id: "u1" } }, error: null })) },
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

vi.mock("@/components/TieckCamera", () => ({
  TieckCamera: ({ open, onCapture }: { open: boolean; onCapture: (f: File) => void }) => {
    if (!open) return null;
    return (
      <button type="button" onClick={() => onCapture(new File(["x"], "foto.jpg", { type: "image/jpeg" }))}>
        disparar-captura
      </button>
    );
  },
}));

vi.mock("@/lib/camera-quality/engine", () => {
  const mockEngine = { analyzeFile: vi.fn(async () => ({ state: "ready" })), dispose: vi.fn() };
  function MockEngine() { return mockEngine; }
  return { QualityEngine: MockEngine };
});

import { PublicCameraBlock } from "@/components/PublicCameraBlock";
import { SubmissionsTab } from "@/components/SubmissionsTab";

// ─────────────────────────────────────────────────────────────────────────────
// K) PublicCameraBlock — retake com evidenceId NÃO vira resposta válida
// ─────────────────────────────────────────────────────────────────────────────

describe("Camera AI 6A.4 — PublicCameraBlock não registra retake como resposta (K)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("VITE_CAMERA_AI_ENABLED", "true");
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "application/json" }),
      json: async () => ({
        ok: true,
        decision: "retake",
        code: "condition_not_met",
        message: "Tire outra foto",
        evidence: "O caderno não está aberto",
        evidenceId: EV_ACTIONABLE,
        persisted: true,
        requestId: "req-1",
      }),
    });
  });

  it("retake com evidenceId persistido → mostra 'Tire outra foto' e NÃO chama onAnswer com resposta", async () => {
    const onAnswer = vi.fn();
    const ensureResponseSession = vi.fn().mockResolvedValue({
      responseId: "resp-1",
      responseToken: "t1",
      checklistId: "chk-1",
      createdAt: Date.now(),
    });

    render(
      <PublicCameraBlock
        block={{ id: "b1", type: "camera", title: "Caderno aberto?", required: true }}
        checklistId="chk-1"
        onAnswer={onAnswer}
        ensureResponseSession={ensureResponseSession}
      />
    );

    fireEvent.click(screen.getByText("Caderno aberto?"));
    fireEvent.click(screen.getByText("disparar-captura"));

    await waitFor(() => {
      expect(screen.getAllByText("Tire outra foto").length).toBeGreaterThan(0);
    });

    // A foto não aprovada NÃO satisfaz o bloco — onAnswer só pode ter recebido
    // o clear inicial (""), nunca o payload JSON com evidenceId.
    expect(onAnswer).not.toHaveBeenCalledWith(expect.any(String), expect.stringContaining("evidenceId"));
    expect(onAnswer).not.toHaveBeenCalledWith(expect.any(String), expect.stringContaining("canContinue"));
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// O / P / Q — SubmissionsTab: evidência não aprovada persistida
// ─────────────────────────────────────────────────────────────────────────────

describe("Camera AI 6A.4 — Envios mostra a foto não aprovada (O, P, Q)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("O) orphan attempt acionável COM evidence_id → renderiza imagem (EvidenceCard), sem 'Foto não armazenada'", async () => {
    attemptsFixture = [
      {
        id: "att-1",
        response_id: "resp-1",
        evidence_id: EV_ACTIONABLE,
        block_id: "blk-cam",
        status: "completed",
        decision: "retake",
        code: "condition_not_met",
        evidence: "O caderno não está aberto",
        model: "gpt-4o-mini",
        duration_ms: 1200,
        completed_at: "2026-08-02T10:05:00Z",
        updated_at: "2026-08-02T10:05:00Z",
        created_at: "2026-08-02T10:05:00Z",
      },
    ];
    render(<SubmissionsTab checklistId="chk-1" />);

    await waitFor(() => {
      expect(screen.getByText("Visitante v-1")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText("Visitante v-1"));

    await waitFor(() => {
      expect(screen.getByText("Verificação da câmera")).toBeInTheDocument();
    });
    expect(screen.getByText("Não aprovada pela IA")).toBeInTheDocument();
    expect(screen.getByText("O caderno não está aberto")).toBeInTheDocument();
    expect(screen.getByText("Ampliar")).toBeInTheDocument();
    expect(screen.queryByText("Foto não armazenada")).toBeNull();
    // A miniatura usa a signed URL privada, nunca um caminho público.
    const img = screen.getByAltText("Foto") as HTMLImageElement;
    expect(img.src).toContain("signed.example");
  });

  it("P) orphan attempt sem evidence_id → mantém 'Foto não armazenada'", async () => {
    attemptsFixture = [
      {
        id: "att-2",
        response_id: "resp-1",
        evidence_id: null,
        block_id: "blk-cam",
        status: "completed",
        decision: "retake",
        code: "condition_not_met",
        evidence: "Sem foto persistida",
        model: "gpt-4o-mini",
        duration_ms: 800,
        completed_at: "2026-08-02T10:05:00Z",
        updated_at: "2026-08-02T10:05:00Z",
        created_at: "2026-08-02T10:05:00Z",
      },
    ];
    render(<SubmissionsTab checklistId="chk-1" />);

    await waitFor(() => {
      expect(screen.getByText("Visitante v-1")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText("Visitante v-1"));

    await waitFor(() => {
      expect(screen.getByText("Foto não armazenada")).toBeInTheDocument();
    });
    expect(screen.queryByText("Ampliar")).toBeNull();
    expect(screen.queryByAltText("Foto")).toBeNull();
  });

  it("Q) EvidenceCard de retake acionável usa o label 'Não aprovada pela IA' (semântica compartilhada)", async () => {
    attemptsFixture = [
      {
        id: "att-1",
        response_id: "resp-1",
        evidence_id: EV_ACTIONABLE,
        block_id: "blk-cam",
        status: "completed",
        decision: "retake",
        code: "target_missing",
        evidence: "Objeto não encontrado",
        model: "gpt-4o-mini",
        duration_ms: 900,
        completed_at: "2026-08-02T10:05:00Z",
        updated_at: "2026-08-02T10:05:00Z",
        created_at: "2026-08-02T10:05:00Z",
      },
    ];
    render(<SubmissionsTab checklistId="chk-1" />);

    await waitFor(() => {
      expect(screen.getByText("Visitante v-1")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText("Visitante v-1"));

    await waitFor(() => {
      expect(screen.getByText("Não aprovada pela IA")).toBeInTheDocument();
    });
    expect(screen.queryByText("Rejeitada pela IA")).toBeNull();
    expect(screen.queryByText("Verificação não localizada")).toBeNull();
  });

  it("R) evidência não aprovada segue fluxo de signed URL privada (sem URL pública)", async () => {
    const { getEvidenceSignedUrl } = await import("@/lib/evidence-signed-url");
    attemptsFixture = [
      {
        id: "att-1",
        response_id: "resp-1",
        evidence_id: EV_ACTIONABLE,
        block_id: "blk-cam",
        status: "completed",
        decision: "retake",
        code: "condition_not_met",
        evidence: "x",
        model: "gpt-4o-mini",
        duration_ms: 1,
        completed_at: "2026-08-02T10:05:00Z",
        updated_at: "2026-08-02T10:05:00Z",
        created_at: "2026-08-02T10:05:00Z",
      },
    ];
    render(<SubmissionsTab checklistId="chk-1" />);
    await waitFor(() => expect(screen.getByText("Visitante v-1")).toBeInTheDocument());
    fireEvent.click(screen.getByText("Visitante v-1"));
    await waitFor(() => expect(screen.getByText("Ampliar")).toBeInTheDocument());
    expect(getEvidenceSignedUrl).toHaveBeenCalledWith(expect.stringContaining("chk/resp/blk"));
  });
});