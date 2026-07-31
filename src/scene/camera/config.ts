/** Lens/camera tuning — simulating a macro lens rather than a generic 3D viewport camera. */
export const CAMERA_CONFIG = {
  /** Narrow FOV reads as a long macro focal length (~85-100mm-equivalent compression). */
  fov: 22,
  near: 0.1,
  far: 150,
  position: [0, 0, 6] as const,
  /** Slightly off-axis so the frame isn't dead-centered on the lens's default look direction. */
  target: [0.9, 0.35, 0] as const,

  dof: {
    /** World units from the camera — roughly where the foreground blooms sit. */
    focusDistance: 9,
    /** World units — kept thin for a shallow, macro-like plane of focus. */
    focusRange: 1.6,
    bokehScale: 4.5,
  },

  drift: {
    positionAmplitude: 0.022,
    rotationAmplitudeDeg: 0.22,
  },

  /** Letterbox aspect ratio for cinematic framing, independent of the actual viewport shape. */
  cinematicAspect: 2.35,
}
