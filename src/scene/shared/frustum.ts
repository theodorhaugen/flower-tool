/**
 * Shared "how wide/deep is the meadow" constants, used by both the flower
 * field and the environment so grass/ground patterns line up with flower
 * placement instead of each system inventing its own sense of scale.
 */

/** Matches MainCamera's default position — the field/meadow is composed for this vantage point. */
export const CAMERA_Z = 6

/** z bounds of the meadow, world units. Near edge, far edge (far is more negative). */
export const MEADOW_DEPTH_NEAR = 0
export const MEADOW_DEPTH_FAR = -70

const FRUSTUM_WIDTH_BASE = 1.8
const FRUSTUM_WIDTH_PER_DEPTH = 0.55

export function distanceFromCamera(z: number): number {
  return Math.max(0, CAMERA_Z - z)
}

/** Half-width of the visible ground at a given z — wider the further it is from the camera. */
export function frustumWidthHalfAt(z: number): number {
  return FRUSTUM_WIDTH_BASE + FRUSTUM_WIDTH_PER_DEPTH * distanceFromCamera(z)
}
