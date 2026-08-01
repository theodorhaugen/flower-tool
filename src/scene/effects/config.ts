/**
 * Analogue-photography post-processing tuning. Every effect here is meant
 * to read as a property of film/lens/print, not a digital filter — kept
 * subtle enough that it's felt rather than noticed on its own.
 */
export const POST_PROCESSING_CONFIG = {
  /**
   * Lowered threshold + wider smoothing vs. a "highlights only" bloom, so
   * glow spreads from more of the pale, diffusely-lit petals/haze rather
   * than only the brightest few pixels — reads as atmosphere, not a
   * flare. Intensity is trimmed slightly to compensate, so the extra
   * surfaces blooming don't just wash the frame brighter overall.
   */
  bloom: {
    intensity: 0.26,
    luminanceThreshold: 0.48,
    luminanceSmoothing: 0.35,
  },

  /**
   * A second, deliberately tighter/hotter bloom layered on top of the soft
   * atmosphere one above — high threshold + narrow smoothing so *only*
   * genuinely blown-out highlights (direct sun catching a petal edge, the
   * brightest sky) glow hard, the way real optical bloom does in strongly
   * backlit macro/ICM photography (see the reference images this was tuned
   * against) — rather than the soft, even glow the low-threshold bloom
   * above produces on its own, which reads as haze rather than a highlight
   * blowing out. `intensity` is Leva's Lens > Highlight Bloom control (see
   * shared/generative.ts's `highlightBloomIntensity`), the value below is
   * only its starting default.
   */
  highlightBloom: {
    intensity: 0.55,
    luminanceThreshold: 0.82,
    luminanceSmoothing: 0.12,
  },

  /**
   * Atmospheric softness: three effects meant to be tuned together, not
   * independently — see AtmosphericHazeEffect.ts / BilateralSoftEffect.ts.
   * `haze`/`volumetric` gate by view-space distance so the foreground/focal
   * subject stays close to untouched (aerial perspective thickens with
   * depth, it doesn't sit evenly over the whole frame); `bilateral` then
   * smooths whatever fine texture that leaves behind — grass/petal grain,
   * the haze noise itself — while its luminance-difference term keeps
   * genuine contrast edges (a flower's silhouette against the grass, the
   * in-focus subject's boundary) intact. That combination is the actual
   * "don't destroy contrast" mechanism: gate by depth, then blur in a way
   * that respects edges, rather than a flat full-frame blur.
   */
  atmosphere: {
    /** `haze.color` isn't set here — it's the active palette's `hazeTint` (see PostProcessing.tsx), so it matches environment/Fog.tsx's fog colour instead of drifting from it. */
    haze: {
      frequency: 1.8,
      driftSpeed: 0.02,
      strength: 0.09,
      depthFalloff: 0.06,
    },
    volumetric: {
      strength: 0.22,
      radius: 3,
    },
    /**
     * Trimmed from the original (radius 1.5, rangeSigma 0.15): this filter
     * has no depth gating of its own, so at the old settings it was
     * smoothing fine petal/grass texture on the in-focus subject right
     * along with the background, which was a real contributor to the
     * overall "muddy" look. A smaller radius and tighter rangeSigma still
     * catch the fine noise haze/bloom/DoF leave behind without eating as
     * much of the subject's own detail.
     */
    bilateral: {
      radius: 1,
      spatialSigma: 1,
      rangeSigma: 0.12,
    },
  },

  /**
   * Structural tuning for PaletteGradePass — colours themselves come from
   * the active palette's `highlight`/`shadow`/`bloomTint` (see
   * PostProcessing.tsx), this is just how strongly each is felt. Kept
   * gentle for the two-point grade (0.12 each) and vibrance (0.4) — colour/
   * saturation tuning is deliberately out of scope of the contrast/
   * dynamic-range pass this was last adjusted for (see SceneLighting.tsx's
   * docstring for where that actually happened instead: real per-pixel
   * shadow depth is a *lighting* problem, not something a post-process
   * contrast pivot can manufacture out of a flatly-lit input). Only
   * `contrast` and `vignette` reflect that pass — both are pure luminance
   * operations with no colour/hue component. `bloomBiasThreshold` should
   * sit close to `bloom.luminanceThreshold` above — the point is to catch
   * the same pixels Bloom is about to bloom.
   */
  paletteGrade: {
    highlightStrength: 0.12,
    shadowStrength: 0.12,
    bloomBiasStrength: 0.35,
    bloomBiasThreshold: 0.55,
    /** Kept at 1 (unchanged) — SceneLighting.tsx's key/fill ratio is the actual exposure fix; this stays here only so the shader/uniform exists for future tuning. */
    exposure: 1,
    /** A mild punch on top of the now wider-dynamic-range lighting input, not the whole contrast mechanism — see SceneLighting.tsx. */
    contrast: 1.18,
    /** Strongest on already-muddy/desaturated pixels, tapers off on already-vivid ones — see the shader for the exact falloff. Colour/saturation tuning, deliberately left at its original value — see class docstring. */
    vibrance: 0.4,
    /** Soft corner falloff — see PaletteGradePass.ts's shader comment for why this is multiplicative distance-based darkening, not the harder-edged `Vignette` effect this project deliberately dropped earlier. A luminance-only lens/lighting characteristic, not a colour choice. */
    vignette: 0.22,
  },

  /**
   * Warm chromatic bleed around only the brightest highlights — see
   * effects/HalationPass.ts. `threshold` matches `highlightBloom`'s above so
   * this reads as that same bloom's own fringe rather than an independent
   * glow; kept subtle (0.18) since this is a texture cue, not a second
   * bloom pass.
   */
  halation: {
    threshold: 0.82,
    intensity: 0.18,
    tint: [1, 0.45, 0.25] as const,
  },

  /** Weaker in the middle, stronger towards the edges — how a real lens's fringing actually behaves, not a full-frame colour shift. */
  chromaticAberration: {
    offset: [0.0012, 0.0012] as const,
    radialModulation: true,
    modulationOffset: 0.5,
  },

  /** Slight barrel bow, not a fisheye — the gentle edge curvature a real lens (especially at macro focal lengths) shows. */
  lensDistortion: {
    distortion: [0.006, 0.002] as const,
    principalPoint: [0, 0] as const,
    focalLength: [1, 1] as const,
    skew: 0,
  },

  /**
   * Film grain — see effects/TextureGrainPass.ts. A real photographed grain
   * plate (effects/textures/grain.jpg) laid over the frame with a standard
   * Overlay blend, rather than procedurally generated. `highlightFalloff*`
   * fades the grain out through the highlights (real emulsion density
   * thins out there too) so it mostly reads in the shadows/midtones,
   * exactly like actual film. Both `opacity` and `size` are Leva's Film
   * fold ("Grain Amount"/"Grain Size", see shared/generative.ts) multiplier
   * bases — 1 = as tuned here. `size` reads the intuitive way (bigger
   * number, bigger-looking grain) even though TextureGrainPass's own
   * `grainScale` option runs the opposite direction internally (it's a UV
   * multiplier — *smaller* samples a smaller crop of the plate, magnified,
   * which is what actually makes the grain look bigger on screen) — see
   * GrainOverlay.tsx, which inverts it (`1 / size`) so this config value and
   * Leva's "Grain Size" slider don't have to.
   */
  grain: {
    opacity: 0.8,
    size: 1,
    highlightFalloffStart: 0.55,
    highlightFalloffEnd: 0.95,
  },

  /**
   * Simulated intentional-camera-movement (ICM) long-exposure blur: blends
   * each frame with a decaying history of recent frames, so CameraSweep's
   * wide, slow pan (see camera/config.ts's `sweep` block) streaks the whole
   * frame into directional colour bands rather than a fuzzy static smear.
   * `halfLifeSeconds` is how long that history takes to fade to half
   * strength — this is the main knob for streak "reach": too short and the
   * sweep never accumulates into a visible trail, too long and it stops
   * reading as motion and starts reading as a soft double-exposure ghost.
   */
  motionBlur: {
    halfLifeSeconds: 0.9,
  },
}
