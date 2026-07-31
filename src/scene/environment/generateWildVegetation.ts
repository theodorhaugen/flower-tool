import * as THREE from 'three'
import { jitterColor } from '../shared/colorJitter'
import { createRng, intRange, range } from '../shared/random'
import { createTaperedBladeGeometry } from '../shared/taperedBlade'
import { ENVIRONMENT_CONFIG } from './config'
import { samplePathFactor } from './groundColor'
import { sampleTerrainHeight } from './terrainHeight'
import type { GrassGroup } from './generateGrass'

const UP = new THREE.Vector3(0, 1, 0)
const VARIANT_COUNT = 4

/**
 * Small sparse weed/leaf clumps — a handful of tiny leaflets fanning out
 * from a shared point — scattered between the grass to break up its
 * uniformity without introducing anything as visually loud as a flower.
 */
export function generateWildVegetation(): GrassGroup[] {
  const { clumpCount, leafletsPerClumpRange, clumpRadius, scaleRange, zNear, zFar, xHalf, colorPalette } =
    ENVIRONMENT_CONFIG.wildVegetation
  const rng = createRng(ENVIRONMENT_CONFIG.seed + 2000)

  const groups: GrassGroup[] = Array.from({ length: VARIANT_COUNT }, () => ({
    geometry: createTaperedBladeGeometry(rng, {
      tipSharpness: range(rng, 0.6, 1.0),
      curl: range(rng, 0.1, 0.35),
      twist: range(rng, 0, 0.2),
      widthScale: range(rng, 0.7, 1.0),
      widthSegments: 2,
      heightSegments: 3,
      jitterAmount: 1.3,
    }),
    instances: [],
  }))

  const matrix = new THREE.Matrix4()
  const maxAttempts = clumpCount * 8
  let clumpsPlaced = 0
  let attempts = 0

  while (clumpsPlaced < clumpCount && attempts < maxAttempts) {
    attempts++
    const cx = range(rng, -xHalf, xHalf)
    const cz = range(rng, zFar, zNear)
    if (rng() > samplePathFactor(cx, cz)) continue

    const leafletCount = intRange(rng, leafletsPerClumpRange[0], leafletsPerClumpRange[1])
    const baseColor = new THREE.Color(colorPalette[Math.floor(rng() * colorPalette.length) % colorPalette.length])

    for (let l = 0; l < leafletCount; l++) {
      const angle = range(rng, 0, Math.PI * 2)
      const radial = range(rng, 0, clumpRadius)
      const x = cx + Math.cos(angle) * radial
      const z = cz + Math.sin(angle) * radial
      const y = sampleTerrainHeight(x, z)

      const scale = range(rng, scaleRange[0], scaleRange[1])
      const outwardTilt = range(rng, 0.15, 0.55)
      const spin = angle + range(rng, -0.3, 0.3)
      const leanAxis = new THREE.Vector3(Math.cos(spin + Math.PI / 2), 0, Math.sin(spin + Math.PI / 2))

      const quat = new THREE.Quaternion().setFromAxisAngle(UP, spin)
      quat.multiply(new THREE.Quaternion().setFromAxisAngle(leanAxis, outwardTilt))

      matrix.makeRotationFromQuaternion(quat)
      matrix.scale(new THREE.Vector3(scale, scale, scale))
      matrix.setPosition(x, y, z)

      const group = groups[Math.floor(rng() * groups.length) % groups.length]
      group.instances.push({ matrix: matrix.clone(), color: jitterColor(rng, baseColor, 0.08) })
    }

    clumpsPlaced++
  }

  return groups
}
