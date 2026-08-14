export type CameraQualityState =
  | "initializing"
  | "ready"
  | "low_light"
  | "overexposed"
  | "blurry"
  | "moving"
  | "unavailable";

export interface CameraQualityResult {
  state: CameraQualityState;
  brightnessScore: number; // 0-1
  sharpnessScore: number;  // Normalized
  motionScore: number;     // 0-1 (difference between frames)
  width: number;
  height: number;
  capturedAt: number;
}

export interface QualityThresholds {
  minBrightness: number;
  maxBrightness: number;
  minSharpness: number;
  maxMotion: number;
  minWidth: number;
  minHeight: number;
}

export const DEFAULT_THRESHOLDS: QualityThresholds = {
  minBrightness: 0.15, // ~40/255
  maxBrightness: 0.90, // ~230/255
  minSharpness: 10,    // Base Laplacian variance
  maxMotion: 0.1,      // 10% change
  minWidth: 640,
  minHeight: 480,
};
