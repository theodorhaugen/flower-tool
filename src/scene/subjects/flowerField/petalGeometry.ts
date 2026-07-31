import type * as THREE from 'three'
import type { Rng } from '../../shared/random'
import { createTaperedBladeGeometry } from '../../shared/taperedBlade'

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

/**
 * A petal is a tapered blade with richer segmentation than grass/vegetation
 * get — petals are the visual subject, so they can afford it.
 */
export function createPetalGeometry(rng: Rng, archetype: PetalArchetype): THREE.BufferGeometry {
  return createTaperedBladeGeometry(rng, { ...archetype, widthSegments: 4, heightSegments: 6 })
}
