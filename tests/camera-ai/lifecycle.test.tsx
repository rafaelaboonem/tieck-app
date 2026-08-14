/* eslint-disable */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent, act } from "@testing-library/react";
import { PublicCameraBlock } from "@/components/PublicCameraBlock";
import { QualityEngine } from "@/lib/camera-quality/engine";
import React from "react";

// Mock Supabase Client
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          single: vi.fn(() => ({ data: null, error: null })),
        })),
      })),
      insert: vi.fn(() => ({
        select: vi.fn(() => ({
          single: vi.fn(() => ({ data: { id: "new-id" }, error: null })),
        })),
      })),
    })),
    rpc: vi.fn().mockResolvedValue({ data: { responseToken: "t1", responseId: "r1" }, error: null }),
  },
}));

// Mock the quality engine
vi.mock("@/lib/camera-quality/engine", () => {
  const mockEngine = {
    analyzeFile: vi.fn(),
    dispose: vi.fn(),
  };
  function MockEngine() {
    return mockEngine;
  }
  return {
    QualityEngine: MockEngine,
  };
});

describe("Camera AI Lifecycle & Integrity", () => {
  const mockBlock = {
    id: "b1",
    type: "camera" as const,
    question: "Tire uma foto",
    required: true,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    (global as any).importMeta = { env: { VITE_CAMERA_AI_ENABLED: "true" } };
    global.fetch = vi.fn();
    global.URL.createObjectURL = vi.fn(() => "blob:n-123");
    global.URL.revokeObjectURL = vi.fn();
  });

  const getHiddenInput = (container: HTMLElement) => {
    // PublicCameraBlock renders the capture-btn label/button which triggers a hidden file input
    return container.querySelector('input[type="file"]') as HTMLInputElement;
  };

  it("should block fetch to /api/camera-ai/verify if quality is invalid", async () => {
    const engine = new (QualityEngine as any)();
    engine.analyzeFile.mockResolvedValue({ state: "low_light" });

    const { container } = render(
      <PublicCameraBlock
        block={mockBlock}
        checklistId="c1"
        onAnswer={vi.fn()}
      />
    );

    const file = new File(["test"], "test.jpg", { type: "image/jpeg" });
    const input = getHiddenInput(container);
    if (!input) throw new Error("Input not found");
    
    await act(async () => {
      fireEvent.change(input, { target: { files: [file] } });
    });

    await waitFor(() => {
      expect(screen.getByText(/A foto ficou escura/i)).toBeDefined();
    });

    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("should allow exactly one fetch if quality is ready", async () => {
    const engine = new (QualityEngine as any)();
    engine.analyzeFile.mockResolvedValue({ state: "ready" });

    const mockResponse = {
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "application/json" }),
      json: async () => ({ ok: true, decision: "approved", persisted: true, evidenceId: "e1" }),
    };
    (global.fetch as any).mockResolvedValue(mockResponse);

    const { container } = render(
      <PublicCameraBlock
        block={mockBlock}
        checklistId="c1"
        onAnswer={vi.fn()}
      />
    );

    const file = new File(["test"], "test.jpg", { type: "image/jpeg" });
    const input = getHiddenInput(container);
    if (!input) throw new Error("Input not found");
    
    await act(async () => {
      fireEvent.change(input, { target: { files: [file] } });
    });

    await waitFor(() => {
      expect(engine.analyzeFile).toHaveBeenCalled();
    });

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });
  });

  it("should dispose QualityEngine even if analyzeFile fails", async () => {
    const engine = new (QualityEngine as any)();
    engine.analyzeFile.mockRejectedValue(new Error("Canvas error"));

    (global.fetch as any).mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "application/json" }),
      json: async () => ({ ok: true, decision: "approved", persisted: true, evidenceId: "e2" }),
    });

    const { container } = render(<PublicCameraBlock block={mockBlock} checklistId="c1" onAnswer={vi.fn()} />);

    const file = new File(["test"], "test.jpg", { type: "image/jpeg" });
    const input = getHiddenInput(container);
    if (!input) throw new Error("Input not found");
    
    await act(async () => {
      fireEvent.change(input, { target: { files: [file] } });
    });

    await waitFor(() => {
      expect(engine.dispose).toHaveBeenCalled();
      expect(global.fetch).toHaveBeenCalled();
    });
  });

  it("should not perform any API calls just by opening the camera", async () => {
    render(<PublicCameraBlock block={mockBlock} checklistId="c1" onAnswer={vi.fn()} />);
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
