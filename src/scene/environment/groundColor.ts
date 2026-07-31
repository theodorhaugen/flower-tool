import * as THREE from 'three'
import { frustumWidthHalfAt } from '../shared/frustum'
import { sampleMeadowClusterField, sampleMeadowPathFactor } from '../shared/meadowLayout'
import { MEADOW_LAYOUT } from '../shared/meadowLayoutConfig'
import { fbm2D } from '../shared/noise'
import { ENVIRONMENT_CONFIG } from './config'

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value))
}

const dry = new THREE.Color(ENVIRONMENT_CONFIG.groundColors.dry)
const sparse = new THREE.Color(ENVIRONMENT_CONFIG.groundColors.sparse)
const lush = new THREE.Color(ENVIRONMENT_CONFIG.groundColors.lush)
const shadow = new THREE.Color(ENVIRONMENT_CONFIG.groundColors.shadow)

/**
 * How lush (1) vs. bare/dry (0) a ground position is — mostly the shared
 * meadow cluster field (so it agrees with where the flowers are dense) with
 * a bit of the environment's own fine soil noise mixed in so the ground
 * doesn't read as a literal paint-by-numbers copy of the flower layout.
 */
export function sampleGroundLushness(x: number, z: number): number {
  const cluster = sampleMeadowClusterField(x, z, MEADOW_LAYOUT)
  const soil = fbm2D(
    x * ENVIRONMENT_CONFIG.groundSoilNoiseFrequency,
    z * ENVIRONMENT_CONFIG.groundSoilNoiseFrequency,
    ENVIRONMENT_CONFIG.seed + 300,
    { octaves: 3 },
  )
  return clamp01(cluster * (1 - ENVIRONMENT_CONFIG.groundSoilWeight) + soil * ENVIRONMENT_CONFIG.groundSoilWeight)
}

/** 1 in the open meadow, dipping low along the same worn paths the flowers avoid. */
export function samplePathFactor(x: number, z: number): number {
  return sampleMeadowPathFactor(x, z, frustumWidthHalfAt(z), MEADOW_LAYOUT)
}

/** Ground colour at a position: a lush-vs-dry blend, subtle independent damp/shadow variation, pulled towards bare dirt on paths. */
export function sampleGroundColor(x: number, z: number): THREE.Color {
  const lushness = sampleGroundLushness(x, z)
  const path = samplePathFactor(x, z)

  const color = new THREE.Color()
  if (lushness < 0.5) {
    color.copy(dry).lerp(sparse, lushness / 0.5)
  } else {
    color.copy(sparse).lerp(lush, (lushness - 0.5) / 0.5)
  }

  const dampness = fbm2D(x * 0.16, z * 0.16, ENVIRONMENT_CONFIG.seed + 700, { octaves: 2 })
  color.lerp(shadow, Math.max(0, dampness - 0.6) * 0.4)

  color.lerp(dry, 1 - path)
  return color
}
