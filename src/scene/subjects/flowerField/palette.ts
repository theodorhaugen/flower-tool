import * as THREE from 'three'
import { jitterColor } from '../../shared/colorJitter'
import type { ColorPalette } from '../../shared/palette'
import { foliageShadowTint } from '../../shared/palette'
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
 * whose petal anchors run pale (Sunlit pastel) needs headroom left before
 * bloom, or the whole field bleaches out.
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

/**
 * California-poppy orange (hue ≈ 27°) — deliberately independent of the
 * active palette, and rolled *before* falling back to it, so this specific
 * warm accent shows up fairly often across every mood/palette rather than
 * only when a palette happens to include something orange. Real meadows
 * do this too: a poppy or two shows up in a field that's otherwise mostly
 * some other colour, not always matching the "official" dominant hue.
 */
const POPPY_ANCHOR: HslColor = { h: 27 / 360, s: 0.62, l: 0.56 }

/**
 * The palette's `petalPrimary`/`petalSecondary`/`petalTertiary`, converted
 * to HSL anchors and capped below bloom-bleach territory — this render's
 * petal "family". `deepShade`/`paleLight` are folded in too, each listed
 * once against the family's three anchors listed twice — every palette's
 * three petal anchors cluster in the middle of the lightness range (rarely
 * spanning past roughly 0.5-0.7) with no genuinely dark or near-white
 * option at all, so without this the field could never actually produce a
 * near-black or near-white bloom regardless of `sampleFromPalette`'s
 * jitter. Weighted 2:2:2:1:1 rather than flat 1:1:1:1:1 so the two extremes
 * stay a genuine minority presence (25% combined) — real variety, not a
 * shift away from the palette's own defining "family" colours.
 */
function petalAnchors(palette: ColorPalette): HslColor[] {
  const family = [palette.petalPrimary, palette.petalSecondary, palette.petalTertiary].flatMap((hex) => [hex, hex])
  const extremes = [palette.deepShade, palette.paleLight]
  return [...family, ...extremes].map((hex) => {
    const hsl = toHsl(hex)
    return { ...hsl, l: Math.min(hsl.l, MAX_PETAL_LIGHTNESS) }
  })
}

/**
 * Flower centres are rooted in the palette's own `core` anchor, warmed
 * towards `glow` (the palette's "colour of light" — already warm on most
 * palettes, paler on Sunlit pastel) and deepened towards a lightness-capped
 * `foliagePrimary` (see shared/palette.ts's `foliageShadowTint`) for some
 * shadow depth, instead of one flat tone.
 */
function centerAnchors(palette: ColorPalette): HslColor[] {
  const core = new THREE.Color(palette.core)
  const towardsGlow = new THREE.Color(palette.glow)
  const towardsShadow = new THREE.Color(foliageShadowTint(palette))

  return [
    toHsl(`#${core.clone().lerp(new THREE.Color('#ffffff'), 0.1).getHexString()}`),
    toHsl(`#${core.clone().lerp(towardsGlow, 0.3).getHexString()}`),
    toHsl(`#${core.clone().lerp(towardsShadow, 0.2).getHexString()}`),
  ]
}

/**
 * Rolled once per flower and shared between colour *and* archetype choice
 * (generateFlowerField.ts picks `POPPY_ARCHETYPE_INDEX` when this is true) —
 * a real poppy's colour and its few-huge-rounded-petals shape aren't
 * independent, so the two rolls can't be either. `poppyAccentProbability`
 * comes from the active render's generative state (Leva's Flowers > Poppy
 * Accent, see shared/GenerativeProvider.tsx) — defaults to 0.15 (roughly 1
 * in 7 flowers), "often" without taking over the field or drowning out the
 * active palette's own petal anchors.
 */
export function rollIsPoppy(rng: Rng, poppyAccentProbability: number): boolean {
  return rng() < poppyAccentProbability
}

export function samplePoppyColor(rng: Rng): THREE.Color {
  return sampleFromPalette(rng, [POPPY_ANCHOR], { h: 0.015, s: 0.1, l: 0.08 })
}

export function samplePetalBaseColor(rng: Rng, palette: ColorPalette): THREE.Color {
  return sampleFromPalette(rng, petalAnchors(palette), { h: 0.02, s: 0.08, l: 0.06 })
}

/**
 * Wider jitter than every other per-instance colour sample in the project
 * (contrast `jitterColor`'s ±0.05-0.1 elsewhere) — deliberately so: with a
 * single shared material's `emissiveIntensity` fixed, this lightness spread
 * is what actually lets some centers cross the highlight-bloom pass's
 * threshold while others don't, instead of every flower's center blooming
 * into an identical glowing dot regardless of colour.
 */
export function sampleCenterColor(rng: Rng, palette: ColorPalette): THREE.Color {
  return sampleFromPalette(rng, centerAnchors(palette), { h: 0.03, s: 0.16, l: 0.18 })
}

export { jitterColor }
