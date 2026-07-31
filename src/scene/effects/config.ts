/**
 * Analogue-photography post-processing tuning. Every effect here is meant
 * to read as a property of film/lens/print, not a digital filter — kept
 * subtle enough that it's felt rather than noticed on its own.
 */
export const POST_PROCESSING_CONFIG = {
  bloom: {
    intensity: 0.4,
    luminanceThreshold: 0.5,
    luminanceSmoothing: 0.3,
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
