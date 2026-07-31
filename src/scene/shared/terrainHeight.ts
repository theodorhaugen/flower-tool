import { fbm2D } from './noise'

export interface TerrainShapeConfig {
  seed: number
  baseY: number
  /** Broad rolling undulation. */
  noiseFrequency: number
  amplitude: number
  /** Finer bumps layered on top. */
  detailNoiseFrequency: number
  detailAmplitude: number
}

/**
 * Layered-noise ground height at a world position. Shared so the flower
 * field can plant flowers at the same height as the terrain mesh underneath
 * them — otherwise the two systems independently agreeing to "roughly
 * y = 0" is what makes flowers look like they're floating.
 */
export function sampleTerrainHeight(x: number, z: number, shape: TerrainShapeConfig): number {
  const { seed, baseY, noiseFrequency, amplitude, detailNoiseFrequency, detailAmplitude } = shape

  const broad = fbm2D(x * noiseFrequency, z * noiseFrequency, seed, { octaves: 4 })
  const detail = fbm2D(x * detailNoiseFrequency, z * detailNoiseFrequency, seed + 900, { octaves: 2 })

  return baseY + (broad - 0.5) * 2 * amplitude + (detail - 0.5) * 2 * detailAmplitude
}
