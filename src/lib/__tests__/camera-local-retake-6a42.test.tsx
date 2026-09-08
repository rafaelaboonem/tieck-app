import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom";
import React from "react";

// ─────────────────────────────────────────────────────────────────────────────
// Mocks — PublicCameraBlock only touches Supabase through ensureResponseSession
// (a prop), so no supabase client mock is needed. The quality engine is mocked
// so each test controls the local validation outcome.
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
import { QualityEngine } from "@/lib/camera-quality/engine";

const TITLE = "A mão está aberta?";
const SESSION = { responseId: "resp-1", responseToken: "t1", checklistId: "chk-1", createdAt: Date.now() };

const approvedFetch = () =>
  vi.fn().mockResolvedValue({
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

const localMessages: Record<string, string> = {
  low_light: "A foto ficou escura. Procure mais iluminação e tente novamente.",
  overexposed: "Há luz excessiva na imagem. Evite apontar diretamente para a fonte de luz.",
  blurry: "A foto ficou pouco nítida. Segure o aparelho com firmeza e tente novamente.",
  unavailable: "A imagem capturada não possui resolução ou qualidade suficiente.",
};

describe("Camera AI 6A.4.2 — PublicCameraBlock local quality retake", () => {
  let engine: any;

  const engineInstance = () => {
    if (!engine) engine = new (QualityEngine as any)();
    return engine;
  };

  const renderBlock = () => {
    const onAnswer = vi.fn();
    const ensureResponseSession = vi.fn();
    const onCameraActiveChange = vi.fn();
    const utils = render(
      <PublicCameraBlock
        block={{ id: "b1", type: "camera", title: TITLE, required: true }}
        checklistId="chk-1"
        onAnswer={onAnswer}
        onCameraActiveChange={onCameraActiveChange}
        ensureResponseSession={ensureResponseSession}
      />
    );
    return { container: utils.container, onAnswer, ensureResponseSession, onCameraActiveChange };
  };

  const openCamera = () => fireEvent.click(screen.getByText(TITLE));
  const capture = () => fireEvent.click(screen.getByText("disparar-captura"));
  const closeCamera = () => fireEvent.click(screen.getByText("fechar-camera"));
  const retakeAgain = () => fireEvent.click(screen.getByRole("button", { name: /Tirar outra foto/i }));

  const localRetake = async (state: string) => {
    engineInstance().analyzeFile.mockResolvedValue({ state });
    const ui = renderBlock();
    openCamera();
    capture();
    await waitFor(() => {
      expect(screen.getAllByText("Tire outra foto").length).toBeGreaterThan(0);
    });
    return ui;
  };

  const approvedFlow = async () => {
    engineInstance().analyzeFile.mockResolvedValue({ state: "ready" });
    global.fetch = approvedFetch();
    const ui = renderBlock();
    ui.ensureResponseSession.mockResolvedValue(SESSION);
    openCamera();
    capture();
    await waitFor(() => {
      expect(screen.getByText("Foto aprovada")).toBeInTheDocument();
    });
    return ui;
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("VITE_CAMERA_AI_ENABLED", "true");
    engine = undefined;
    global.fetch = vi.fn();
  });

  it("A/B/C) low_light → preview criado, bloco continua renderizado com 'Tire outra foto' e mensagem", async () => {
    const { container } = await localRetake("low_light");

    // A) preview existe + bloco renderiza (o bug: preview null → nada renderizado)
    const img = container.querySelector('img[alt="Capture preview"]');
    expect(img).not.toBeNull();
    expect(screen.getAllByText("Tire outra foto").length).toBeGreaterThan(0);
    // B) mensagem local correta
    expect(screen.getByText(localMessages.low_light)).toBeInTheDocument();
    // C) CTA para nova foto
    expect(screen.getByRole("button", { name: /Tirar outra foto/i })).toBeInTheDocument();
  });

  it("D/E/F) low_light → sem processVerification: sem session, sem fetch verify, sem idempotency server-side", async () => {
    const { ensureResponseSession } = await localRetake("low_light");
    // D) processVerification (que resolve session + chama verify) nunca roda
    expect(ensureResponseSession).not.toHaveBeenCalled();
    // E) nenhuma chamada à API da Camera AI
    expect(global.fetch).not.toHaveBeenCalled();
    // F) sem idempotency key server-side: nenhuma tentativa pode ser criada
    expect(global.fetch).not.toHaveBeenCalledWith(expect.stringContaining("/api/camera-ai/verify"), expect.anything());
  });

  it("G) overexposed → bloco permanece visível", async () => {
    const { container } = await localRetake("overexposed");
    expect(container.querySelector('img[alt="Capture preview"]')).not.toBeNull();
    expect(screen.getByText(localMessages.overexposed)).toBeInTheDocument();
    expect(screen.getAllByText("Tire outra foto").length).toBeGreaterThan(0);
  });

  it("H) blurry → bloco permanece visível", async () => {
    const { container } = await localRetake("blurry");
    expect(container.querySelector('img[alt="Capture preview"]')).not.toBeNull();
    expect(screen.getByText(localMessages.blurry)).toBeInTheDocument();
  });

  it("I) unavailable → bloco permanece visível", async () => {
    const { container } = await localRetake("unavailable");
    expect(container.querySelector('img[alt="Capture preview"]')).not.toBeNull();
    expect(screen.getByText(localMessages.unavailable)).toBeInTheDocument();
  });

  it("J) quality=ready → processVerification roda normalmente (verify chamado, session resolvida)", async () => {
    const ui = await approvedFlow();
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining("/api/camera-ai/verify"),
      expect.anything()
    );
    expect(ui.ensureResponseSession).toHaveBeenCalled();
    // aprovação registrada no formulário
    expect(ui.onAnswer).toHaveBeenCalledWith("b1", expect.stringContaining('"decision":"approved"'));
  });

  it("K) foto aprovada + abrir e CANCELAR câmera → resposta aprovada permanece", async () => {
    const ui = await approvedFlow();
    expect(ui.onAnswer).toHaveBeenCalledWith("b1", expect.stringContaining('"decision":"approved"'));

    ui.onAnswer.mockClear();
    fireEvent.click(screen.getByText("Trocar foto"));
    expect(ui.onCameraActiveChange).toHaveBeenLastCalledWith(true);
    closeCamera();
    expect(ui.onCameraActiveChange).toHaveBeenLastCalledWith(false);
    // cancelar sem captura NÃO invalida a aprovação
    expect(ui.onAnswer).not.toHaveBeenCalled();
  });

  it("L) foto aprovada + nova captura low_light → onAnswer('') invalida a aprovação antiga", async () => {
    const ui = await approvedFlow();
    const approvedCallCount = ui.onAnswer.mock.calls.length;

    // nova captura ruim → invalidação IMEDIATA no handleCapture
    engineInstance().analyzeFile.mockResolvedValue({ state: "low_light" });
    fireEvent.click(screen.getByText("Trocar foto"));
    capture();
    await waitFor(() => {
      expect(screen.getAllByText("Tire outra foto").length).toBeGreaterThan(0);
    });

    expect(ui.onAnswer.mock.calls.length).toBeGreaterThan(approvedCallCount);
    // última chamada é o clear ("") — a aprovação antiga deixou de valer
    expect(ui.onAnswer.mock.calls[ui.onAnswer.mock.calls.length - 1]).toEqual(["b1", ""]);
    expect(screen.queryByText("Foto aprovada")).toBeNull();
    expect(screen.getByText(localMessages.low_light)).toBeInTheDocument();
  });

  it("M) nova captura quality=ready → aprovação antiga é invalidada ANTES da nova análise", async () => {
    const ui = await approvedFlow();

    ui.onAnswer.mockClear();
    fireEvent.click(screen.getByText("Trocar foto"));
    capture();
    await waitFor(() => {
      expect(screen.getByText("Foto aprovada")).toBeInTheDocument();
    });

    // ordem: primeiro o clear (""), depois a nova aprovação
    expect(ui.onAnswer.mock.calls[0]).toEqual(["b1", ""]);
    expect(ui.onAnswer.mock.calls[ui.onAnswer.mock.calls.length - 1][1]).toContain('"decision":"approved"');
  });

  it("N) retake local → sem evidence textual da IA (IA nunca foi chamada)", async () => {
    const { container } = await localRetake("low_light");
    expect(screen.getByText(localMessages.low_light)).toBeInTheDocument();
    // o parágrafo italic de evidence da IA não existe
    expect(container.querySelector("p.italic")).toBeNull();
  });

  it("O) retake local → não cria camera_ai_attempt (nenhuma chamada de sessão/verify)", async () => {
    const { ensureResponseSession } = await localRetake("blurry");
    expect(ensureResponseSession).not.toHaveBeenCalled();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("P) retake local → nunca vira resposta de bloco (sem payload canContinue/evidenceId)", async () => {
    const { onAnswer } = await localRetake("low_light");
    // handleCapture só emitiu o clear (""); nenhuma resposta JSON do tipo camera
    expect(onAnswer).toHaveBeenCalledTimes(1);
    expect(onAnswer).toHaveBeenCalledWith("b1", "");
    expect(onAnswer).not.toHaveBeenCalledWith(expect.any(String), expect.stringContaining("evidenceId"));
    expect(onAnswer).not.toHaveBeenCalledWith(expect.any(String), expect.stringContaining("canContinue"));
  });

  it("Q) watermark: câmera aberta → onCameraActiveChange(true); captura ruim → volta (false)", async () => {
    engineInstance().analyzeFile.mockResolvedValue({ state: "low_light" });
    const { onCameraActiveChange } = renderBlock();
    openCamera();
    expect(onCameraActiveChange).toHaveBeenLastCalledWith(true);
    capture();
    await waitFor(() => {
      expect(screen.getAllByText("Tire outra foto").length).toBeGreaterThan(0);
    });
    expect(onCameraActiveChange).toHaveBeenLastCalledWith(false);
  });

  it("R) segunda captura substitui preview anterior → revokeObjectURL da URL antiga", async () => {
    let seq = 0;
    vi.mocked(URL.createObjectURL).mockImplementation(() => `blob:seq-${++seq}`);
    const revoke = vi.mocked(URL.revokeObjectURL);
    revoke.mockClear();

    engineInstance().analyzeFile.mockResolvedValue({ state: "low_light" });
    const { container } = renderBlock();
    openCamera();
    capture();
    await waitFor(() => {
      expect(container.querySelector('img[alt="Capture preview"]')).not.toBeNull();
    });
    expect((container.querySelector('img[alt="Capture preview"]') as HTMLImageElement).src).toContain("blob:seq-1");

    // nova tentativa → substitui o preview
    retakeAgain();
    capture();
    await waitFor(() => {
      const img = container.querySelector('img[alt="Capture preview"]') as HTMLImageElement;
      expect(img && img.src).toContain("blob:seq-2");
    });
    expect(revoke).toHaveBeenCalledWith("blob:seq-1");
  });
});
