import * as THREE from 'three'
import type { Rng } from '../../shared/random'
import { range } from '../../shared/random'
import { jitterColor } from '../../shared/colorJitter'

interface HslColor {
  h: number
  s: number
  l: number
}

/**
 * Soft, desaturated editorial palette — nothing saturated/primary. Kept out
 * of near-white territory (lightness capped ~0.72) since thousands of
 * overlapping translucent layers add up towards white fast; without headroom
 * the whole field bleaches out under lighting + bloom.
 */
const PETAL_PALETTE: HslColor[] = [
  { h: 0.97, s: 0.62, l: 0.6 }, // blush pink
  { h: 0.91, s: 0.48, l: 0.65 }, // pale rose
  { h: 0.77, s: 0.46, l: 0.58 }, // soft lavender
  { h: 0.03, s: 0.58, l: 0.6 }, // peach / coral
  { h: 0.1, s: 0.4, l: 0.68 }, // ivory cream
  { h: 0.87, s: 0.4, l: 0.56 }, // muted mauve
]

const CENTER_PALETTE: HslColor[] = [
  { h: 0.12, s: 0.72, l: 0.63 },
  { h: 0.09, s: 0.68, l: 0.58 },
  { h: 0.14, s: 0.55, l: 0.7 },
]

function wrap01(value: number): number {
  return ((value % 1) + 1) % 1
}

function sampleFromPalette(
  rng: Rng,
  palette: readonly HslColor[],
  jitter: HslColor,
): THREE.Color {
  const base = palette[Math.floor(rng() * palette.length) % palette.length]
  const h = wrap01(base.h + range(rng, -jitter.h, jitter.h))
  const s = THREE.MathUtils.clamp(base.s + range(rng, -jitter.s, jitter.s), 0, 1)
  const l = THREE.MathUtils.clamp(base.l + range(rng, -jitter.l, jitter.l), 0, 1)
  return new THREE.Color().setHSL(h, s, l)
}

export function samplePetalBaseColor(rng: Rng): THREE.Color {
  return sampleFromPalette(rng, PETAL_PALETTE, { h: 0.02, s: 0.08, l: 0.06 })
}

export function sampleCenterColor(rng: Rng): THREE.Color {
  return sampleFromPalette(rng, CENTER_PALETTE, { h: 0.02, s: 0.1, l: 0.08 })
}

export { jitterColor }
