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
   * CameraFraming.tsx read the derived value, not these directly.
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
   * The wide, slow sweep that drives the strong, directional intentional-
   * camera-movement (ICM) blur look (LongExposureBlurPass, see
   * effects/config.ts) — much bigger than `drift` above, which stays a
   * separate, barely-there tremor layered on top for texture.
   *
   * A sine wave is locally near-linear around its zero-crossings, which is
   * what turns into a clean directional streak once blended, rather than a
   * fuzzy back-and-forth smear — but only if the blur's `halfLifeSeconds`
   * (effects/config.ts) stays well *under* `periodSeconds / 2` (the time
   * one directional half-swing takes); otherwise the blend starts pulling
   * in the reversed half of the swing and cancels the streak out.
   *
   * `rotationAmplitudeDeg` is the *base* sweep size — the active render's
   * generative seed scales it by `motionBlurStrength` (shared/generative.ts,
   * a wide per-seed range) so some renders barely pan at all (soft blur that
   * still reads the flower shapes underneath it, rather than erasing them
   * into a fully abstract streak — real ICM/soft-focus macro photography
   * covers both looks, not just one) while others sweep hard into a
   * strongly directional streak. Which *direction* that pan
   * goes — horizontal, vertical, or anywhere between — is likewise no
   * longer fixed: it's `motionBlurDirectionAngle`, also seed-derived. Roll
   * stays fixed and small (`rollWeight`) regardless — it's a subtle texture
   * wobble, not the sweep's main direction. See CameraSweep.tsx and
   * effects/LongExposureBlurPass.ts, which both read the same per-seed
   * strength/direction so the pass's own within-frame streak estimate never
   * drifts out of sync with what the camera is actually doing.
   */
  sweep: {
    /**
     * Lowered from an earlier 20° — at `motionBlurStrength`'s natural top
     * end (1.7, shared/generative.ts) that made the actual clamp below do
     * essentially all the work (20° × 1.7 = 34°, deep into the range this
     * camera's 22° FOV can no longer keep the swept subject recognisable
     * in), and left Leva's own Blur Length slider with a long dead zone at
     * its top where dragging further did nothing extra. 8° keeps the same
     * 1.7 ceiling landing right at `maxRotationAmplitudeDeg` below instead
     * of far past it — see that constant's own comment.
     */
    rotationAmplitudeDeg: 8,
    periodSeconds: 2.4,
    /** Subtle roll wobble, relative to `rotationAmplitudeDeg` — kept small and fixed regardless of `motionBlurStrength`/`motionBlurDirectionAngle`. */
    rollWeight: 0.05,
    /**
     * Hard ceiling on the *actual* swept amplitude, in degrees, after
     * `motionBlurStrength` (Leva's Camera > Blur Length — the single dial
     * on the sweep now, see CameraSweep.tsx) has been applied. Set just
     * above `rotationAmplitudeDeg`(8°) × 1.7 (`motionBlurStrength`'s own
     * hard ceiling, shared/generative.ts, which Leva's own Blur Length
     * slider range matches exactly — GenerativeProvider.tsx) — so in normal
     * use this never actually engages; it exists purely as a defensive
     * ceiling. This used to be a real, frequently-engaging clamp (30°
     * against a 34° raw max) which produced a dead zone across the top of
     * Blur Length's range and let even Leva's own maximum swing the camera
     * roughly 1.4x this camera's 22° FOV — well past where the swept
     * subject stays recognisable, which is what actually needed fixing.
     */
    maxRotationAmplitudeDeg: 14,
  },
}
