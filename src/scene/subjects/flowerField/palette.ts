import * as THREE from 'three'
import { jitterColor } from '../../shared/colorJitter'
import type { ColorPalette } from '../../shared/palette'
import type { Rng } from '../../shared/random'
import { range } from '../../shared/random'

interface HslColor {
  h: number
  s: number
  l: number
}

/**
 * Lightness cap for every anchor derived below — thousands of overlapping
 * translucent petal layers add up towards white fast, so even a palette
 * whose `dominantHues` run pale (Mist, Summer Sky) needs headroom left
 * before bloom, or the whole field bleaches out.
 */
const MAX_PETAL_LIGHTNESS = 0.72

function toHsl(hex: string): HslColor {
  const hsl = { h: 0, s: 0, l: 0 }
  new THREE.Color(hex).getHSL(hsl)
  return hsl
}

function wrap01(value: number): number {
  return ((value % 1) + 1) % 1
}

function sampleFromPalette(rng: Rng, palette: readonly HslColor[], jitter: HslColor): THREE.Color {
  const base = palette[Math.floor(rng() * palette.length) % palette.length]
  const h = wrap01(base.h + range(rng, -jitter.h, jitter.h))
  const s = THREE.MathUtils.clamp(base.s + range(rng, -jitter.s, jitter.s), 0, 1)
  const l = THREE.MathUtils.clamp(base.l + range(rng, -jitter.l, jitter.l), 0, 1)
  return new THREE.Color().setHSL(h, s, l)
}

/** The palette's `dominantHues`, converted to HSL anchors and capped below bloom-bleach territory — this render's petal "family". */
function petalAnchors(palette: ColorPalette): HslColor[] {
  return palette.dominantHues.map((hex) => {
    const hsl = toHsl(hex)
    return { ...hsl, l: Math.min(hsl.l, MAX_PETAL_LIGHTNESS) }
  })
}

/**
 * Flower centres read as warm pollen/stamen regardless of petal colour on
 * a real flower, so these derive from `highlight` (the palette's "colour
 * of light" — already warm on Golden Hour/Autumn, paler on Mist/Lavender)
 * rather than `dominantHues`, with a little of the first dominant hue and
 * a little `shadow` mixed in for some depth instead of one flat tone.
 */
function centerAnchors(palette: ColorPalette): HslColor[] {
  const highlight = new THREE.Color(palette.highlight)
  const towardsHue = new THREE.Color(palette.dominantHues[0])
  const towardsShadow = new THREE.Color(palette.shadow)

  return [
    toHsl(`#${highlight.clone().lerp(new THREE.Color('#ffffff'), 0.1).getHexString()}`),
    toHsl(`#${highlight.clone().lerp(towardsHue, 0.3).getHexString()}`),
    toHsl(`#${highlight.clone().lerp(towardsShadow, 0.2).getHexString()}`),
  ]
}

export function samplePetalBaseColor(rng: Rng, palette: ColorPalette): THREE.Color {
  return sampleFromPalette(rng, petalAnchors(palette), { h: 0.02, s: 0.08, l: 0.06 })
}

export function sampleCenterColor(rng: Rng, palette: ColorPalette): THREE.Color {
  return sampleFromPalette(rng, centerAnchors(palette), { h: 0.02, s: 0.1, l: 0.08 })
}

export { jitterColor }
