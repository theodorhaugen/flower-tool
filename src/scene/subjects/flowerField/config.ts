import type { PetalArchetype } from './petalGeometry'

/** Central tuning knobs — no GUI yet, but every future control should read from here. */
export const FLOWER_FIELD_CONFIG = {
  seed: 1337,
  flowerCount: 4200,
  clusterCount: 90,
  /** Fraction of flowers scattered independently of any cluster, filling the gaps between patches. */
  ambientFraction: 0.25,
  variantsPerArchetype: 4,

  petalCountRange: [5, 13] as const,
  flowerScaleRange: [0.22, 0.85] as const,
  petalScaleJitterRange: [0.85, 1.2] as const,
  petalInsetRange: [0.05, 0.12] as const,
  cupAngleRange: [-0.35, 0.55] as const,
  petalDroopJitter: 0.14,
  maxFlowerTilt: 0.6,

  centerRadiusRange: [0.16, 0.26] as const,

  // Camera sits at [0, 0, 6] looking towards -z; the field spans in front of it.
  // `depthNear` is a target, not a hard bound — cluster/flower jitter is clamped
  // against `minCameraDistance` so nothing ends up on top of (or behind) the lens.
  depthNear: 0,
  depthFar: -70,
  minCameraDistance: 5,
  yHalfBase: 1.8,
  yHalfPerDepth: 0.4,
  widthHalfBase: 1.8,
  widthHalfPerDepth: 0.55,

  clusterRadiusRange: [2.5, 6.5] as const,
}

export const PETAL_ARCHETYPES: readonly PetalArchetype[] = [
  { tipSharpness: 0.75, curl: 0.3, twist: 0.1, widthScale: 0.68 }, // rounded
  { tipSharpness: 1.15, curl: 0.45, twist: 0.22, widthScale: 0.5 }, // elongated
]
