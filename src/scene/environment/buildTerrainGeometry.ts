import * as THREE from 'three'
import { ENVIRONMENT_CONFIG } from './config'
import { sampleTerrainHeight } from './terrainHeight'

/**
 * A displaced, vertex-coloured ground grid built directly in world space
 * (rather than a rotated+offset PlaneGeometry) so `sampleTerrainHeight`/
 * `sampleGroundColor` — which key off world x/z to stay aligned with the
 * flower field's meadow layout — need no extra transform bookkeeping.
 * `sampleGroundColor` is passed in (from groundColor.ts's
 * `createGroundColorSampler`, bound to the active render's palette-derived
 * ground colours) rather than imported directly, since those colours vary
 * per render now instead of being fixed config.
 */
export function buildTerrainGeometry(sampleGroundColor: (x: number, z: number) => THREE.Color): THREE.BufferGeometry {
  const { width, depth, widthSegments, depthSegments, centerX, centerZ } = ENVIRONMENT_CONFIG.terrain
  const cols = widthSegments + 1
  const rows = depthSegments + 1

  const positions = new Float32Array(cols * rows * 3)
  const colors = new Float32Array(cols * rows * 3)

  let i = 0
  for (let r = 0; r < rows; r++) {
    const worldZ = centerZ + (r / depthSegments - 0.5) * depth
    for (let c = 0; c < cols; c++) {
      const worldX = centerX + (c / widthSegments - 0.5) * width
      const worldY = sampleTerrainHeight(worldX, worldZ)
      const color = sampleGroundColor(worldX, worldZ)

      positions[i * 3] = worldX
      positions[i * 3 + 1] = worldY
      positions[i * 3 + 2] = worldZ
      colors[i * 3] = color.r
      colors[i * 3 + 1] = color.g
      colors[i * 3 + 2] = color.b
      i++
    }
  }

  const indices: number[] = []
  for (let r = 0; r < depthSegments; r++) {
    for (let c = 0; c < widthSegments; c++) {
      const a = r * cols + c
      const b = a + 1
      const rowBelow = a + cols
      const d = rowBelow + 1
      indices.push(a, rowBelow, b, b, rowBelow, d)
    }
  }

  const geometry = new THREE.BufferGeometry()
  geometry.setIndex(indices)
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  geometry.computeVertexNormals()
  return geometry
}
