import { CameraQualityResult, CameraQualityState, DEFAULT_THRESHOLDS, QualityThresholds } from "./types";
import { calculateLuminance, calculateSharpness, calculateMotion } from "./metrics";

export class QualityEngine {
  private lastFrame: Uint8ClampedArray | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private thresholds: QualityThresholds;

  constructor(thresholds: QualityThresholds = DEFAULT_THRESHOLDS) {
    this.thresholds = thresholds;
  }

  /**
   * Static decision logic for testability outside DOM.
   */
  static determineState(metrics: {
    width: number;
    height: number;
    luminance: { average: number; brightPercent: number };
    sharpness: number;
    motion: number;
  }, thresholds: QualityThresholds = DEFAULT_THRESHOLDS): CameraQualityState {
    if (metrics.width < thresholds.minWidth || metrics.height < thresholds.minHeight) {
      return "unavailable";
    }
    if (metrics.luminance.average < thresholds.minBrightness) {
      return "low_light";
    }
    if (metrics.luminance.brightPercent > 0.3 || metrics.luminance.average > thresholds.maxBrightness) {
      return "overexposed";
    }
    if (metrics.sharpness < thresholds.minSharpness) {
      return "blurry";
    }
    if (metrics.motion > thresholds.maxMotion) {
      return "moving";
    }
    return "ready";
  }

  /**
   * Main entry point for analyzing a video frame.
   */
  async analyzeFrame(video: HTMLVideoElement): Promise<CameraQualityResult> {
    const { videoWidth: vw, videoHeight: vh } = video;
    return this.processSource(video, vw, vh);
  }

  /**
   * Analyzes a specific File or Blob produced by a capture.
   */
  async analyzeFile(file: File | Blob): Promise<CameraQualityResult> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const url = URL.createObjectURL(file);
      
      img.onload = async () => {
        URL.revokeObjectURL(url);
        try {
          const result = await this.processSource(img, img.naturalWidth, img.naturalHeight);
          resolve(result);
        } catch (err) {
          reject(err);
        }
      };
      
      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error("Failed to load image for analysis"));
      };
      
      img.src = url;
    });
  }

  private async processSource(source: CanvasImageSource, width: number, height: number): Promise<CameraQualityResult> {
    if (!this.canvas) {
      this.canvas = document.createElement('canvas');
      this.ctx = this.canvas.getContext('2d', { willReadFrequently: true });
    }

    // Resize for analysis (max 320px) to ensure speed and consistency
    const scale = Math.min(320 / Math.max(width, height), 1);
    const aw = Math.floor(width * scale);
    const ah = Math.floor(height * scale);
    
    this.canvas.width = aw;
    this.canvas.height = ah;
    
    if (!this.ctx) throw new Error("Canvas context not available");
    
    this.ctx.drawImage(source, 0, 0, aw, ah);
    const imageData = this.ctx.getImageData(0, 0, aw, ah);
    const data = imageData.data;

    const luminance = calculateLuminance(data);
    const sharpness = calculateSharpness(data, aw, ah);
    const motion = calculateMotion(data, this.lastFrame);
    
    this.lastFrame = new Uint8ClampedArray(data);

    const state = QualityEngine.determineState({
      width,
      height,
      luminance,
      sharpness,
      motion
    }, this.thresholds);

    return {
      state,
      brightnessScore: luminance.average,
      sharpnessScore: sharpness,
      motionScore: motion,
      width,
      height,
      capturedAt: Date.now()
    };
  }

  dispose() {
    this.lastFrame = null;
    if (this.canvas) {
      this.canvas.width = 0;
      this.canvas.height = 0;
      this.canvas = null;
    }
    this.ctx = null;
    this.isDisposed = true;
  }

  private isDisposed = false;

  getDisposedState() {
    return this.isDisposed;
  }
}
