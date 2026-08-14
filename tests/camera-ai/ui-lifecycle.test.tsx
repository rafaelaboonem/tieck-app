import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, cleanup } from '@testing-library/react';
import { TieckCamera } from '@/components/TieckCamera';
import { QualityEngine } from '@/lib/camera-quality/engine';
import React from 'react';

// Mocks
vi.mock('@/lib/camera-quality/engine', () => {
  const mockEngine = {
    analyzeFrame: vi.fn(),
    dispose: vi.fn(),
    getDisposedState: vi.fn(() => false)
  };
  return {
    QualityEngine: vi.fn(() => mockEngine)
  };
});

// Mock Context
vi.mock('@/contexts/CameraSessionContext', () => ({
  useCameraSession: () => ({
    stream: { 
      getVideoTracks: () => [{ 
        getCapabilities: () => ({ torch: true }),
        applyConstraints: vi.fn()
      }]
    },
    granted: true,
    denied: false,
    acquire: vi.fn(),
    switchFacing: vi.fn()
  }),
  isRestrictedWebView: () => false
}));

describe('TieckCamera UI & Engine Lifecycle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    // HTMLVideoElement methods
    window.HTMLVideoElement.prototype.play = vi.fn().mockResolvedValue(undefined);
  });

  it('should stabilize indicator after two identical consecutive readings', async () => {
    const engine = new QualityEngine();
    (engine.analyzeFrame as any).mockResolvedValue({ state: 'low_light' });

    render(
      <TieckCamera 
        open={true} 
        title="Test Camera" 
        onCapture={() => {}} 
        onClose={() => {}} 
      />
    );

    // Initial state
    expect(screen.getByText('Iniciando...')).toBeDefined();

    // Trigger first analysis
    await vi.advanceTimersByTimeAsync(100);
    
    // Still "Iniciando..." because we need 2 states
    expect(screen.getByText('Iniciando...')).toBeDefined();

    // Trigger second analysis with same state
    await vi.advanceTimersByTimeAsync(800);
    
    await waitFor(() => {
      expect(screen.getByText('Ambiente com pouca luz')).toBeDefined();
    });
  });

  it('should dispose QualityEngine and clear timers on unmount', async () => {
    const engine = new QualityEngine();
    const { unmount } = render(
      <TieckCamera 
        open={true} 
        title="Test Camera" 
        onCapture={() => {}} 
        onClose={() => {}} 
      />
    );

    unmount();

    expect(engine.dispose).toHaveBeenCalled();
    // Verify no more analyze calls happen after unmount
    await vi.advanceTimersByTimeAsync(2000);
    expect(engine.analyzeFrame).toHaveBeenCalledTimes(0); 
  });
});
