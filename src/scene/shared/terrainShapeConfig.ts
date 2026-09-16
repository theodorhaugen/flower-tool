import { useMemo } from 'react'
import type { TerrainShapeConfig } from './terrainHeight'

/**
 * The one terrain height field both the environment's ground mesh and the
 * flower field sample, so flowers actually sit on the ground they're
 * rendered on instead of floating at an independently-chosen height.
 *
 * A factory rather than a static constant: `seed` comes from the active
 * render's generative seed (see shared/generative.ts), so the terrain's
 * undulation changes from render to render along with everything else.
 * `baseY` and the noise frequencies/amplitudes stay fixed — they're what
 * keeps the ground at a plausible height and roughness regardless of seed.
 */
export function createTerrainShape(seed: number): TerrainShapeConfig {
  return {
    seed,
    baseY: -2.6,
    noiseFrequency: 0.022,
    // Both amplitudes raised (were 1.1/0.22) for more visibly rolling,
    // uneven ground — the previous values read as almost flat once seen
    // from the macro-lens camera height/angle this scene uses.
    amplitude: 1.7,
    detailNoiseFrequency: 0.13,
    detailAmplitude: 0.4,
  }
}

/** Memoized convenience for the several components (Terrain/Grass/WildVegetation/FlowerField) that all need the same seed's terrain shape. */
export function useTerrainShape(seed: number): TerrainShapeConfig {
  return useMemo(() => createTerrainShape(seed), [seed])
}
