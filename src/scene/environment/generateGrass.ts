import * as THREE from 'three'
import { jitterColor } from '../shared/colorJitter'
import { sampleMeadowClusterField } from '../shared/meadowLayout'
import type { MeadowLayoutConfig } from '../shared/meadowLayout'
import { createRng, range } from '../shared/random'
import { createTaperedBladeGeometry } from '../shared/taperedBlade'
import { sampleTerrainHeight } from '../shared/terrainHeight'
import type { TerrainShapeConfig } from '../shared/terrainHeight'
import { ENVIRONMENT_CONFIG } from './config'
import { samplePathDepression, samplePathFactor } from './groundColor'

export interface GrassGroup {
  geometry: THREE.BufferGeometry
  instances: { matrix: THREE.Matrix4; color: THREE.Color }[]
}

const UP = new THREE.Vector3(0, 1, 0)

export interface GenerateGrassOptions {
  /** Leva's Grass > Density — multiplies ENVIRONMENT_CONFIG.grass.count. 1 = as tuned. */
  densityMultiplier?: number
  /** Leva's Grass > Height — multiplies heightRange's bounds. 1 = as tuned. */
  heightMultiplier?: number
  /** Leva's Grass > Width — multiplies each blade's width independently of height, at the instance level (the geometry's own widthScale stays fixed). 1 = as tuned. */
  widthMultiplier?: number
}

/**
 * Dense grass, grown only where blades would actually resolve before blur
 * takes over (near/mid ground) and thinned along the same worn path the
 * flowers avoid — otherwise as uniformly dense as a real meadow floor.
 * `colorPalette`, `environmentSeed`, `meadowLayout`, and `terrainShape` all
 * come from the active render's generative seed (see shared/generative.ts)
 * rather than fixed config, so grass colour/placement/height stay cohesive
 * with the rest of the scene instead of being independently fixed. `options`
 * from the same state's Leva-controlled creative overrides.
 */
export function generateGrass(
  colorPalette: readonly string[],
  environmentSeed: number,
  meadowLayout: MeadowLayoutConfig,
  terrainShape: TerrainShapeConfig,
  { densityMultiplier = 1, heightMultiplier = 1, widthMultiplier = 1 }: GenerateGrassOptions = {},
): GrassGroup[] {
  const { count: baseCount, variantCount, widthScale, heightRange, zNear, zFar, xHalf } = ENVIRONMENT_CONFIG.grass
  const count = Math.round(baseCount * densityMultiplier)
  const rng = createRng(environmentSeed + 1000)

  const groups: GrassGroup[] = Array.from({ length: variantCount }, () => ({
    geometry: createTaperedBladeGeometry(rng, {
      tipSharpness: range(rng, 1.0, 1.7),
      curl: range(rng, 0.15, 0.45),
      twist: range(rng, 0, 0.1),
      widthScale,
      widthSegments: 1,
      heightSegments: 3,
      // Lower than the 0.7 used elsewhere — on a blade this skinny (see
      // config.ts's widthScale) that much per-vertex jitter reads as a
      // choppy, faceted edge rather than a clean taper.
      jitterAmount: 0.4,
      // Stronger/taller than the shared default (0.3/0.4) — every blade's
      // base otherwise met the terrain at exactly the same brightness the
      // rest of the blade has, which is what made a dense stand of grass
      // read as separate cutouts stood up on the ground rather than
      // something actually rooted in it. A deeper, taller contact-shadow
      // gradient is the cheap stand-in for the real thatch/self-shadowing a
      // dense grass base would have.
      aoStrength: 0.5,
      aoFalloffHeight: 0.55,
    }),
    instances: [],
  }))

  const matrix = new THREE.Matrix4()
  const maxAttempts = count * 6
  let placed = 0
  let attempts = 0

  while (placed < count && attempts < maxAttempts) {
    attempts++
    const x = range(rng, -xHalf, xHalf)
    const z = range(rng, zFar, zNear)

    // Thinned on the path as before, but also leaning denser in the same
    // clusters the flowers favour (sampleMeadowClusterField) instead of
    // being uniformly random everywhere except the path — otherwise flower
    // clusters and grass thickness never visually correlate, so the two
    // don't read as one ecosystem. The 0.55 floor keeps clearings from
    // going bald; this is "denser here", not "only here".
    const clusterFactor = sampleMeadowClusterField(x, z, meadowLayout)
    const acceptance = samplePathFactor(x, z, meadowLayout) * (0.55 + 0.45 * clusterFactor)
    if (rng() > acceptance) continue

    // Every blade's base used to sit at exactly the sampled terrain height —
    // a perfectly flat, uniform contact line that (combined with the AO
    // gradient being the only base-darkening cue) still read as blades
    // stood up *on* the ground rather than growing *out of* it. Sinking
    // each base a little into the terrain, by a different random amount,
    // breaks that razor-edge seam into something closer to how real grass
    // roots disappear into uneven thatch.
    const y = sampleTerrainHeight(x, z, terrainShape) - samplePathDepression(x, z, meadowLayout) - range(rng, 0, 0.05)
    const height = range(rng, heightRange[0], heightRange[1]) * heightMultiplier
    const spin = range(rng, 0, Math.PI * 2)
    const lean = range(rng, -0.22, 0.22)
    const leanAxis = new THREE.Vector3(Math.cos(spin + Math.PI / 2), 0, Math.sin(spin + Math.PI / 2))

    const quat = new THREE.Quaternion().setFromAxisAngle(UP, spin)
    quat.multiply(new THREE.Quaternion().setFromAxisAngle(leanAxis, lean))

    matrix.makeRotationFromQuaternion(quat)
    matrix.scale(new THREE.Vector3(height * widthMultiplier, height, height * widthMultiplier))
    matrix.setPosition(x, y, z)

    const baseColor = new THREE.Color(colorPalette[Math.floor(rng() * colorPalette.length) % colorPalette.length])
    const group = groups[Math.floor(rng() * groups.length) % groups.length]
    group.instances.push({ matrix: matrix.clone(), color: jitterColor(rng, baseColor, 0.1) })
    placed++
  }

  return groups
}
