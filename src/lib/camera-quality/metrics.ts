import { QualityThresholds, DEFAULT_THRESHOLDS } from "./types";

/**
 * Calculates average brightness and checks for clipped pixels.
 */
export function calculateLuminance(data: Uint8ClampedArray): { average: number; darkPercent: number; brightPercent: number } {
  let total = 0;
  let darkCount = 0;
  let brightCount = 0;
  
  for (let i = 0; i < data.length; i += 4) {
    // Standard luminance weights: 0.299R + 0.587G + 0.114B
    const lum = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    total += lum;
    if (lum < 30) darkCount++;
    if (lum > 225) brightCount++;
  }
  
  const pixelCount = data.length / 4;
  return {
    average: total / pixelCount / 255,
    darkPercent: darkCount / pixelCount,
    brightPercent: brightCount / pixelCount
  };
}

/**
 * Simple sharpness metric based on the sum of absolute gradients (Laplacian approximation).
 */
export function calculateSharpness(data: Uint8ClampedArray, width: number, height: number): number {
  let score = 0;
  // We skip edges for simplicity
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const idx = (y * width + x) * 4;
      const center = data[idx];
      
      // Basic Laplacian kernel approximation: [0, 1, 0; 1, -4, 1; 0, 1, 0]
      const up = data[((y - 1) * width + x) * 4];
      const down = data[((y + 1) * width + x) * 4];
      const left = data[(y * width + (x - 1)) * 4];
      const right = data[(y * width + (x + 1)) * 4];
      
      score += Math.abs(4 * center - up - down - left - right);
    }
  }
  
  return score / (width * height);
}

/**
 * Calculates motion by comparing current frame with previous frame (scaled down).
 */
export function calculateMotion(current: Uint8ClampedArray, previous: Uint8ClampedArray | null): number {
  if (!previous || current.length !== previous.length) return 0;
  
  let diff = 0;
  for (let i = 0; i < current.length; i += 4) {
    // Only compare luminance for speed
    const lum1 = 0.299 * current[i] + 0.587 * current[i + 1] + 0.114 * current[i + 2];
    const lum2 = 0.299 * previous[i] + 0.587 * previous[i + 1] + 0.114 * previous[i + 2];
    if (Math.abs(lum1 - lum2) > 30) {
      diff++;
    }
  }
  
  return diff / (current.length / 4);
}
