/**
 * Environment tuning knobs. Everything here is deliberately muted/soft —
 * this system exists to give the flower field believable lighting, depth,
 * and colour, not to compete with it, and it's mostly seen through heavy
 * depth of field, so photographic plausibility matters far more than
 * geometric detail.
 *
 * Colour lives in paletteColors.ts, not here — ground/grass/vegetation/fog/
 * horizon colours all derive from the active render's palette (see
 * shared/palette.ts) so the environment stays cohesive with the flowers
 * growing in it instead of picking its own independent colours. Seeds
 * (environment RNG, meadow layout, terrain shape) come from the active
 * render's generative seed (see shared/generative.ts) too, not here. This
 * file only holds structural/geometric tuning: counts, ranges, extents.
 */
export const ENVIRONMENT_CONFIG = {
  // Terrain height itself (baseY, noise frequencies/amplitudes) lives in
  // shared/terrainShapeConfig.ts — the flower field samples the same shape
  // to sit flowers on the ground instead of floating at an unrelated height.
  terrain: {
    width: 260,
    depth: 260,
    widthSegments: 100,
    depthSegments: 100,
    /** World-space centre; keeps the mesh under the meadow regardless of camera orbit. */
    centerX: 0,
    centerZ: -25,
  },

  /** How much the environment's own fine soil texture contributes vs. the shared meadow cluster field. */
  groundSoilNoiseFrequency: 0.09,
  groundSoilWeight: 0.35,

  grass: {
    count: 42000,
    variantCount: 5,
    widthScale: 0.4,
    heightRange: [0.35, 0.8] as const,
    /** Grass only where blades would actually resolve before blur takes over — near/mid ground only. */
    zNear: 9,
    zFar: -30,
    xHalf: 30,
  },

  wildVegetation: {
    clumpCount: 650,
    leafletsPerClumpRange: [2, 5] as const,
    clumpRadius: 0.12,
    scaleRange: [0.08, 0.2] as const,
    zNear: 9,
    zFar: -26,
    xHalf: 28,
  },

  /** Softer and slightly denser than before — overcast haze hanging in the air, not dust. */
  fog: {
    density: 0.021,
  },

  /**
   * skyColor and horizonColor are kept close together on purpose — overcast
   * skies are famously flat (cloud cover scatters everything into a near-
   * uniform white-gray), so there's little vertical gradient to speak of,
   * unlike a clear-sky sunset gradient. horizonColor matches the fog colour
   * (both derive from the palette's hazeTint) so the terrain's far edge
   * blends into it seamlessly.
   */
  horizon: {
    radius: 130,
    horizonHeight: -1.5,
    spread: 75,
  },
}
