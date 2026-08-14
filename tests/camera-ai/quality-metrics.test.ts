import { describe, it, expect, beforeEach } from 'vitest';
import { QualityEngine } from '@/lib/camera-quality/engine';
import { DEFAULT_THRESHOLDS } from '@/lib/camera-quality/types';

describe('QualityEngine - Capture Validation Logic (Deterministic)', () => {
  it('should block low light images', () => {
    const metrics = {
      width: 1280,
      height: 720,
      luminance: { average: 0.05, brightPercent: 0 },
      sharpness: 20,
      motion: 0
    };
    const state = QualityEngine.determineState(metrics);
    expect(state).toBe('low_light');
  });

  it('should block blurry images', () => {
    const metrics = {
      width: 1280,
      height: 720,
      luminance: { average: 0.5, brightPercent: 0 },
      sharpness: 2,
      motion: 0
    };
    const state = QualityEngine.determineState(metrics);
    expect(state).toBe('blurry');
  });

  it('should block overexposed images', () => {
    const metrics = {
      width: 1280,
      height: 720,
      luminance: { average: 0.95, brightPercent: 0.4 },
      sharpness: 20,
      motion: 0
    };
    const state = QualityEngine.determineState(metrics);
    expect(state).toBe('overexposed');
  });

  it('should block moving images', () => {
    const metrics = {
      width: 1280,
      height: 720,
      luminance: { average: 0.5, brightPercent: 0 },
      sharpness: 20,
      motion: 0.3
    };
    const state = QualityEngine.determineState(metrics);
    expect(state).toBe('moving');
  });

  it('should block low resolution images', () => {
    const metrics = {
      width: 320,
      height: 240,
      luminance: { average: 0.5, brightPercent: 0 },
      sharpness: 20,
      motion: 0
    };
    const state = QualityEngine.determineState(metrics);
    expect(state).toBe('unavailable');
  });

  it('should accept clear, well-lit, static images', () => {
    const metrics = {
      width: 1920,
      height: 1080,
      luminance: { average: 0.5, brightPercent: 0.05 },
      sharpness: 25,
      motion: 0.01
    };
    const state = QualityEngine.determineState(metrics);
    expect(state).toBe('ready');
  });
});
