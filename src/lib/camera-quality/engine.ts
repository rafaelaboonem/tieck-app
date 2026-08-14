import { CameraQualityResult, CameraQualityState, DEFAULT_THRESHOLDS, QualityThresholds } from "./types";
import { calculateLuminance, calculateSharpness, calculateMotion } from "./metrics";

export class QualityEngine {
  private lastFrame: Uint8ClampedArray | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2Array | null = null;
  private thresholds: QualityThresholds;

  constructor(thresholds: QualityThresholds = DEFAULT_THRESHOLDS) {
    this.thresholds = thresholds;
  }

  async analyzeFrame(video: HTMLVideoElement): Promise<CameraQualityResult> {
    if (!this.canvas) {
      this.canvas = document.createElement('canvas');
      this.ctx = this.canvas.getContext('2d', { willReadFrequently: true });
    }

    const { videoWidth: vw, videoHeight: vh } = video;
    
    // Resize for analysis (max 320px)
    const scale = Math.min(320 / Math.max(vw, vh), 1);
    const aw = Math.floor(vw * scale);
    const ah = Math.floor(vh * scale);
    
    this.canvas.width = aw;
    this.canvas.height = ah;
    
    if (!this.ctx) throw new Error("Canvas context not available");
    
    this.ctx.drawImage(video, 0, 0, aw, ah);
    const imageData = this.ctx.getImageData(0, 0, aw, ah);
    const data = imageData.data;

    const luminance = calculateLuminance(data);
    const sharpness = calculateSharpness(data, aw, ah);
    const motion = calculateMotion(data, this.lastFrame);
    
    this.lastFrame = new Uint8ClampedArray(data);

    let state: CameraQualityState = "ready";

    if (vw < this.thresholds.minWidth || vh < this.thresholds.minHeight) {
      state = "unavailable";
    } else if (luminance.average < this.thresholds.minBrightness) {
      state = "low_light";
    } else if (luminance.brightPercent > 0.3 || luminance.average > this.thresholds.maxBrightness) {
      state = "overexposed";
    } else if (sharpness < this.thresholds.minSharpness) {
      state = "blurry";
    } else if (motion > this.thresholds.maxMotion) {
      state = "moving";
    }

    return {
      state,
      brightnessScore: luminance.average,
      sharpnessScore: sharpness,
      motionScore: motion,
      width: vw,
      height: vh,
      capturedAt: Date.now()
    };
  }

  dispose() {
    this.lastFrame = null;
    this.canvas = null;
    this.ctx = null;
  }
}
