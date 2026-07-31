import { fbm2D } from '../shared/noise'
import { ENVIRONMENT_CONFIG } from './config'

/** Layered noise height field — broad rolling undulation plus finer bumps on top. */
export function sampleTerrainHeight(x: number, z: number): number {
  const { seed, terrain } = ENVIRONMENT_CONFIG
  const { baseY, noiseFrequency, amplitude, detailNoiseFrequency, detailAmplitude } = terrain

  const broad = fbm2D(x * noiseFrequency, z * noiseFrequency, seed, { octaves: 4 })
  const detail = fbm2D(x * detailNoiseFrequency, z * detailNoiseFrequency, seed + 900, { octaves: 2 })

  return baseY + (broad - 0.5) * 2 * amplitude + (detail - 0.5) * 2 * detailAmplitude
}
