import { fbm2D, noise1D } from './noise'

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value))
}

export interface MeadowPathConfig {
  frequency: number
  amplitudeFactor: number
  baseWidth: number
  widthVariance: number
  seedOffset: number
  minDensity: number
}

export interface MeadowNoiseConfig {
  clusterFrequency: number
  detailFrequency: number
  /** >1 sharpens the field into clearer clusters vs. gaps. */
  densityContrast: number
  /** Floor so gaps stay sparse rather than perfectly, artificially empty. */
  densityFloor: number
}

export interface MeadowLayoutConfig {
  seed: number
  noise: MeadowNoiseConfig
  paths: readonly MeadowPathConfig[]
}

/**
 * A meandering low-density corridor: its centerline and width both drift via
 * noise along z, so it reads as a trail winding through the meadow rather
 * than a straight mown strip. Returns 1 away from the path, dipping towards
 * `minDensity` at its center.
 */
function pathFactor(x: number, z: number, widthHalfAtZ: number, path: MeadowPathConfig, seed: number): number {
  const centerX = (noise1D(z * path.frequency, seed + path.seedOffset) - 0.5) * 2 * widthHalfAtZ * path.amplitudeFactor
  const width =
    path.baseWidth * (1 - path.widthVariance * 0.5 + path.widthVariance * noise1D(z * path.frequency * 1.7, seed + path.seedOffset + 50))
  const distance = Math.abs(x - centerX)
  const t = clamp01(distance / Math.max(width, 0.001))
  const eased = t * t * (3 - 2 * t)
  return path.minDensity + (1 - path.minDensity) * eased
}

/** Combined effect of every path at a position — 1 in the open meadow, low inside any path. */
export function sampleMeadowPathFactor(x: number, z: number, widthHalfAtZ: number, layout: MeadowLayoutConfig): number {
  let factor = 1
  for (const path of layout.paths) {
    factor *= pathFactor(x, z, widthHalfAtZ, path, layout.seed)
  }
  return clamp01(factor)
}

/**
 * The macro "where are the clusters" field in [0, 1] — a broad low-frequency
 * layer for where patches fall, a higher-frequency layer to texture them,
 * contrast-sharpened into clear clusters vs. clearings. Does not include
 * path carving (see `sampleMeadowPathFactor`) — exposed separately so the
 * environment can use it for ground colour (lush vs. sparse) independently
 * of where the paths cut through.
 */
export function sampleMeadowClusterField(x: number, z: number, layout: MeadowLayoutConfig): number {
  const { clusterFrequency, detailFrequency, densityContrast, densityFloor } = layout.noise

  const cluster = fbm2D(x * clusterFrequency, z * clusterFrequency, layout.seed + 1, { octaves: 3 })
  const detail = fbm2D(x * detailFrequency, z * detailFrequency, layout.seed + 2, { octaves: 2 })
  const base = clamp01(cluster * 0.65 + detail * 0.35)

  return densityFloor + (1 - densityFloor) * Math.pow(base, densityContrast)
}

/**
 * Meadow-like density in [0, 1] at a ground-plane position: the cluster
 * field carved by every path. This is what flower placement samples;
 * grass/ground use the cluster field and path factor separately so grass
 * stays dense in flower clearings and only thins on the paths themselves.
 */
export function sampleMeadowDensity(x: number, z: number, widthHalfAtZ: number, layout: MeadowLayoutConfig): number {
  const shaped = sampleMeadowClusterField(x, z, layout)
  const pathed = shaped * sampleMeadowPathFactor(x, z, widthHalfAtZ, layout)
  return clamp01(pathed)
}
