import { CAMERA_CONFIG } from '../camera/config'

/**
 * How much a render is currently zoomed in, relative to the base framing —
 * `1` at Leva's Camera > Zoom default, growing past it as the lens narrows
 * (zooms in), shrinking below it as it widens (zooms out). Derived from the
 * active render's actual `fov` (not read from Leva's zoom control directly)
 * so this always matches whatever `MainCamera.tsx` is really using,
 * regardless of how that FOV got there.
 *
 * Exists because bloom (PostProcessing.tsx) and halation
 * (HalationPass.ts's ring-sample radius) both work in fixed screen-space
 * pixel terms, with no idea what the camera's FOV is doing. Zooming in
 * magnifies a highlight's own on-screen size, but a glow effect sized in
 * fixed pixels doesn't grow to match it — so relative to the now-bigger
 * subject, the same glow reads as thinner/weaker the more zoomed in a
 * render is. Measured directly on a matched-content comparison (same seed,
 * same flowers in frame, only Zoom changed): the brightest highlight
 * pixels (99th percentile) lost about 11% of their luminance between
 * Zoom's minimum and maximum. This factor is what lets those effects claw
 * that back, scaled to how far zoom has actually moved from baseline.
 */
export function zoomGlowFactor(fov: number): number {
  return CAMERA_CONFIG.fov / fov
}
