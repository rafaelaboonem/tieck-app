# Plan: Camera AI Phase 2 - Local Capture Assistance

Implementing Phase 2 of Tieck's Camera AI, focusing on local frame quality assessment (lighting, sharpness, stability) before sending to OpenAI. This ensures only usable photos are analyzed, improving UX and saving resources.

## User Review Required

> [!IMPORTANT]
> - Local analysis happens entirely in the browser using Canvas. No frames are sent to the server until a photo is captured and passes technical quality checks.
> - The live feedback is technical ("Ready", "Low Light") and does not imply the checklist requirement is met.

## Proposed Changes

### 1. Local Quality Engine
- Create `src/lib/camera-quality/` with pure functions for:
  - **Luminance:** Average and percentiles (check for low light/overexposure).
  - **Sharpness:** Laplacian variance or equivalent edge detection.
  - **Motion:** Frame-to-frame difference comparison (using scaled-down 320px frames).
  - **Resolution:** Real video dimensions check.
- Sampling rate: One assessment every 600-900ms.

### 2. Camera UX Refactor
- Update `src/components/TieckCamera.tsx`:
  - New fullscreen layout with compact top bar and large capture button.
  - Discreet "Capture Quality" indicator at the bottom.
  - Smooth state transitions requiring two consecutive similar results to prevent flickering.
  - Specific feedback messages: "Ambiente com pouca luz", "Mantenha a câmera firme", etc.

### 3. Capture Workflow Integration
- Update `src/components/PublicCameraBlock.tsx`:
  - Intercept capture event to perform a final local high-quality check.
  - Block OpenAI calls if the capture is technically unusable (blurred, too dark).
  - Provide specific "Retake" instructions locally without consuming API credits.

### 4. Technical Stabilization
- Ensure zero network egress during preview.
- Proper cleanup of MediaStreams, timers, and Canvas references.
- Accessibility: ARIA labels, 44px touch targets, AA contrast.

## Technical Details

- **Thresholds:**
    - Low Light: Average luminance < 40/255.
    - Overexposed: > 10% pixels > 240/255.
    - Blurry: Laplacian variance below a baseline (tuned for typical smartphone cameras).
    - Motion: > 5% significant pixel change between samples.
- **Contract:** New `CameraQualityResult` interface to standardize communication between the engine and the UI.
- **Environment:** No new migrations. Uses existing `/api/camera-ai/verify` endpoint.
