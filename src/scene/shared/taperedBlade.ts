import * as THREE from 'three'
import type { Rng } from './random'
import { range } from './random'

export interface BladeColorGradient {
  /** Vertex-color multiplier at the base (local y = 0). */
  innerColor: THREE.Color
  /** Vertex-color multiplier at the tip (local y = 1). */
  outerColor: THREE.Color
  /** Randomizes where the gradient sits per-vertex so the transition reads as a soft bleed, not a clean printed line. */
  jitter?: number
}

export interface TaperedBladeParams {
  /** Higher = more pointed tip, lower = rounder. */
  tipSharpness: number
  /** Upward/backward cupping along the blade's length. */
  curl: number
  /** Twist gradient from base to tip. */
  twist: number
  /** Overall width relative to length. */
  widthScale: number
  /** Grid resolution — kept low by every caller; blur hides mesh density, not shading. */
  widthSegments?: number
  heightSegments?: number
  /** Scales the baked-in per-vertex jitter; 0 disables it for a perfectly clean taper. */
  jitterAmount?: number
  /** Optional base-to-tip vertex-color gradient — omitted entirely (no `color` attribute) when not set. */
  colorGradient?: BladeColorGradient
}

/**
 * Deforms a plane grid into a tapered, cupped, twisted blade: narrow at the
 * base, shaped towards the tip, with small per-vertex jitter baked in so no
 * two calls produce identical geometry. Used for flower petals, grass
 * blades, and low-vegetation leaves alike — only the params and segment
 * counts differ.
 *
 * The base sits at local y = 0 (the attachment point) and the tip at local
 * y = 1, so callers can orient/scale purely via the growth axis.
 */
export function createTaperedBladeGeometry(rng: Rng, params: TaperedBladeParams): THREE.BufferGeometry {
  const { tipSharpness, curl, twist, widthScale, widthSegments = 4, heightSegments = 6, jitterAmount = 1, colorGradient } = params

  const geometry = new THREE.PlaneGeometry(1, 1, widthSegments, heightSegments)
  const position = geometry.attributes.position as THREE.BufferAttribute

  for (let i = 0; i < position.count; i++) {
    const localX = position.getX(i)
    const yLocal = position.getY(i) + 0.5 // remap plane's -0.5..0.5 to 0 (base) .. 1 (tip)

    const taper = Math.pow(Math.sin(Math.PI * Math.min(yLocal, 1)), tipSharpness)
    const width = localX * taper * widthScale

    const twistAngle = twist * yLocal
    const cos = Math.cos(twistAngle)
    const sin = Math.sin(twistAngle)

    const bend = curl * Math.pow(yLocal, 1.4)
    const jitterX = range(rng, -0.012, 0.012) * (0.4 + yLocal) * jitterAmount
    const jitterZ = range(rng, -0.018, 0.018) * yLocal * jitterAmount

    const x = width * cos + jitterX
    const z = bend + width * sin * 0.4 + jitterZ

    position.setXYZ(i, x, yLocal, z)
  }

  geometry.computeVertexNormals()

  if (colorGradient) {
    const { innerColor, outerColor, jitter = 0 } = colorGradient
    const colors = new Float32Array(position.count * 3)
    const color = new THREE.Color()

    for (let i = 0; i < position.count; i++) {
      const yLocal = position.getY(i) // recovers the same 0 (base)..1 (tip) value written above
      const t = Math.min(1, Math.max(0, yLocal + range(rng, -jitter, jitter)))
      color.copy(innerColor).lerp(outerColor, t)
      colors[i * 3] = color.r
      colors[i * 3 + 1] = color.g
      colors[i * 3 + 2] = color.b
    }

    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  }

  return geometry
}
