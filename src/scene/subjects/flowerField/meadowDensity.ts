import { FLOWER_FIELD_CONFIG } from './config'
import { fbm2D, noise1D } from './noise'

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value))
}

interface PathConfig {
  frequency: number
  amplitudeFactor: number
  baseWidth: number
  widthVariance: number
  seedOffset: number
  minDensity: number
}

/**
 * A meandering low-density corridor: its centerline and width both drift via
 * noise along z, so it reads as a trail winding through the meadow rather
 * than a straight mown strip.
 */
function pathFactor(x: number, z: number, widthHalfAtZ: number, path: PathConfig, seed: number): number {
  const centerX = (noise1D(z * path.frequency, seed + path.seedOffset) - 0.5) * 2 * widthHalfAtZ * path.amplitudeFactor
  const width =
    path.baseWidth * (1 - path.widthVariance * 0.5 + path.widthVariance * noise1D(z * path.frequency * 1.7, seed + path.seedOffset + 50))
  const distance = Math.abs(x - centerX)
  const t = clamp01(distance / Math.max(width, 0.001))
  const eased = t * t * (3 - 2 * t)
  return path.minDensity + (1 - path.minDensity) * eased
}

/**
 * Meadow-like density in [0, 1] at a ground-plane position: a broad
 * low-frequency field decides where the clusters and clearings are, a
 * higher-frequency field breaks up the clusters with texture, contrast
 * sharpens both into clear patches vs. gaps, and one or more paths carve
 * winding low-density corridors through the result.
 */
export function sampleMeadowDensity(x: number, z: number, widthHalfAtZ: number, seed: number): number {
  const { clusterFrequency, detailFrequency, densityContrast, densityFloor } = FLOWER_FIELD_CONFIG.noise

  const cluster = fbm2D(x * clusterFrequency, z * clusterFrequency, seed + 1, { octaves: 3 })
  const detail = fbm2D(x * detailFrequency, z * detailFrequency, seed + 2, { octaves: 2 })
  const base = clamp01(cluster * 0.65 + detail * 0.35)
  const shaped = densityFloor + (1 - densityFloor) * Math.pow(base, densityContrast)

  let density = shaped
  for (const path of FLOWER_FIELD_CONFIG.paths) {
    density *= pathFactor(x, z, widthHalfAtZ, path, seed)
  }

  return clamp01(density)
}
