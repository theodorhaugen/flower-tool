import * as THREE from 'three'
import { frustumWidthHalfAt } from '../shared/frustum'
import { sampleMeadowClusterField, sampleMeadowPathFactor } from '../shared/meadowLayout'
import type { MeadowLayoutConfig } from '../shared/meadowLayout'
import { fbm2D } from '../shared/noise'
import { ENVIRONMENT_CONFIG } from './config'

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value))
}

/**
 * How lush (1) vs. bare/dry (0) a ground position is — mostly the shared
 * meadow cluster field (so it agrees with where the flowers are dense) with
 * a bit of the environment's own fine soil noise mixed in so the ground
 * doesn't read as a literal paint-by-numbers copy of the flower layout.
 * `meadowLayout` and `environmentSeed` both come from the active render's
 * generative seed (see shared/generative.ts).
 */
export function sampleGroundLushness(x: number, z: number, meadowLayout: MeadowLayoutConfig, environmentSeed: number): number {
  const cluster = sampleMeadowClusterField(x, z, meadowLayout)
  const soil = fbm2D(
    x * ENVIRONMENT_CONFIG.groundSoilNoiseFrequency,
    z * ENVIRONMENT_CONFIG.groundSoilNoiseFrequency,
    environmentSeed + 300,
    { octaves: 3 },
  )
  return clamp01(cluster * (1 - ENVIRONMENT_CONFIG.groundSoilWeight) + soil * ENVIRONMENT_CONFIG.groundSoilWeight)
}

/** 1 in the open meadow, dipping low along the same worn paths the flowers avoid. */
export function samplePathFactor(x: number, z: number, meadowLayout: MeadowLayoutConfig): number {
  return sampleMeadowPathFactor(x, z, frustumWidthHalfAt(z), meadowLayout)
}

export interface GroundColors {
  dry: string
  sparse: string
  lush: string
  shadow: string
}

/**
 * Builds a ground-colour sampler bound to one render's palette-derived
 * colours (see environment/paletteColors.ts) and generative seed/meadow
 * layout — a factory rather than a free function since all of these now
 * vary per render instead of being fixed config, so callers
 * (buildTerrainGeometry.ts) bind them once up front rather than passing
 * several extra args through every call.
 */
export function createGroundColorSampler(
  groundColors: GroundColors,
  meadowLayout: MeadowLayoutConfig,
  environmentSeed: number,
): (x: number, z: number) => THREE.Color {
  const dry = new THREE.Color(groundColors.dry)
  const sparse = new THREE.Color(groundColors.sparse)
  const lush = new THREE.Color(groundColors.lush)
  const shadow = new THREE.Color(groundColors.shadow)

  /** Ground colour at a position: a lush-vs-dry blend, subtle independent damp/shadow variation, pulled towards bare dirt on paths. */
  return function sampleGroundColor(x: number, z: number): THREE.Color {
    const lushness = sampleGroundLushness(x, z, meadowLayout, environmentSeed)
    const path = samplePathFactor(x, z, meadowLayout)

    const color = new THREE.Color()
    if (lushness < 0.5) {
      color.copy(dry).lerp(sparse, lushness / 0.5)
    } else {
      color.copy(sparse).lerp(lush, (lushness - 0.5) / 0.5)
    }

    const dampness = fbm2D(x * 0.16, z * 0.16, environmentSeed + 700, { octaves: 2 })
    color.lerp(shadow, Math.max(0, dampness - 0.6) * 0.4)

    color.lerp(dry, 1 - path)
    return color
  }
}
