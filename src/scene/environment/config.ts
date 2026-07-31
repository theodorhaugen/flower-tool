/**
 * Environment tuning knobs. Everything here is deliberately muted/soft —
 * this system exists to give the flower field believable lighting, depth,
 * and colour, not to compete with it, and it's mostly seen through heavy
 * depth of field, so photographic plausibility matters far more than
 * geometric detail.
 */
export const ENVIRONMENT_CONFIG = {
  seed: 4242,

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

  /** Ground vertex-colour palette — kept low-saturation so flowers stay the focal colour. */
  groundColors: {
    dry: '#a3946f', // path / bare dirt
    sparse: '#8c9370', // dry, sparse grass
    lush: '#5c6e4c', // dense grass
    shadow: '#3d4936', // damp hollows / shadowed patches
  },
  /** How much the environment's own fine soil texture contributes vs. the shared meadow cluster field. */
  groundSoilNoiseFrequency: 0.09,
  groundSoilWeight: 0.35,

  grass: {
    count: 42000,
    variantCount: 5,
    widthScale: 0.55,
    heightRange: [0.16, 0.4] as const,
    /** Grass only where blades would actually resolve before blur takes over — near/mid ground only. */
    zNear: 9,
    zFar: -30,
    xHalf: 30,
    colorPalette: ['#63754a', '#748656', '#4f6039', '#8a9560', '#576a45'],
  },

  wildVegetation: {
    clumpCount: 650,
    leafletsPerClumpRange: [2, 5] as const,
    clumpRadius: 0.12,
    scaleRange: [0.08, 0.2] as const,
    zNear: 9,
    zFar: -26,
    xHalf: 28,
    colorPalette: ['#5a6a3c', '#707d49', '#48582f', '#818a55'],
  },

  fog: {
    color: '#cdbfae',
    density: 0.017,
  },

  horizon: {
    radius: 130,
    skyColor: '#e8ddd2',
    horizonColor: '#cdbfae',
    groundColor: '#8d7f68',
    horizonHeight: -1.5,
    spread: 60,
  },
}
