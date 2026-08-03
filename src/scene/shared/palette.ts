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
 *   effects/PaletteGradePass.ts). Since it tints the scene's actual light
 *   colour (SceneLighting.tsx mixes it straight into the key/fill lights),
 *   it needs real lightness/saturation regardless of how dark-and-moody the
 *   rest of a palette runs — a `glow` that's too dim or too pale dims or
 *   flattens the whole render's *real* illumination, not just its own
 *   swatch. Every palette below sources it from whichever of its own roles
 *   is both bright and colourful enough for that job (usually `core`, since
 *   that role tends to be the photo's own warmest/most saturated mid-tone —
 *   see each palette's own comments for exceptions).
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
    backgroundSecondary: '#4E6B44',
    glow: '#F6D460',
    foliagePrimary: '#24392B',
    foliageSecondary: '#415C3C',
    petalPrimary: '#6B7FB0',
    petalSecondary: '#F08A1E',
    petalTertiary: '#AE8467',
    core: '#F5C93A',
    accent: '#FBEFA0',
    stem: '#1E2E22',
    deepShade: '#0A140F',
    paleLight: '#FCFBF0',
  },
  {
    name: 'Emerald dahlia',
    background: '#12503D',
    backgroundSecondary: '#1F6E52',
    glow: '#ECB77F',
    foliagePrimary: '#0C3A2C',
    foliageSecondary: '#195E47',
    petalPrimary: '#F4CBD6',
    petalSecondary: '#E88CA3',
    petalTertiary: '#EEACBC',
    core: '#E8A85C',
    accent: '#D45C7C',
    stem: '#2B2015',
    deepShade: '#051F17',
    paleLight: '#FDF8F5',
  },
  {
    name: 'Monarch sky',
    background: '#2E6DA4',
    // `glow` reads `groundAccent` here rather than `core` (this palette's
    // usual glow source, see the registry-wide note below) — `core` is
    // deliberately dark on this one palette (the monarch's near-black wing
    // marking, not a light colour), so the sky-blue groundAccent stands in
    // as this theme's actual "colour of light" instead.
    backgroundSecondary: '#285774',
    glow: '#8FC4E0',
    foliagePrimary: '#1D2E1A',
    foliageSecondary: '#203B36',
    petalPrimary: '#E8811E',
    petalSecondary: '#F4A83D',
    petalTertiary: '#EE942E',
    core: '#2B1B0E',
    accent: '#F5D9CF',
    stem: '#162519',
    deepShade: '#060F16',
    paleLight: '#F7FAFC',
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
    backgroundSecondary: '#102114',
    // Nudged off `core` (`#D9B95C`) towards `paleLight` — this palette has
    // no dedicated `highlight` stop to blend in the way the registry-wide
    // note below describes, so falling straight back to `core` would leave
    // `glow` an exact duplicate of it.
    glow: '#DFC578',
    foliagePrimary: '#3C5A38',
    foliageSecondary: '#344F31',
    petalPrimary: '#7C93D6',
    petalSecondary: '#EAF0E8',
    petalTertiary: '#B3C2DF',
    core: '#D9B95C',
    accent: '#D98A7A',
    stem: '#274627',
    deepShade: '#081209',
    paleLight: '#F8FBF7',
  },
  {
    name: 'Minted bloom',
    background: '#6FA695',
    backgroundSecondary: '#F5ECE1',
    glow: '#F3B656',
    foliagePrimary: '#2E5548',
    foliageSecondary: '#B9BFB3',
    petalPrimary: '#F3C23C',
    petalSecondary: '#E8752B',
    petalTertiary: '#EE9C34',
    core: '#F2A93D',
    accent: '#D8503F',
    stem: '#4A7A68',
    deepShade: '#0A1F19',
    paleLight: '#FBF6EE',
  },
  // The 5 palettes below are derived from photographic tonal ramps (source
  // photos' actual extracted stops, darkest to lightest) rather than
  // hand-picked anchors like the 5 above — `deepShade`/`paleLight` are
  // direct copies of each ramp's own deepShadow/specular stops (that's
  // exactly what those two roles are for), and every other role is mapped
  // from whichever ramp stop reads as that role in the source photo, nudged
  // slightly off any stop already used for a different role so no two
  // roles within one palette collide on the exact same hex — same
  // discipline the original 5 needed fixing for earlier.
  {
    name: 'Nocturne teal',
    background: '#123328',
    // backgroundSecondary/foliagePrimary/stem nudged up from the raw ramp's
    // deepShadow/shadow stops — those stops stacked on every large-area role
    // at once rendered as a near-black frame (measured: ~7/255 mean
    // brightness vs 20-50/255 for this tool's other palettes), since unlike
    // the source photo this renderer has no bright large-area anchor (sky,
    // wide highlight) to offset them. Still the darkest of the palettes —
    // just no longer darker than the scene's own lighting can make legible.
    backgroundSecondary: '#0C221B',
    // glow/petalPrimary/petalTertiary raised in lightness too — glow tints
    // the key/fill lights (SceneLighting.tsx), so a dim glow dims the whole
    // scene's actual illumination, not just its own swatch, and the raw
    // ramp's petal stops were too close in lightness to the background to
    // read as a "pop" the way the other palettes' brighter petal families
    // do against their own dark backgrounds (compare Emerald dahlia).
    glow: '#72B8A4',
    foliagePrimary: '#144033',
    foliageSecondary: '#227A63',
    petalPrimary: '#5BA894',
    petalSecondary: '#B9CDC6',
    petalTertiary: '#50A08B',
    core: '#C99A5B',
    accent: '#D3DFDB',
    stem: '#0F2D24',
    deepShade: '#050D0A',
    paleLight: '#F2F6F4',
  },
  {
    name: 'Daisy meadow',
    background: '#EAE1B8',
    backgroundSecondary: '#95A457',
    glow: '#F2B705',
    foliagePrimary: '#2B3D14',
    foliageSecondary: '#708A2E',
    petalPrimary: '#F3EFD8',
    petalSecondary: '#F1BD20',
    petalTertiary: '#EECC5E',
    core: '#CA9F08',
    accent: '#F4C840',
    stem: '#223210',
    deepShade: '#0E1808',
    paleLight: '#FBFAF3',
  },
  {
    name: 'Grass and sky',
    background: '#DEEDF5',
    backgroundSecondary: '#BEDCEC',
    glow: '#7CB238',
    foliagePrimary: '#223311',
    foliageSecondary: '#4A701F',
    petalPrimary: '#DBECF4',
    petalSecondary: '#E3F0F6',
    petalTertiary: '#40611B',
    core: '#B8A945',
    accent: '#CDE4F0',
    stem: '#1B2A0E',
    deepShade: '#0C1606',
    paleLight: '#EFF6FA',
  },
  // Lily pond was originally one of the tonal-ramp palettes above, but got
  // superseded by a fuller-range revision of its own source photo (same
  // mapping approach as the registry's original 6 — see their own comments)
  // that fixed clustered midtone contrast the ramp version had. Left in
  // this position rather than moved, since the array's order has no
  // functional meaning (lookup is by name — see findPaletteByName below).
  {
    name: 'Lily pond',
    background: '#2F5F58',
    backgroundSecondary: '#F0CE9C',
    glow: '#F8D36E',
    foliagePrimary: '#1D3F39',
    foliageSecondary: '#B1A37E',
    petalPrimary: '#E8558F',
    petalSecondary: '#E8631C',
    petalTertiary: '#E85C56',
    core: '#F7C948',
    accent: '#F2A061',
    stem: '#193631',
    deepShade: '#0F211D',
    paleLight: '#FEFAF0',
  },
  {
    name: 'Marigold haze',
    background: '#6FAEDD',
    backgroundSecondary: '#F5D89A',
    glow: '#F2A31A',
    foliagePrimary: '#6E3E0C',
    foliageSecondary: '#C77712',
    petalPrimary: '#F3AE34',
    petalSecondary: '#B56C11',
    petalTertiary: '#F8E3B5',
    core: '#92550E',
    accent: '#84B9DE',
    stem: '#5A320A',
    deepShade: '#2C1704',
    paleLight: '#FDF7E6',
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
