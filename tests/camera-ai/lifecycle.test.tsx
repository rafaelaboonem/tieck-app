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

// Mock Contexts
vi.mock("@/contexts/CameraSessionContext", () => ({
  useCameraSession: () => ({
    stream: { getVideoTracks: () => [] },
    granted: true,
    denied: false,
    acquire: vi.fn().mockResolvedValue({}),
    switchFacing: vi.fn(),
  }),
  isRestrictedWebView: () => false,
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

  it("should block fetch if quality is invalid", async () => {
    const engine = new (QualityEngine as any)();
    engine.analyzeFile.mockResolvedValue({ state: "low_light" });

    const { container } = render(<PublicCameraBlock block={mockBlock} checklistId="c1" onAnswer={vi.fn()} />);

    const file = new File(["test"], "test.jpg", { type: "image/jpeg" });
    const input = container.querySelector('input[type="file"]');
    
    if (input) {
      fireEvent.change(input, { target: { files: [file] } });
      await waitFor(() => {
        expect(screen.getByText(/foto ficou escura/i)).toBeDefined();
      });
    }
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("should allow fetch if quality is ready", async () => {
    const engine = new (QualityEngine as any)();
    engine.analyzeFile.mockResolvedValue({ state: "ready" });
    
    const mockResponse = {
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "application/json" }),
      json: async () => ({ ok: true, decision: "approved", persisted: true, evidenceId: "e1" }),
    };
    (global.fetch as any).mockResolvedValue(mockResponse);

    const { container } = render(<PublicCameraBlock block={mockBlock} checklistId="c1" onAnswer={vi.fn()} />);
    const file = new File(["test"], "test.jpg", { type: "image/jpeg" });
    const input = container.querySelector('input[type="file"]');
    
    if (input) {
      fireEvent.change(input, { target: { files: [file] } });
      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalled();
      });
    }
  });

  it("should not perform API calls on mount", async () => {
    render(<PublicCameraBlock block={mockBlock} checklistId="c1" onAnswer={vi.fn()} />);
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
