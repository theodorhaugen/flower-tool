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
    /** Raised from 42000 — read as sparse once the skinnier blade width above stopped visually padding out each instance. Leva's Grass > Density fold scales this further at runtime. */
    count: 60000,
    variantCount: 5,
    /**
     * Real grass blades run roughly 0.03-0.06 width:height — this was 0.4,
     * closer to a leaf/petal than a blade, which combined with the coarse
     * 1-segment-wide taper (see generateGrass.ts) read as chunky, faceted
     * polygons once the brighter/higher-contrast post pass (PostProcessing.tsx)
     * stopped blurring that texture into mush.
     */
    widthScale: 0.12,
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

  /**
   * Loose stone scattered along the worn path — a real dirt trail collects
   * pebbles the surrounding grass doesn't, which colour/depression alone
   * (groundColor.ts/buildTerrainGeometry.ts) can't produce. Fixed, mood-
   * independent stone tones rather than palette-derived — real rock doesn't
   * change colour with the light the way petals/haze do.
   */
  pebbles: {
    count: 260,
    variantCount: 4,
    scaleRange: [0.045, 0.11] as const,
    colors: ['#8a8378', '#6f6a5e', '#a39a86', '#7d7666'] as const,
    zNear: 9,
    zFar: -28,
    xHalf: 29,
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
