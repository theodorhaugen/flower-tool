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

  /**
   * Physically-inspired depth of field (postprocessing's RealisticBokehEffect)
   * — blur comes from the real thin-lens circle-of-confusion equation
   * (focal length + aperture + focus distance), not a hand-tuned falloff.
   * The three lens parameters the equation actually needs are all here.
   */
  dof: {
    /** Focus distance, world units from the camera — roughly where the target/foreground blooms sit. */
    focusDistance: 17,
    /**
     * The lens formula needs a real physical scale (it works in meters/mm),
     * but our world units are otherwise arbitrary. 1 world unit ≈ this many
     * meters — chosen so flowers/petals (roughly 0.3-2 world units across)
     * read as a few centimetres, i.e. actual macro-subject scale.
     */
    metersPerWorldUnit: 0.03,
    /** Focal length in mm — 100mm is a classic macro-lens length. */
    focalLength: 100,
    /** Aperture (f-number). Kept wide/low so defocus is dominant rather than photographically "correct" (real macro is usually stopped down for more sharpness, the opposite of what we want here). */
    fStop: 1.4,
    /** Bokeh disc size multiplier — the physics decides *how much* to blur a given pixel, this decides how large that blur renders. */
    maxBlur: 1.4,
    /** Blur quality (ring/sample count for the bokeh disc sampling) — higher looks smoother but costs more. */
    rings: 4,
    samples: 3,
  },

  drift: {
    positionAmplitude: 0.045,
    rotationAmplitudeDeg: 0.4,
  },
}
