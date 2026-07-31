import * as THREE from 'three'
import { jitterColor } from '../shared/colorJitter'
import { createRng, range } from '../shared/random'
import { createTaperedBladeGeometry } from '../shared/taperedBlade'
import { ENVIRONMENT_CONFIG } from './config'
import { samplePathFactor } from './groundColor'
import { sampleTerrainHeight } from './terrainHeight'

export interface GrassGroup {
  geometry: THREE.BufferGeometry
  instances: { matrix: THREE.Matrix4; color: THREE.Color }[]
}

const UP = new THREE.Vector3(0, 1, 0)

/**
 * Dense grass, grown only where blades would actually resolve before blur
 * takes over (near/mid ground) and thinned along the same worn path the
 * flowers avoid — otherwise as uniformly dense as a real meadow floor.
 * `colorPalette` comes from the active render's palette (see
 * paletteColors.ts) rather than fixed config, so grass colour stays
 * cohesive with the rest of the scene.
 */
export function generateGrass(colorPalette: readonly string[]): GrassGroup[] {
  const { count, variantCount, widthScale, heightRange, zNear, zFar, xHalf } = ENVIRONMENT_CONFIG.grass
  const rng = createRng(ENVIRONMENT_CONFIG.seed + 1000)

  const groups: GrassGroup[] = Array.from({ length: variantCount }, () => ({
    geometry: createTaperedBladeGeometry(rng, {
      tipSharpness: range(rng, 1.0, 1.7),
      curl: range(rng, 0.15, 0.45),
      twist: range(rng, 0, 0.1),
      widthScale,
      widthSegments: 1,
      heightSegments: 3,
      jitterAmount: 0.7,
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

    if (rng() > samplePathFactor(x, z)) continue // thinned on the path, otherwise kept

    const y = sampleTerrainHeight(x, z)
    const height = range(rng, heightRange[0], heightRange[1])
    const spin = range(rng, 0, Math.PI * 2)
    const lean = range(rng, -0.22, 0.22)
    const leanAxis = new THREE.Vector3(Math.cos(spin + Math.PI / 2), 0, Math.sin(spin + Math.PI / 2))

    const quat = new THREE.Quaternion().setFromAxisAngle(UP, spin)
    quat.multiply(new THREE.Quaternion().setFromAxisAngle(leanAxis, lean))

    matrix.makeRotationFromQuaternion(quat)
    matrix.scale(new THREE.Vector3(height, height, height))
    matrix.setPosition(x, y, z)

    const baseColor = new THREE.Color(colorPalette[Math.floor(rng() * colorPalette.length) % colorPalette.length])
    const group = groups[Math.floor(rng() * groups.length) % groups.length]
    group.instances.push({ matrix: matrix.clone(), color: jitterColor(rng, baseColor, 0.1) })
    placed++
  }

  return groups
}
