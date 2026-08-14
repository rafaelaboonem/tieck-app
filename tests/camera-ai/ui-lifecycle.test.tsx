/* eslint-disable */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent, act } from "@testing-library/react";
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

// Mock Context
vi.mock("@/contexts/CameraSessionContext", () => {
  const mockStream = {
    getVideoTracks: () => [
      {
        getCapabilities: () => ({ torch: true }),
        applyConstraints: vi.fn(),
        stop: vi.fn(),
      },
    ],
  };
  return {
    useCameraSession: () => ({
      stream: mockStream,
      granted: true,
      denied: false,
      acquire: vi.fn().mockResolvedValue(mockStream),
      switchFacing: vi.fn(),
    }),
    isRestrictedWebView: () => false,
  };
});

describe("TieckCamera UI & Engine Lifecycle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    // HTMLVideoElement methods
    window.HTMLVideoElement.prototype.play = vi.fn().mockResolvedValue(undefined);
  });

  it("should stabilize indicator after two identical consecutive readings", async () => {
    const engine = new (QualityEngine as any)();
    engine.analyzeFrame.mockResolvedValue({
      state: "low_light",
      metrics: { luminance: 10, sharpness: 50, motion: 0 },
    });

    const { container } = render(
      <TieckCamera open={true} title="Test Camera" onCapture={() => {}} onClose={() => {}} />
    );

    // Mock video dimensions and playing state
    Object.defineProperty(window.HTMLVideoElement.prototype, "videoWidth", {
      value: 640,
      configurable: true,
    });
    Object.defineProperty(window.HTMLVideoElement.prototype, "videoHeight", {
      value: 480,
      configurable: true,
    });
    
    const video = container.querySelector("video");
    if (video) fireEvent(video, new Event("playing"));

    // Initial state check
    expect(screen.getByText(/Iniciando/i)).toBeDefined();

    // Advance time slightly to ensure analyze loop starts
    await act(async () => {
      vi.advanceTimersByTime(100);
    });

    // Trigger first analysis
    await act(async () => {
      vi.advanceTimersByTime(800);
    });

    // Trigger second analysis with same state
    await act(async () => {
      vi.advanceTimersByTime(800);
    });

    // Wait for the state to stabilize and update UI
    await waitFor(() => {
      expect(screen.getByText(/Ambiente com pouca luz/i)).toBeDefined();
    });
  });

  it("should dispose QualityEngine and clear timers on unmount", async () => {
    const engine = new (QualityEngine as any)();
    engine.analyzeFrame.mockResolvedValue({
      state: "ready",
      metrics: { luminance: 50, sharpness: 80, motion: 0 },
    });

    // Mock video dimensions and event
    Object.defineProperty(window.HTMLVideoElement.prototype, "videoWidth", {
      value: 640,
      configurable: true,
    });
    Object.defineProperty(window.HTMLVideoElement.prototype, "videoHeight", {
      value: 480,
      configurable: true,
    });

    const { unmount, container } = render(
      <TieckCamera open={true} title="Test Camera" onCapture={() => {}} onClose={() => {}} />
    );

    // Simulate video playing to start engine
    const video = container.querySelector("video");
    if (video) fireEvent(video, new Event("playing"));

    // Advance to ensure at least one analysis
    await act(async () => {
      vi.advanceTimersByTime(800);
    });

    expect(engine.analyzeFrame).toHaveBeenCalled();
    const callsBeforeUnmount = engine.analyzeFrame.mock.calls.length;

    unmount();

    // Confirm dispose exactly once
    expect(engine.dispose).toHaveBeenCalledTimes(1);

    // Advance more time and confirm no new calls
    await act(async () => {
      vi.advanceTimersByTime(2000);
    });
    expect(engine.analyzeFrame).toHaveBeenCalledTimes(callsBeforeUnmount);
  });
});
