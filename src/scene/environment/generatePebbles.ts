import * as THREE from 'three'
import { jitterColor } from '../shared/colorJitter'
import type { MeadowLayoutConfig } from '../shared/meadowLayout'
import { createRng, range } from '../shared/random'
import { sampleTerrainHeight } from '../shared/terrainHeight'
import type { TerrainShapeConfig } from '../shared/terrainHeight'
import { ENVIRONMENT_CONFIG } from './config'
import { samplePathDepression, samplePathFactor } from './groundColor'

export interface PebbleGroup {
  geometry: THREE.BufferGeometry
  instances: { matrix: THREE.Matrix4; color: THREE.Color }[]
}

const UP = new THREE.Vector3(0, 1, 0)

/**
 * Small scattered rock/pebble instances concentrated on the worn path — the
 * one bit of physical grain a pure colour+depression treatment
 * (groundColor.ts/buildTerrainGeometry.ts) still can't produce on its own,
 * since a real dirt trail collects loose stone the surrounding grass
 * doesn't. `environmentSeed`/`meadowLayout`/`terrainShape` come from the
 * active render's generative seed, same contract as generateGrass.ts.
 */
export function generatePebbles(environmentSeed: number, meadowLayout: MeadowLayoutConfig, terrainShape: TerrainShapeConfig): PebbleGroup[] {
  const { count, variantCount, scaleRange, colors, zNear, zFar, xHalf } = ENVIRONMENT_CONFIG.pebbles
  const rng = createRng(environmentSeed + 3300)

  const groups: PebbleGroup[] = Array.from({ length: variantCount }, () => ({
    geometry: new THREE.DodecahedronGeometry(1, 0),
    instances: [],
  }))

  const matrix = new THREE.Matrix4()
  const maxAttempts = count * 12
  let placed = 0
  let attempts = 0

  while (placed < count && attempts < maxAttempts) {
    attempts++
    const x = range(rng, -xHalf, xHalf)
    const z = range(rng, zFar, zNear)

    // Concentrated where the path is genuinely worn (low path factor) —
    // scattered a little outside it too (real stone doesn't stop dead at
    // an edge), but mostly on the trail itself.
    const path = samplePathFactor(x, z, meadowLayout)
    if (rng() > Math.min(1, (1 - path) * 1.6 + 0.05)) continue

    const scale = range(rng, scaleRange[0], scaleRange[1])
    // Squashed, not a uniform scale on all axes — a perfectly regular
    // little dodecahedron reads as a game asset, a squashed/tilted one
    // reads as a stone.
    const scaleVec = new THREE.Vector3(scale * range(rng, 0.7, 1.3), scale * range(rng, 0.45, 0.85), scale * range(rng, 0.7, 1.3))
    const y = sampleTerrainHeight(x, z, terrainShape) - samplePathDepression(x, z, meadowLayout) + scaleVec.y * 0.25 // half-buried, not sitting on top

    const spin = range(rng, 0, Math.PI * 2)
    const quat = new THREE.Quaternion().setFromAxisAngle(UP, spin)
    quat.multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(range(rng, -0.3, 0.3), 0, range(rng, -0.3, 0.3))))

    matrix.makeRotationFromQuaternion(quat)
    matrix.scale(scaleVec)
    matrix.setPosition(x, y, z)

    const baseColor = new THREE.Color(colors[Math.floor(rng() * colors.length) % colors.length])
    const group = groups[Math.floor(rng() * groups.length) % groups.length]
    group.instances.push({ matrix: matrix.clone(), color: jitterColor(rng, baseColor, 0.12) })
    placed++
  }

  return groups
}
