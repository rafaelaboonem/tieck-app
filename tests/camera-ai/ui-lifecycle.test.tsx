/* eslint-disable */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { TieckCamera } from "@/components/TieckCamera";
import { QualityEngine } from "@/lib/camera-quality/engine";
import React from "react";

// Mocks
vi.mock("@/lib/camera-quality/engine", () => {
  const mockEngine = {
    analyzeFrame: vi.fn(),
    dispose: vi.fn(),
    getDisposedState: vi.fn(() => false),
  };
  function MockEngine() {
    return mockEngine;
  }
  return {
    QualityEngine: MockEngine,
  };
});

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

describe("TieckCamera UI & Engine Lifecycle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    window.HTMLVideoElement.prototype.play = vi.fn().mockResolvedValue(undefined);
  });

  it("should dispose QualityEngine on unmount", async () => {
    const engine = new (QualityEngine as any)();
    engine.analyzeFrame.mockResolvedValue({
      state: "ready",
      metrics: { luminance: 50, sharpness: 80, motion: 0 },
    });

    const { unmount, container } = render(
      <TieckCamera open={true} title="Test Camera" onCapture={() => {}} onClose={() => {}} />
    );

    const video = container.querySelector("video");
    if (video) {
      fireEvent(video, new Event("playing"));
    }

    await act(async () => {
      vi.advanceTimersByTime(800);
    });

    unmount();
    expect(engine.dispose).toHaveBeenCalled();
  });
});
