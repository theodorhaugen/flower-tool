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
   *
   * These are the *base* values — the active render's generative seed
   * jitters both within a bounded range around them (see
   * shared/generative.ts), so every seed gets a different vantage point
   * while staying this same deliberate macro-photography framing rather
   * than an unbounded/arbitrary camera placement. MainCamera.tsx/
   * CameraControls.tsx read the derived value, not these directly.
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
    /**
     * Focus distance, world units from the camera — roughly where the
     * target/foreground blooms sit. This is the *base* value; the active
     * render's generative seed varies around it (see shared/generative.ts,
     * consumed by LensOpticsDepthOfField.tsx) so different seeds pull
     * focus to a different depth in the field.
     */
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

  /** Fine tremor — barely-there per-frame jitter, see HandheldDrift.tsx. */
  drift: {
    positionAmplitude: 0.045,
    rotationAmplitudeDeg: 0.4,
  },

  /**
   * The wide, fast sweep that drives the strong, directional intentional-
   * camera-movement (ICM) blur look (LongExposureBlurPass, see
   * effects/config.ts) — much bigger and faster than `drift` above, which
   * stays a separate, barely-there tremor layered on top for texture.
   *
   * A sine wave is locally near-linear around its zero-crossings, which is
   * what turns into a clean directional streak once blended, rather than a
   * fuzzy back-and-forth smear — but only if the blur's `halfLifeSeconds`
   * (effects/config.ts) stays well *under* `periodSeconds / 2` (the time
   * one directional half-swing takes); otherwise the blend starts pulling
   * in the reversed half of the swing and cancels the streak out. Almost
   * pure yaw (`axisWeights[1]`) for a mostly-horizontal streak — panning is
   * what a handheld ICM shot actually does. See CameraSweep.tsx.
   */
  sweep: {
    rotationAmplitudeDeg: 20,
    periodSeconds: 2.4,
    /** [pitch, yaw, roll] — relative weights, not absolute degrees. */
    axisWeights: [0.1, 1, 0.05] as const,
  },
}
