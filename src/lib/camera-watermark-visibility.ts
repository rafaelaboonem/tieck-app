/**
 * Watermark visibility on the public checklist page (6A.4.1).
 *
 * Hidden ONLY while the live camera viewfinder is open (the watermark would
 * overlap the capture controls); restored in every other state. The watermark
 * is NOT rendered at all while the camera is open, so it can never capture
 * pointer events.
 */
export function shouldShowChecklistWatermark(showBranding: boolean, cameraOpen: boolean): boolean {
  return showBranding && !cameraOpen;
}
