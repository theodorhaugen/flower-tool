import { MEADOW_DEPTH_FAR, MEADOW_DEPTH_NEAR } from '../../shared/frustum'
import type { PetalArchetype } from './petalGeometry'

export interface DepthBand {
  name: string
  /** z bounds, world units. zMin is the far (more negative) edge, zMax the near edge — zMin < zMax always. */
  zMin: number
  zMax: number
  /**
   * Flowers per unit of the band's on-screen ground area, relative to the
   * other bands — NOT a share of flowerCount. A near band covers far less
   * area than a far one at the same flower count, so a fixed fraction wildly
   * over-packs it; this instead keeps occupancy comparable across bands
   * (scaled by intent — sparse hero blooms up close, hazy texture far away)
   * regardless of how the perspective width/y-spread constants are tuned.
   */
  densityMultiplier: number
  scaleRange: readonly [number, number]
  petalCountRange: readonly [number, number]
  /** Multiplies the depth-based vertical spread — bigger for hazier/busier bands. */
  yJitterScale: number
}

function zAtDepthFraction(fraction: number): number {
  return MEADOW_DEPTH_NEAR + fraction * (MEADOW_DEPTH_FAR - MEADOW_DEPTH_NEAR)
}

/** Central tuning knobs — no GUI yet, but every future control should read from here. */
export const FLOWER_FIELD_CONFIG = {
  seed: 1337,
  flowerCount: 4600,
  variantsPerArchetype: 4,

  petalScaleJitterRange: [0.85, 1.2] as const,
  petalInsetRange: [0.05, 0.12] as const,
  cupAngleRange: [-0.35, 0.55] as const,
  petalDroopJitter: 0.14,
  maxFlowerTilt: 0.6,

  centerRadiusRange: [0.16, 0.26] as const,

  // The field spans the meadow depth (see shared/frustum.ts) in front of the
  // camera. Sampled positions are clamped against `minCameraDistance` so
  // nothing ends up on top of the lens.
  minCameraDistance: 5,
  yHalfBase: 1.8,
  yHalfPerDepth: 0.4,

  /**
   * Foreground/midground/background read: a few large near flowers, a busy
   * mid-body, and a much smaller/simpler haze of far ones — the depth cue a
   * macro shot relies on, and exactly what a future depth-of-field pass will
   * key off of.
   */
  depthBands: [
    {
      name: 'foreground',
      zMax: zAtDepthFraction(0),
      zMin: zAtDepthFraction(0.13),
      densityMultiplier: 0.22,
      scaleRange: [0.55, 1.05] as const,
      petalCountRange: [6, 13] as const,
      yJitterScale: 0.7,
    },
    {
      name: 'midground',
      zMax: zAtDepthFraction(0.13),
      zMin: zAtDepthFraction(0.55),
      densityMultiplier: 1,
      scaleRange: [0.3, 0.75] as const,
      petalCountRange: [5, 12] as const,
      yJitterScale: 1,
    },
    {
      name: 'background',
      zMax: zAtDepthFraction(0.55),
      zMin: zAtDepthFraction(1),
      densityMultiplier: 1.5,
      scaleRange: [0.12, 0.35] as const,
      petalCountRange: [4, 8] as const,
      yJitterScale: 1.35,
    },
  ] satisfies readonly DepthBand[],

  /** Rejection-sampling safety valve — see generateFlowerField.ts. */
  maxSampleAttemptsPerFlower: 40,
}

export const PETAL_ARCHETYPES: readonly PetalArchetype[] = [
  { tipSharpness: 0.75, curl: 0.3, twist: 0.1, widthScale: 0.68 }, // rounded
  { tipSharpness: 1.15, curl: 0.45, twist: 0.22, widthScale: 0.5 }, // elongated
]
