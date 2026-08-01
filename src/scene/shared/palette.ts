import * as THREE from 'three'

/**
 * A named, cohesive colour family for one whole render — the single source
 * every colourful thing in the scene (flowers, grass/vegetation, sky/haze,
 * lighting, bloom) draws from, instead of each system inventing its own
 * hardcoded hex values independently. That's what "cohesive" actually
 * means here: swap the palette and the *entire* image's mood changes
 * together, because everything is derived from the same semantic roles
 * rather than unrelated tuning knobs that happen to look okay side by side.
 *
 * Which palette a render belongs to is picked in shared/generative.ts, as
 * one of many things derived from that render's single generative seed —
 * this file only defines what a palette *is* and the registry to pick
 * from. Every field is a single hex anchor, not a literal "paint this
 * exact colour" instruction — every consumer mixes these anchors into lit,
 * per-instance-jittered PBR materials (see subjects/flowerField/materials.ts,
 * environment/paletteColors.ts) rather than applying them as flat colour, so
 * the palette sets the *mood* while lighting/shading still does the actual
 * rendering work.
 *
 * - `background`/`backgroundSecondary`: the sky/horizon/fog gradient — sky
 *   top and the horizon/fog/ground-haze blend respectively (see
 *   environment/paletteColors.ts, Horizon.tsx, Fog.tsx, AtmosphericHaze.tsx).
 * - `glow`: the colour of light itself — sunlit grass tips, the key light,
 *   flower translucency glow, and the literal colour of the post-processing
 *   bloom (see lighting/SceneLighting.tsx, subjects/flowerField/materials.ts,
 *   effects/PaletteGradePass.ts).
 * - `foliagePrimary`/`foliageSecondary`: the meadow's own greenery — grass,
 *   wild vegetation, and (mixed with `glow`'s opposite, doing double duty as
 *   "the colour of shadow") ground-bounce/fill-light tint (see
 *   environment/paletteColors.ts, lighting/SceneLighting.tsx).
 * - `petalPrimary`/`petalSecondary`/`petalTertiary`: the flower "family"
 *   this render draws from — petal colours are sampled from these three
 *   anchors (see subjects/flowerField/palette.ts).
 * - `core`: flower centre/stamen colour anchor.
 * - `accent`: a small, sparing highlight for detail elements — mixed into
 *   the flower centres' pollen warmth here, but the natural home for any
 *   future tiny-detail colour (dust, veining).
 * - `stem`: stem/branch colour family, kept distinct from `foliagePrimary`/
 *   `foliageSecondary` so stems can read as their own thing rather than
 *   simply reusing the grass palette.
 */
export interface ColorPalette {
  name: string
  background: string
  backgroundSecondary: string
  glow: string
  foliagePrimary: string
  foliageSecondary: string
  petalPrimary: string
  petalSecondary: string
  petalTertiary: string
  core: string
  accent: string
  stem: string
}

export const PALETTES: readonly ColorPalette[] = [
  {
    name: 'Golden hour meadow',
    background: '#E9EEC7',
    backgroundSecondary: '#D8E2B8',
    glow: '#F5C93A',
    foliagePrimary: '#24392B',
    foliageSecondary: '#3B5747',
    petalPrimary: '#6B7FB0',
    petalSecondary: '#8C9BC4',
    petalTertiary: '#F08A1E',
    core: '#F5C93A',
    accent: '#FBEFA0',
    stem: '#1E2E22',
  },
  {
    name: 'Emerald dahlia',
    background: '#12503D',
    backgroundSecondary: '#0C3A2C',
    glow: '#E8A85C',
    foliagePrimary: '#0C3A2C',
    foliageSecondary: '#1A5A45',
    petalPrimary: '#F4CBD6',
    petalSecondary: '#E88CA3',
    petalTertiary: '#D45C7C',
    core: '#E8A85C',
    accent: '#F9E3B5',
    stem: '#2B2015',
  },
  {
    name: 'Monarch sky',
    background: '#5FA8D3',
    backgroundSecondary: '#8FC4E0',
    glow: '#F4A83D',
    foliagePrimary: '#1D2E1A',
    foliageSecondary: '#2E4429',
    petalPrimary: '#E8811E',
    petalSecondary: '#F4A83D',
    petalTertiary: '#F5D9CF',
    core: '#2B1B0E',
    accent: '#F5D9CF',
    stem: '#2B1B0E',
  },
  {
    name: 'Sunlit pastel',
    background: '#F5ECE1',
    backgroundSecondary: '#BFDCD2',
    glow: '#FBF6EE',
    foliagePrimary: '#BFDCD2',
    foliageSecondary: '#9FC3B8',
    petalPrimary: '#F3C23C',
    petalSecondary: '#E8752B',
    petalTertiary: '#D8503F',
    core: '#E8752B',
    accent: '#FBF6EE',
    stem: '#C7896E',
  },
  {
    name: 'Twilight garden',
    background: '#142819',
    backgroundSecondary: '#1E3A22',
    glow: '#D9B95C',
    foliagePrimary: '#3C5A38',
    foliageSecondary: '#274627',
    petalPrimary: '#7C93D6',
    petalSecondary: '#EAF0E8',
    petalTertiary: '#D98A7A',
    core: '#D9B95C',
    accent: '#D98A7A',
    stem: '#274627',
  },
]

/** Exact-name lookup, used by shared/generative.ts to let a `?palette=` override win over the seed-picked one. */
export function findPaletteByName(name: string): ColorPalette | undefined {
  return PALETTES.find((p) => p.name === name)
}

const HUE_SHIFTED_FIELDS = [
  'background',
  'backgroundSecondary',
  'glow',
  'foliagePrimary',
  'foliageSecondary',
  'petalPrimary',
  'petalSecondary',
  'petalTertiary',
  'core',
  'accent',
  'stem',
] as const

/**
 * Rotates every colour in a palette by the same hue amount and returns a
 * new palette — used by the Leva panel's Colour > Hue Shift control
 * (shared/GenerativeProvider.tsx) so a designer can nudge a whole render's
 * mood along the colour wheel without breaking the palette's internal
 * relationships (every role shifts together, so they stay as cohesive as
 * the original).
 */
export function shiftPaletteHue(palette: ColorPalette, degrees: number): ColorPalette {
  if (degrees === 0) return palette

  const shiftHex = (hex: string): string => {
    const color = new THREE.Color(hex)
    const hsl = { h: 0, s: 0, l: 0 }
    color.getHSL(hsl)
    const h = ((hsl.h + degrees / 360) % 1 + 1) % 1
    return `#${color.setHSL(h, hsl.s, hsl.l).getHexString()}`
  }

  const shifted = { ...palette }
  for (const field of HUE_SHIFTED_FIELDS) {
    shifted[field] = shiftHex(palette[field])
  }
  return shifted
}
