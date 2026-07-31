import * as THREE from 'three'
import type { Rng } from './random'
import { range } from './random'

export interface PetalArchetype {
  /** Higher = more pointed tip, lower = rounder. */
  tipSharpness: number
  /** Upward/backward cupping along the petal's length. */
  curl: number
  /** Twist gradient from base to tip. */
  twist: number
  /** Overall width relative to length. */
  widthScale: number
}

const WIDTH_SEGMENTS = 4
const HEIGHT_SEGMENTS = 6

/**
 * Builds one petal as a deformed plane grid: narrow at the base, tapered
 * towards the tip, cupped and twisted along its length, with small
 * per-vertex jitter baked in. Deliberately low-poly — under heavy defocus
 * the silhouette and shading read, not the mesh density.
 *
 * The base sits at local y = 0 (attaches to the flower center) and the tip
 * at local y = 1, so callers can orient/scale it purely via the growth axis.
 */
export function createPetalGeometry(rng: Rng, archetype: PetalArchetype): THREE.BufferGeometry {
  const geometry = new THREE.PlaneGeometry(1, 1, WIDTH_SEGMENTS, HEIGHT_SEGMENTS)
  const position = geometry.attributes.position as THREE.BufferAttribute

  for (let i = 0; i < position.count; i++) {
    const localX = position.getX(i)
    const yLocal = position.getY(i) + 0.5 // remap plane's -0.5..0.5 to 0 (base) .. 1 (tip)

    const taper = Math.pow(Math.sin(Math.PI * Math.min(yLocal, 1)), archetype.tipSharpness)
    const width = localX * taper * archetype.widthScale

    const twistAngle = archetype.twist * yLocal
    const cos = Math.cos(twistAngle)
    const sin = Math.sin(twistAngle)

    const curl = archetype.curl * Math.pow(yLocal, 1.4)
    const jitterX = range(rng, -0.012, 0.012) * (0.4 + yLocal)
    const jitterZ = range(rng, -0.018, 0.018) * yLocal

    const x = width * cos + jitterX
    const z = curl + width * sin * 0.4 + jitterZ

    position.setXYZ(i, x, yLocal, z)
  }

  geometry.computeVertexNormals()
  return geometry
}
