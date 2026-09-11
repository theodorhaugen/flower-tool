import * as THREE from 'three'
import type { Rng } from './random'
import { range } from './random'

function wrap01(value: number): number {
  return ((value % 1) + 1) % 1
}

/** Small per-instance nudge away from a base HSL color, so no two instances match exactly. */
export function jitterColor(rng: Rng, base: THREE.Color, amount: number): THREE.Color {
  const hsl = { h: 0, s: 0, l: 0 }
  base.getHSL(hsl)
  return new THREE.Color().setHSL(
    wrap01(hsl.h + range(rng, -amount, amount)),
    THREE.MathUtils.clamp(hsl.s + range(rng, -amount * 0.6, amount * 0.6), 0, 1),
    THREE.MathUtils.clamp(hsl.l + range(rng, -amount * 0.8, amount * 0.8), 0, 1),
  )
}
