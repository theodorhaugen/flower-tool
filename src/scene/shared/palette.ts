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
 *   wild vegetation, and (lightness-capped via `foliageShadowTint` below,
 *   doing double duty as "the colour of shadow") ground-bounce/fill-light
 *   tint (see environment/paletteColors.ts, lighting/SceneLighting.tsx).
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
 * - `deepShade`/`paleLight`: dedicated dark and near-white anchors, each
 *   tinted to the palette's own hue family rather than flat black/white —
 *   every existing role clusters in the middle of the lightness range
 *   (petalPrimary/Secondary/Tertiary rarely span past roughly 0.5-0.7
 *   lightness; `foliagePrimary` is dark on most palettes but is the light
 *   mint `Sunlit pastel` needs `foliageShadowTint` to use as shadow at all;
 *   `glow` is colourful-and-light, not genuinely near-white, on every
 *   palette but `Sunlit pastel`). Without a real anchor at each extreme,
 *   nothing in a render — petal colour variety, the post-process two-point
 *   grade's shadow/highlight tint (effects/PaletteGrade.tsx) — can actually
 *   reach a wide lightness range regardless of how strongly those consumers
 *   push towards "dark"/"light". These fill that gap directly.
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
  deepShade: string
  paleLight: string
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
    core: '#E8B62E',
    accent: '#FBEFA0',
    stem: '#1E2E22',
    deepShade: '#19140B',
    paleLight: '#F7F5EE',
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
    core: '#DC9450',
    accent: '#F9E3B5',
    stem: '#2B2015',
    deepShade: '#1D130C',
    paleLight: '#F7EEF0',
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
    stem: '#231508',
    deepShade: '#160F08',
    paleLight: '#F2F6F8',
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
    core: '#DC6B22',
    accent: '#FBF6EE',
    stem: '#C7896E',
    deepShade: '#2B1E12',
    paleLight: '#F5F9F8',
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
    core: '#CDAE50',
    accent: '#D98A7A',
    stem: '#1F3A20',
    deepShade: '#0A150D',
    paleLight: '#F8F6F2',
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
  'deepShade',
  'paleLight',
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

/** Lightness ceiling for `foliageShadowTint` below — see that function's docstring. */
const MAX_SHADOW_TINT_LIGHTNESS = 0.32

/**
 * `foliagePrimary`, darkened if needed so it's guaranteed usable as a
 * shading/shadow tint regardless of how light the active palette's own
 * `foliagePrimary` happens to be. Every palette's `foliagePrimary` is meant
 * to double as "the colour of shadow" (see the class docstring above), which
 * assumes it's dark — true for most of the registry, but `Sunlit pastel`'s
 * is a deliberately light mint (`#BFDCD2`, matching its "soft dreamy
 * bokeh" mood as a foliage/background tone). Using that raw value anywhere
 * shading is computed from it would invert the effect it's meant to
 * produce — e.g. environment/paletteColors.ts's shaded ground reading
 * *lighter* than lit ground, or PaletteGradePass's shadow lift actually
 * lifting true black towards a pale colour instead of darkening it. This
 * caps lightness the same way flowerField/palette.ts's `MAX_PETAL_LIGHTNESS`
 * caps petal anchors — the palette's raw hex is still what everything else
 * (grass/vegetation tinting, where lightness doesn't matter) reads.
 */
export function foliageShadowTint(palette: ColorPalette): string {
  const color = new THREE.Color(palette.foliagePrimary)
  const hsl = { h: 0, s: 0, l: 0 }
  color.getHSL(hsl)
  if (hsl.l <= MAX_SHADOW_TINT_LIGHTNESS) return palette.foliagePrimary
  return `#${color.setHSL(hsl.h, hsl.s, MAX_SHADOW_TINT_LIGHTNESS).getHexString()}`
}
