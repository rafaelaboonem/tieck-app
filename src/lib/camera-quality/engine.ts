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

    let state: CameraQualityState = "ready";

    if (width < this.thresholds.minWidth || height < this.thresholds.minHeight) {
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
  }
}
