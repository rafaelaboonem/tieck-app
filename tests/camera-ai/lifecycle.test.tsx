/* eslint-disable */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { PublicCameraBlock } from "@/components/PublicCameraBlock";
import { QualityEngine } from "@/lib/camera-quality/engine";

// Mocks
vi.mock("@/lib/camera-quality/engine", () => {
  const mockEngine = {
    analyzeFile: vi.fn(),
    analyzeFrame: vi.fn(),
    dispose: vi.fn(),
  };
  function MockEngine() {
    return mockEngine;
  }
  return {
    QualityEngine: MockEngine,
  };
});

// Mock TieckCamera to simulate capture
vi.mock("@/components/TieckCamera", () => ({
  TieckCamera: ({ onCapture, onClose }: any) => (
    <div data-testid="mock-camera">
      <button
        data-testid="capture-btn"
        onClick={() => onCapture(new File([""], "test.jpg", { type: "image/jpeg" }))}
      >
        Capture
      </button>
      <button data-testid="close-btn" onClick={onClose}>
        Close
      </button>
    </div>
  ),
}));

describe("Camera AI Lifecycle & Integrity", () => {
  const mockBlock = { id: "b1", title: "Test Camera", type: "camera" as const };
  const mockSession = { responseId: "r1", responseToken: "t1" };
  const ensureResponseSession = vi.fn(async () => ({
    ...mockSession,
    checklistId: "c1",
    createdAt: Date.now(),
  }));

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("VITE_CAMERA_AI_ENABLED", "true");
    (global as any).fetch = vi.fn();
    global.URL.createObjectURL = vi.fn(() => "blob:test");
    global.URL.revokeObjectURL = vi.fn();
  });

  it("should block fetch to /api/camera-ai/verify if quality is invalid", async () => {
    const engine = new (QualityEngine as any)();
    engine.analyzeFile.mockResolvedValue({ state: "low_light" });

    render(
      <PublicCameraBlock
        block={mockBlock as any}
        checklistId="c1"
        session={mockSession}
        ensureResponseSession={ensureResponseSession}
      />
    );

    // Open camera
    fireEvent.click(screen.getByText("Test Camera"));

    // Simulate capture
    fireEvent.click(screen.getByTestId("capture-btn"));

    await waitFor(() => {
      // Check the error message area specifically
      expect(screen.getByText(/A foto ficou escura/)).toBeDefined();
    });

    expect(global.fetch).not.toHaveBeenCalled();
    expect(engine.dispose).toHaveBeenCalled();
  });

  it("should allow exactly one fetch if quality is ready", async () => {
    const engine = new (QualityEngine as any)();
    engine.analyzeFile.mockResolvedValue({ state: "ready" });
    (global.fetch as any).mockResolvedValue({
      status: 200,
      headers: new Headers({ "content-type": "application/json" }),
      json: async () => ({ ok: true, decision: "approved", persisted: true, evidenceId: "e1" }),
    });

    render(
      <PublicCameraBlock
        block={mockBlock as any}
        checklistId="c1"
        session={mockSession}
        ensureResponseSession={ensureResponseSession}
      />
    );

    fireEvent.click(screen.getByText("Test Camera"));
    fireEvent.click(screen.getByTestId("capture-btn"));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledTimes(1);
    }, { timeout: 3000 });

    const call = (global.fetch as any).mock.calls[0];
    const formData = call[1].body as FormData;
    const candidate = formData.get("candidate") as File;
    expect(engine.analyzeFile).toHaveBeenCalledWith(candidate);
    expect(engine.dispose).toHaveBeenCalled();
  });

  it("should dispose QualityEngine even if analyzeFile fails", async () => {
    const engine = new (QualityEngine as any)();
    engine.analyzeFile.mockRejectedValue(new Error("Canvas error"));

    render(
      <PublicCameraBlock
        block={mockBlock as any}
        checklistId="c1"
        session={mockSession}
        ensureResponseSession={ensureResponseSession}
      />
    );

    fireEvent.click(screen.getByText("Test Camera"));
    fireEvent.click(screen.getByTestId("capture-btn"));

    await waitFor(() => {
      expect(engine.dispose).toHaveBeenCalled();
    });
  });

  it("should not perform any API calls just by opening the camera", async () => {
    render(
      <PublicCameraBlock
        block={mockBlock as any}
        checklistId="c1"
        session={mockSession}
        ensureResponseSession={ensureResponseSession}
      />
    );

    fireEvent.click(screen.getByText("Test Camera"));

    // Wait a bit to ensure no auto-calls
    await new Promise((r) => setTimeout(r, 100));
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
