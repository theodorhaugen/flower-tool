import type { TerrainShapeConfig } from './terrainHeight'

/**
 * The one terrain height field both the environment's ground mesh and the
 * flower field sample, so flowers actually sit on the ground they're
 * rendered on instead of floating at an independently-chosen height.
 */
export const TERRAIN_SHAPE: TerrainShapeConfig = {
  seed: 4242,
  baseY: -2.6,
  noiseFrequency: 0.022,
  amplitude: 1.1,
  detailNoiseFrequency: 0.11,
  detailAmplitude: 0.22,
}
