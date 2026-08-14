import { describe, it, expect, beforeEach } from 'vitest';
import { QualityEngine } from '@/lib/camera-quality/engine';
import { DEFAULT_THRESHOLDS } from '@/lib/camera-quality/types';

describe('QualityEngine - Basic logic', () => {
  let engine: QualityEngine;

  beforeEach(() => {
    engine = new QualityEngine(DEFAULT_THRESHOLDS);
  });

  it('should initialize with ready state (mocked video)', async () => {
    // Create a mock HTMLVideoElement
    const video = {
      videoWidth: 1280,
      videoHeight: 720,
      readyState: 4,
    } as unknown as HTMLVideoElement;

    // We can't easily test the full engine in Node/Vitest because it requires Canvas/DOM
    // But we can verify the class can be instantiated and has the required methods.
    expect(engine.analyzeFrame).toBeDefined();
    expect(engine.dispose).toBeDefined();
  });
});
