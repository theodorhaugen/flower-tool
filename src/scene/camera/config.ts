/** Lens/camera tuning — simulating a macro lens rather than a generic 3D viewport camera. */
export const CAMERA_CONFIG = {
  /** Narrow FOV reads as a long macro focal length (~85-100mm-equivalent compression). */
  fov: 22,
  near: 0.1,
  far: 150,

  /**
   * Elevated and angled down towards the meadow floor (terrain sits around
   * y ≈ -2.6 — see shared/terrainShapeConfig.ts) so flowers read as sitting
   * on the ground rather than floating in front of a level, eye-height lens.
   * position=(0, 9.4, 3), target=(1.2, -2.6, -9): the vertical drop (12)
   * and horizontal reach (~12) are equal, i.e. a 45° depression angle.
   */
  position: [0, 9.4, 3] as const,
  target: [1.2, -2.6, -9] as const,

  dof: {
    /** World units from the camera to roughly where the target/foreground blooms sit. */
    focusDistance: 17,
    /** World units — kept thin for a shallow, macro-like plane of focus. */
    focusRange: 3,
    bokehScale: 4.5,
  },

  drift: {
    positionAmplitude: 0.022,
    rotationAmplitudeDeg: 0.22,
  },
}
