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
    intensity: 0.35,
    luminanceThreshold: 0.42,
    luminanceSmoothing: 0.45,
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
    haze: {
      /** Matches environment/config.ts's fog.color — reads as one atmosphere, not two competing effects. */
      color: '#d8d2c6',
      frequency: 1.8,
      driftSpeed: 0.02,
      strength: 0.12,
      depthFalloff: 0.06,
    },
    volumetric: {
      strength: 0.3,
      radius: 3,
    },
    bilateral: {
      radius: 1.5,
      spatialSigma: 1,
      rangeSigma: 0.15,
    },
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

  /** Film grain — premultiplied so it fades in shadows the way real emulsion grain does, not a uniform digital-noise overlay. */
  grain: {
    opacity: 0.09,
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

  vignette: {
    offset: 0.2,
    darkness: 0.6,
  },
}
