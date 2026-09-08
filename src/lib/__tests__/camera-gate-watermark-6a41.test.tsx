import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";
import React from "react";

import { evaluateGate } from "../../server/camera-ai/gate";
import { verifyCameraRequest, type VerifyDependencies, type PublicSession, type ClaimResult, type RateLimitResult } from "../../server/camera-ai/verify-handler";
import { createHash } from "crypto";
import { isActionableCameraNonApproval } from "../camera-ai/actionable-non-approval";
import { shouldShowChecklistWatermark } from "../camera-watermark-visibility";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// ─────────────────────────────────────────────────────────────────────────────
// Gate 6A.4.1 — condição visivelmente falsa NÃO pode virar not_observable
// ─────────────────────────────────────────────────────────────────────────────

const base = {
  target_visible: true,
  target_identity_confidence: 0.95,
  condition_observable: true,
  condition_met: true,
  image_quality_usable: true,
  positive_visible_evidence: ["mão aberta"],
  negative_visible_evidence: [] as string[],
  contradictions: [] as string[],
  overall_confidence: 0.95,
  user_message: "ok",
};

describe("Camera AI 6A.4.1 — Gate: observable rejection vs not_observable", () => {
  it("A) observable + met=false + positive=[] + negative=['mão em punho'] → retake/condition_not_met", () => {
    const result = evaluateGate({
      ...base,
      condition_met: false,
      positive_visible_evidence: [],
      negative_visible_evidence: ["dedos fechados", "mão em punho"],
    });
    expect(result.decision).toBe("retake");
    expect(result.code).toBe("condition_not_met");
    expect(result.evidence).toContain("mão em punho");
  });

  it("B) observable + met=false + negative=['porta fechada'] → condition_not_met", () => {
    const result = evaluateGate({
      ...base,
      condition_met: false,
      positive_visible_evidence: [],
      negative_visible_evidence: ["porta fechada"],
    });
    expect(result.decision).toBe("retake");
    expect(result.code).toBe("condition_not_met");
  });

  it("C) observable=false + met=false → not_observable (nunca condition_not_met)", () => {
    const result = evaluateGate({
      ...base,
      condition_observable: false,
      condition_met: false,
      positive_visible_evidence: [],
      negative_visible_evidence: ["parcialmente oculto"],
    });
    expect(result.decision).toBe("not_observable");
    expect(result.code).toBe("not_observable");
  });

  it("D) observable + met=false + contradictions → not_observable (leitura incoerente)", () => {
    const result = evaluateGate({
      ...base,
      condition_met: false,
      positive_visible_evidence: [],
      contradictions: ["não é possível determinar posição"],
    });
    expect(result.decision).toBe("not_observable");
  });

  it("E) observable + met=true + positive=[] → NÃO approved; fail-closed not_observable", () => {
    const result = evaluateGate({
      ...base,
      positive_visible_evidence: [],
    });
    expect(result.decision).not.toBe("approved");
    expect(result.decision).toBe("not_observable");
  });

  it("F) observável e atendida com evidência positiva + confidence >= 0.90 → approved", () => {
    const result = evaluateGate({ ...base });
    expect(result.decision).toBe("approved");
    expect(result.code).toBe("verified");
  });

  it("G) target_missing continua vencendo antes de condition_not_met", () => {
    const result = evaluateGate({
      ...base,
      target_visible: false,
      condition_met: false,
      positive_visible_evidence: [],
      negative_visible_evidence: ["sem alvo"],
    });
    expect(result.decision).toBe("retake");
    expect(result.code).toBe("target_missing");
  });

  it("H) quality_failure continua vencendo antes de condition_not_met", () => {
    const result = evaluateGate({
      ...base,
      image_quality_usable: false,
      condition_met: false,
      positive_visible_evidence: [],
      negative_visible_evidence: ["borrado"],
    });
    expect(result.code).toBe("quality_failure");
  });

  it("I) reference_mismatch continua vencendo antes de condition_not_met", () => {
    const result = evaluateGate({
      ...base,
      condition_met: false,
      positive_visible_evidence: [],
      negative_visible_evidence: ["mão em punho"],
      reference_match: false,
      reference_match_confidence: 0.4,
      reference_differences: ["ângulo diferente"],
    });
    expect(result.code).toBe("reference_mismatch");
  });

  it("J) condition_not_met do gate → isActionableCameraNonApproval = true", () => {
    const result = evaluateGate({
      ...base,
      condition_met: false,
      positive_visible_evidence: [],
      negative_visible_evidence: ["mão em punho"],
    });
    expect(isActionableCameraNonApproval({ status: "completed", decision: result.decision, code: result.code })).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Verify-handler — condition_not_met persiste (6A.4), not_observable não
// ─────────────────────────────────────────────────────────────────────────────

const QUESTION = "A mão está aberta?";
const validPolicy = () => ({
  version: 1 as const,
  questionHash: createHash("sha256").update(QUESTION).digest("hex"),
  source: "generated" as const,
  verifiability: "visual" as const,
  target: "mão",
  condition: "aberta",
  targetDescription: "td",
  conditionDescription: "cd",
  requiredVisibleEvidence: [],
  rejectionSignals: [],
  notObservableSignals: [],
  summary: "s",
});

const payload = {
  checklistId: "chk-123",
  blockId: "blk-1",
  responseToken: "token-123",
  idempotencyKey: "idem-123",
};

const image = { buffer: new Uint8Array([0xff, 0xd8, 0xff, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]).buffer, type: "image/jpeg" };

const makeDeps = (analysis: any): VerifyDependencies => ({
  mode: "enabled",
  model: "gpt-4o-mini",
  requestId: "test-req",
  now: () => new Date("2026-08-18T10:00:00Z"),
  isConfigured: () => true,
  resolveSession: vi.fn().mockResolvedValue({
    data: [{
      response_id: "resp-123",
      checklist_id: "chk-123",
      workspace_id: "ws-1",
      status: "in_progress",
      published_content: { blocks: [{ id: "blk-1", type: "camera", title: QUESTION, mode: "auto", cameraAiPolicy: validPolicy() }] },
    } satisfies PublicSession],
    error: null,
  }),
  claimAttempt: vi.fn().mockResolvedValue({ data: [{ claim_status: "acquired", attempt_id: "att-1", current_retry_count: 0 } satisfies ClaimResult], error: null }),
  hitRateLimit: vi.fn().mockResolvedValue({ data: [{ allowed: true } satisfies RateLimitResult], error: null }),
  analyzeImage: vi.fn().mockResolvedValue(analysis),
  analyzeImageWithReference: vi.fn(),
  loadReferenceImage: vi.fn(),
  markFailed: vi.fn().mockResolvedValue({ data: {}, error: null }),
  markCompleted: vi.fn().mockResolvedValue({ data: { id: "attempt-1" }, error: null }),
  attachEvidence: vi.fn().mockResolvedValue({ data: [{ confirmed_evidence_id: "ev-1" }], error: null }),
  persistEvidence: vi.fn().mockResolvedValue({ evidenceId: "ev-1", error: null }),
});

describe("Camera AI 6A.4.1 — verify-handler segue a correção do gate", () => {
  it("K) condition_not_met (observable + met=false + só evidência negativa) → persistEvidence chamado", async () => {
    const deps = makeDeps({
      target_visible: true,
      target_identity_confidence: 0.95,
      condition_observable: true,
      condition_met: false,
      image_quality_usable: true,
      positive_visible_evidence: [],
      negative_visible_evidence: ["dedos fechados", "mão em punho"],
      contradictions: [],
      overall_confidence: 0.95,
      user_message: "A mão está em punho",
    });
    const res = await verifyCameraRequest(payload, image, deps);
    expect(res.status).toBe(200);
    expect((res.body as any).decision).toBe("retake");
    expect((res.body as any).code).toBe("condition_not_met");
    expect(deps.persistEvidence).toHaveBeenCalledTimes(1);
    expect(deps.markCompleted).toHaveBeenCalledWith(expect.objectContaining({
      decision: "retake",
      code: "condition_not_met",
      evidenceId: "ev-1",
    }));
  });

  it("L) not_observable (condição cortada/oculta) → NÃO persiste", async () => {
    const deps = makeDeps({
      target_visible: true,
      target_identity_confidence: 0.95,
      condition_observable: false,
      condition_met: false,
      image_quality_usable: true,
      positive_visible_evidence: [],
      negative_visible_evidence: ["válvula parcialmente escondida"],
      contradictions: [],
      overall_confidence: 0.8,
      user_message: "Válvula parcialmente oculta",
    });
    const res = await verifyCameraRequest(payload, image, deps);
    expect(res.status).toBe(200);
    expect((res.body as any).decision).toBe("not_observable");
    expect(deps.persistEvidence).not.toHaveBeenCalled();
    expect(deps.markCompleted).toHaveBeenCalledWith(expect.objectContaining({ evidenceId: undefined }));
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Watermark — helper puro
// ─────────────────────────────────────────────────────────────────────────────

describe("Camera AI 6A.4.1 — watermark visibility helper (M, N, P–S)", () => {
  it("M) formulário público normal → 'Feito com Tieck' visível", () => {
    expect(shouldShowChecklistWatermark(true, false)).toBe(true);
  });

  it("N) live camera aberta → watermark oculta", () => {
    expect(shouldShowChecklistWatermark(true, true)).toBe(false);
  });

  it("showBranding=false → nunca mostra (independente da câmera)", () => {
    expect(shouldShowChecklistWatermark(false, false)).toBe(false);
    expect(shouldShowChecklistWatermark(false, true)).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Watermark — PublicCameraBlock sinaliza o estado REAL do viewfinder
// ─────────────────────────────────────────────────────────────────────────────

vi.mock("@/components/TieckCamera", () => ({
  TieckCamera: ({ open, onCapture, onClose }: { open: boolean; onCapture: (f: File) => void; onClose: () => void }) => {
    if (!open) return null;
    return (
      <>
        <button type="button" onClick={() => onCapture(new File(["x"], "foto.jpg", { type: "image/jpeg" }))}>
          disparar-captura
        </button>
        <button type="button" onClick={onClose}>
          fechar-camera
        </button>
      </>
    );
  },
}));

vi.mock("@/lib/camera-quality/engine", () => {
  const mockEngine = { analyzeFile: vi.fn(async () => ({ state: "ready" })), dispose: vi.fn() };
  function MockEngine() { return mockEngine; }
  return { QualityEngine: MockEngine };
});

import { PublicCameraBlock } from "@/components/PublicCameraBlock";

const session = { responseId: "resp-1", responseToken: "t1", checklistId: "chk-1", createdAt: Date.now() };

describe("Camera AI 6A.4.1 — live camera state lifted for watermark (N, O, P, R, S, T, U)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("VITE_CAMERA_AI_ENABLED", "true");
  });

  it("N/O) abrir câmera → onCameraActiveChange(true); watermark não renderizada → zero pointer events", () => {
    const onCameraActiveChange = vi.fn();
    render(
      <PublicCameraBlock
        block={{ id: "b1", type: "camera", title: "A mão está aberta?" }}
        checklistId="chk-1"
        onCameraActiveChange={onCameraActiveChange}
        ensureResponseSession={vi.fn().mockResolvedValue(session)}
      />
    );
    fireEvent.click(screen.getByText("A mão está aberta?"));
    expect(onCameraActiveChange).toHaveBeenLastCalledWith(true);
  });

  it("P) fechar/cancelar câmera → onCameraActiveChange(false); watermark volta", () => {
    const onCameraActiveChange = vi.fn();
    render(
      <PublicCameraBlock
        block={{ id: "b1", type: "camera", title: "A mão está aberta?" }}
        checklistId="chk-1"
        onCameraActiveChange={onCameraActiveChange}
        ensureResponseSession={vi.fn().mockResolvedValue(session)}
      />
    );
    fireEvent.click(screen.getByText("A mão está aberta?"));
    expect(onCameraActiveChange).toHaveBeenLastCalledWith(true);
    fireEvent.click(screen.getByText("fechar-camera"));
    expect(onCameraActiveChange).toHaveBeenLastCalledWith(false);
  });

  it("R) captura com resultado retake → viewfinder encerrado → onCameraActiveChange(false)", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "application/json" }),
      json: async () => ({
        ok: true,
        decision: "retake",
        code: "condition_not_met",
        message: "Tire outra foto",
        evidence: "mão em punho",
        evidenceId: "00000000-0000-0000-0000-0000000000e1",
        persisted: true,
        requestId: "req-1",
      }),
    });
    const onCameraActiveChange = vi.fn();
    render(
      <PublicCameraBlock
        block={{ id: "b1", type: "camera", title: "A mão está aberta?" }}
        checklistId="chk-1"
        onCameraActiveChange={onCameraActiveChange}
        ensureResponseSession={vi.fn().mockResolvedValue(session)}
      />
    );
    fireEvent.click(screen.getByText("A mão está aberta?"));
    fireEvent.click(screen.getByText("disparar-captura"));
    await waitFor(() => {
      expect(screen.getAllByText("Tire outra foto").length).toBeGreaterThan(0);
    });
    expect(onCameraActiveChange).toHaveBeenLastCalledWith(false);
  });

  it("S) captura com resultado approved → viewfinder encerrado → onCameraActiveChange(false)", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "application/json" }),
      json: async () => ({
        ok: true,
        decision: "approved",
        code: "verified",
        message: "Foto aprovada",
        evidence: "mão aberta",
        evidenceId: "00000000-0000-0000-0000-0000000000a1",
        persisted: true,
        requestId: "req-2",
      }),
    });
    const onCameraActiveChange = vi.fn();
    render(
      <PublicCameraBlock
        block={{ id: "b1", type: "camera", title: "A mão está aberta?" }}
        checklistId="chk-1"
        onCameraActiveChange={onCameraActiveChange}
        ensureResponseSession={vi.fn().mockResolvedValue(session)}
      />
    );
    fireEvent.click(screen.getByText("A mão está aberta?"));
    fireEvent.click(screen.getByText("disparar-captura"));
    await waitFor(() => {
      expect(screen.getByText("Foto aprovada")).toBeInTheDocument();
    });
    expect(onCameraActiveChange).toHaveBeenLastCalledWith(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Watermark — estrutura da rota pública (T/U: mesma regra em qualquer viewport)
// ─────────────────────────────────────────────────────────────────────────────

describe("Camera AI 6A.4.1 — rota pública esconde watermark só durante live capture (O, T, U)", () => {
  const routeSource = readFileSync(resolve(process.cwd(), "src/routes/c.$id.tsx"), "utf8");
  const engineSource = readFileSync(resolve(process.cwd(), "src/components/ExecutionEngine.tsx"), "utf8");

  it("rota pública passa onCameraActiveChange ao ExecutionEngine", () => {
    expect(routeSource).toContain("onCameraActiveChange={setCameraOpen}");
    expect(routeSource).toContain("shouldShowChecklistWatermark(loaderData.showBranding, cameraOpen)");
  });

  it("O) watermark é NÃO renderizada com câmera aberta (sem overlay oculto / pointer events)", () => {
    // A condição é renderização condicional (&& helper), não opacity:0.
    expect(routeSource).toMatch(/shouldShowChecklistWatermark\(loaderData\.showBranding, cameraOpen\) &&/);
    expect(routeSource).not.toContain("cameraOpen ? \"opacity-0\"");
    expect(routeSource).not.toContain("cameraOpen && <div className=\"fixed");
  });

  it("T/U) regra independe de viewport/user-agent — mesma condição em desktop e mobile", () => {
    const watermarkSection = routeSource.slice(routeSource.indexOf("shouldShowChecklistWatermark("));
    expect(watermarkSection).not.toContain("matchMedia");
    expect(watermarkSection).not.toContain("innerWidth");
    expect(watermarkSection).not.toContain("userAgent");
  });

  it("ExecutionEngine expõe a prop opcional e sincroniza o estado real do viewfinder", () => {
    expect(engineSource).toContain("onCameraActiveChange?: (active: boolean) => void;");
    expect(engineSource).toContain("onCameraActiveChange?.(cameraActive)");
  });
});