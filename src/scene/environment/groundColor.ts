import * as THREE from 'three'
import { frustumWidthHalfAt } from '../shared/frustum'
import { sampleMeadowClusterField, sampleMeadowPathFactor } from '../shared/meadowLayout'
import type { MeadowLayoutConfig } from '../shared/meadowLayout'
import { fbm2D, worley2D } from '../shared/noise'
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

/**
 * A real worn trail is a compacted, slightly lower channel, not just a
 * different colour painted over flat ground — without this the path was a
 * pure colour/density decal with the terrain mesh underneath completely
 * unaware it existed. Depth is feathered by the same `samplePathFactor` the
 * colour/grass-thinning already use, so the dip's edge lines up with where
 * the dirt colour and thinned grass actually are instead of introducing a
 * second, independent boundary.
 */
const PATH_DEPRESSION_DEPTH = 0.16

export function samplePathDepression(x: number, z: number, meadowLayout: MeadowLayoutConfig): number {
  return (1 - samplePathFactor(x, z, meadowLayout)) * PATH_DEPRESSION_DEPTH
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

  /**
   * Ground colour at a position: a sparse-vs-lush *green* blend, subtle
   * independent damp/shadow variation, a coarser mottled "patch" variation
   * for more tonal levels, and — only right on the worn path — a pull
   * towards bare dirt.
   *
   * `dry` used to be the low end of the lushness blend too, not just the
   * path colour — so any merely-sparse (not actually-a-path) patch of
   * ground read as bare tan dirt, while the grass instances scattered
   * across that same ground (Grass.tsx places by path factor alone, not
   * lushness) stayed green regardless. That mismatch is what made grass
   * look like it was floating over the wrong-coloured ground beneath it.
   * Keeping the lushness blend entirely within the green family and
   * reserving `dry` for the path term below (which is already how paths
   * get their own grass thinned out, via the same `path` factor) is what
   * actually fixes that — bare dirt now only shows up where there
   * genuinely isn't grass to begin with.
   */
  return function sampleGroundColor(x: number, z: number): THREE.Color {
    const lushness = sampleGroundLushness(x, z, meadowLayout, environmentSeed)
    const path = samplePathFactor(x, z, meadowLayout)

    const color = new THREE.Color().copy(sparse).lerp(lush, lushness)

    const dampness = fbm2D(x * 0.16, z * 0.16, environmentSeed + 700, { octaves: 2 })
    color.lerp(shadow, Math.max(0, dampness - 0.6) * 0.4)

    // Coarser than the dampness term above and on its own frequency/seed so
    // it reads as independent mottled patches — sun-bleached/mossy blotches
    // — rather than a second copy of the same variation. This is the extra
    // "level" of uneven colouring layered on top of the lushness gradient.
    const patch = fbm2D(x * 0.045, z * 0.045, environmentSeed + 1500, { octaves: 2 })
    color.lerp(shadow, Math.max(0, 0.35 - patch) * 0.5)
    color.lerp(lush, Math.max(0, patch - 0.65) * 0.6)

    // Worley/cellular rather than another fbm layer — every noise term
    // above is the same smooth value-noise lattice just reseeded, which is
    // exactly why the ground reads as one repeating "corduroy" undulation
    // no matter how many of them get stacked. Cellular distance fields have
    // actual hard edges between cells, giving dirt-clump/pebble-scale
    // mottling a genuinely different character instead of one more soft
    // blob at yet another frequency.
    const clump = worley2D(x * 0.6, z * 0.6, environmentSeed + 2200)
    color.lerp(dry, Math.max(0, 0.22 - clump) * 0.35)

    color.lerp(dry, 1 - path)
    return color
  }
}
