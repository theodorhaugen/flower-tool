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
 *
 * The 5 palettes below `Sunlit pastel` are designed role-first rather than
 * matched against a reference photo: each one starts from a short plain-
 * language brief (what the ground/grass should feel like, what colour the
 * flowers lead with) and every hex is picked for the specific job its role
 * actually does downstream (see `deriveEnvironmentColors`,
 * flowerField/palette.ts, materials.ts) rather than for how it looks as an
 * isolated swatch — `background` is picked knowing it dominates the visible
 * *ground* far more than the sky, `glow` knowing it has to stay genuinely
 * bright/colourful because it's the actual key-light tint, and so on. That
 * sidesteps the mismatch hand-picking hex against a photo kept running
 * into: this renderer's lighting multiply + grade/bloom/haze pipeline sits
 * between a palette's raw hex and the final pixel, so a hex chosen to *look
 * like* the target on its own rarely survives that pipeline unchanged.
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
    name: 'Poppy petal',
    // Ground/grass lean warm green rather than neutral — `background` is
    // what actually dominates the visible bare-ground patches (see
    // `deriveEnvironmentColors`'s `dry`, weighted 70% towards it), so this
    // needs to read as warm ground on its own, not just as a sky tint. Its
    // remaining 30% is `BASE_DIRT` (environment/paletteColors.ts's fixed
    // warm-brown soil anchor) — that's what supplies "faint brown details
    // across" the ground without needing a dedicated role for it.
    background: '#D9CBA3',
    backgroundSecondary: '#B9D6E0',
    // Warm gold sunlight — bright and saturated on purpose (this tints the
    // actual key light, see the class docstring's `glow` note), which is
    // also what lets the poppy orange below bloom convincingly instead of
    // just sitting there as flat colour.
    glow: '#F6C568',
    foliagePrimary: '#4A5A28',
    foliageSecondary: '#7C8C4A',
    // All three petal anchors and `core` stay in one tight orange family —
    // value/chroma varies (bright/mid/deep), hue doesn't. That's the actual
    // mechanism behind "orange leads with clear contrast": a petal family
    // spread across three different hues reads as *variety*, not a single
    // dominant colour punching through a green field the way the brief
    // wants.
    petalPrimary: '#E8541A',
    petalSecondary: '#F27C1E',
    petalTertiary: '#C93F14',
    core: '#D9430F',
    // Leans orange rather than a neutral gold — this blends into the
    // flower centres' pollen warmth (materials.ts), so keeping it in-family
    // reinforces the centre reading as the same stark orange as the
    // petals, not a separate yellow dot.
    accent: '#F2831A',
    stem: '#4F4522',
    // Tinted to the petal family's own orange rather than a neutral
    // dark/cream — this is also the two-point grade's global shadow/
    // highlight tint (effects/PaletteGrade.tsx), and the petal sampling's
    // near-black/near-white extremes (flowerField/palette.ts's
    // `petalAnchors`), so a neutral choice here would put a stray
    // grey-green or plain cream flower into an otherwise orange-led field.
    deepShade: '#33150A',
    paleLight: '#FBE4C4',
  },
  {
    name: 'Daisies',
    // Cooler-leaning than Poppy petal's ground on purpose — a calm, slightly
    // overcast-feeling green rather than a sunbaked one.
    background: '#D7E0D2',
    backgroundSecondary: '#C7D9DE',
    // Grass gets its "bright yellow accent" for free from this: every
    // grass-blade swatch in `deriveEnvironmentColors` mixes a little
    // `glow` into an otherwise-green base, so a vivid yellow `glow` shows
    // up as scattered warm flecks across mostly-green grass rather than
    // needing a colour role of its own.
    glow: '#F2C230',
    foliagePrimary: '#3C5240',
    foliageSecondary: '#6B8A5C',
    // Crisp white/cream, not flat identical hex — enough spread for the
    // per-instance jitter (flowerField/palette.ts) to still read as
    // texture rather than a single flat white cutout.
    petalPrimary: '#F7F6EE',
    petalSecondary: '#FBFAF3',
    petalTertiary: '#F2F0E4',
    // Strong yellow centre — shares its hue with `glow` above so the
    // centre-anchor blend towards `glow` (flowerField/palette.ts's
    // `centerAnchors`) deepens/enriches the same yellow instead of pulling
    // it towards an unrelated colour.
    core: '#E8A800',
    accent: '#F5D24A',
    stem: '#2E4023',
    // Deliberately near-neutral, not hue-tinted like the other new
    // palettes' `deepShade` — this is also the petal family's near-black
    // extreme (flowerField/palette.ts's `petalAnchors`, folded into petal
    // sampling at real weight), and the petals here are meant to be *only*
    // white — a saturated brown here would put a visibly off-hue flower
    // into an otherwise all-white field. Low enough saturation to read as
    // "white in deep shadow," not a competing colour.
    deepShade: '#171512',
    paleLight: '#FCFBF6',
  },
  {
    name: 'Potpourri',
    // Ground/grass copied from Daisies exactly — same field, deliberately
    // diverse flowers planted in it.
    background: '#D7E0D2',
    backgroundSecondary: '#C7D9DE',
    glow: '#F2C230',
    foliagePrimary: '#3C5240',
    foliageSecondary: '#6B8A5C',
    // Bright yellow, hot pink, crisp white — three genuinely different
    // hues rather than one family's value range, so the sampled field
    // actually reads as a mixed bouquet instead of one dominant colour with
    // stray accents. Yellow pushed to max saturation (was already fairly
    // saturated, still reported as reading muted) — same fix as
    // `petalSecondary`'s magenta below, just less severe since yellow
    // survives the warm-light multiply far better than magenta does.
    petalPrimary: '#FFCB0F',
    // Pushed to near-maximum saturation — measured directly that a more
    // moderate magenta lost roughly half its saturation by the time it hit
    // the screen (checked pixel-for-pixel against the raw sampled colour).
    // The warm yellow `glow` above is what does it: lighting is a multiply
    // against albedo, and yellow light has almost no blue component to
    // multiply against, so anything on the blue/magenta side of the wheel
    // gets its blue channel crushed towards red/orange — a punchier magenta
    // going in is what survives as an actually-visible hot pink coming out.
    petalSecondary: '#FF1492',
    petalTertiary: '#F7F5EC',
    // A warm gold-orange centre reads as believable pollen against all
    // three petal hues at once, where a colour pulled from any single one
    // of them would clash with the other two.
    core: '#EFA51C',
    accent: '#F2D24A',
    stem: '#2E4023',
    // Warm neutral rather than the ground's cool green — with three
    // different petal hues there's no single family to tint towards, so
    // this stays close to black with just enough warmth to sit comfortably
    // behind yellow/pink/white rather than reading as a leftover green.
    deepShade: '#1C130F',
    paleLight: '#FCFBF6',
  },
  {
    name: 'Baby Blue Eyes',
    // Revised from an earlier "mix of cool/warm green" ground towards a
    // consistently cold, almost-teal one instead — that's the specific
    // correction this got. `background` (dominates the visible bare-ground
    // patches — see `deriveEnvironmentColors`'s `dry`) and both greenery
    // roles all lean the same cold blue-green direction now rather than
    // splitting warm/cool between them.
    background: '#BDD1CF',
    backgroundSecondary: '#BFE0EC',
    // Warm cream sunlight — deliberately warm despite the cool flowers/
    // ground, the complementary warm-light/cool-everything-else contrast is
    // what makes the blue actually pop rather than just sitting there as
    // another cool tone.
    glow: '#F5E7B8',
    foliagePrimary: '#194341',
    foliageSecondary: '#2B6464',
    // Pushed to near-maximum saturation, then pushed again after measuring
    // the actual rendered pixels: the key light's colour (`glow`) is a
    // multiply against albedo, and even this warm cream has nowhere near as
    // much blue as these petals do, so the blue channel loses proportionally
    // more than red/green do — same effect as Potpourri's `petalSecondary`
    // above, just milder here since this `glow` at least has *some* blue
    // (unlike Potpourri's pure yellow one). Confirmed directly: the previous
    // value's peak on-screen saturation was roughly half its source value.
    petalPrimary: '#1FADFF',
    petalSecondary: '#007FE0',
    petalTertiary: '#74D0FB',
    // Stark white centre.
    core: '#F7F8F5',
    // A small warm-gold fleck in the centres' pollen warmth — real pale
    // flowers still show a warm throat/pollen note even with a white face.
    accent: '#F0C168',
    stem: '#1E4846',
    deepShade: '#0E1A18',
    // Light blue rather than near-white — this is also the petal family's
    // near-white extreme (flowerField/palette.ts's `petalAnchors`, folded
    // into petal sampling at real weight), and every petal here is meant to
    // be blue, full stop; a nearly-white `paleLight` was exactly what put a
    // stray white bloom into an all-blue field (on top of the poppy-accent
    // one, see `poppyAccentProbability` above). `core` stays the actual
    // stark white — that's the flower *centre*, a different role.
    paleLight: '#B8D9EA',
  },
  {
    name: 'Lupine',
    // Ground and grass both lean into the "waterlike light blue" the brief
    // asks for — this is the same mechanism a light, off-green
    // foliagePrimary/Secondary already needed elsewhere in this registry
    // (see Baby Blue Eyes above): `deriveEnvironmentColors` weights
    // foliagePrimary/Secondary heavily enough into the grass/vegetation mix
    // that a blue anchor reads as blue grass rather than getting pulled
    // back to green by the mix's own fixed green base.
    background: '#B9D9E8',
    backgroundSecondary: '#8FC3DE',
    foliagePrimary: '#6FA8C4',
    foliageSecondary: '#4E8FAE',
    // Warm gold sunlight glinting off a blue field — and shares its hue
    // with the petals below, so bloom/glow around a flower and the flower's
    // own colour read as one warm-on-blue idea rather than two unrelated
    // colours.
    glow: '#F5D77A',
    // Maxed to 100% source saturation, all three anchors kept in the same
    // narrow yellow hue band (only value/lightness varies) — "bright bright
    // yellow, and only yellow" was explicit, so there's no room here for
    // the family to drift towards gold/orange the way a wider hue spread
    // would read as variety instead of one dominant colour.
    petalPrimary: '#FFD11A',
    petalSecondary: '#F5B800',
    petalTertiary: '#FFE45C',
    // Same maxed-saturation treatment as the petals — a softer gold centre
    // would read as a second, less-saturated colour against them.
    core: '#FFC300',
    accent: '#F5D24A',
    // Blue-green rather than plain garden-green — ties the stems into the
    // water theme instead of reading as a mismatched normal plant.
    stem: '#3E6B5E',
    // Dark gold-brown, tinted to the yellow petal family — not the ground's
    // blue, same reasoning as Daisies'/Poppy petal's own `deepShade` above.
    // Pushed more saturated than a plain neutral dark/pale would be, same
    // "only yellow" reasoning as the petals themselves — these two are the
    // petal family's near-black/near-white extremes too (flowerField/
    // palette.ts's `petalAnchors`), so a washed-out version of either would
    // put an off-family flower into the field the same way it would if
    // petalPrimary/Secondary/Tertiary themselves were muted. Lightness
    // floor raised (was near-black, l≈0.1) — verified directly that yellow
    // that dark reads as plain brown to the eye regardless of hue, putting
    // "off-colour" flowers back into an otherwise "only yellow" field just
    // through shading rather than through an actual wrong hue.
    deepShade: '#6B5106',
    paleLight: '#F9ECB8',
  },
  {
    name: 'Greenhouse bloom',
    // Matched directly against a reference render rather than a plain-
    // language brief — a warm, high-key still life: deep green up top, a
    // blown-out warm-white highlight through the middle, saturated yellow
    // and red blooms, one cool blue breaking the warmth as its own real
    // colour rather than a background tint, small muted brown-grey flecks.
    // Every anchor nudged a little lighter than the reference's own
    // measured tone (as asked) — consistent with every other palette in
    // this registry, a hex picked to *match* a reference on its own tends
    // to render dimmer than intended once the lighting-multiply/grade/haze
    // pipeline is done with it (see the class docstring above).
    // Cooled towards the same blue family as `petalTertiary`, not the
    // warm cream this started with — `background` is 70% of the actual
    // visible dry-ground patches (`deriveEnvironmentColors`'s `dry`), so a
    // warm value here reads as a genuinely *hot* ground, not just a warm
    // mood. Ties the ground into the palette's one cool note rather than
    // leaving it only on the petals, without pushing it fully blue —
    // desaturated enough to still read as a plausible pale dirt/stone
    // surface, not literally blue-tinted ground.
    background: '#CBD3D8',
    // Stays warm — unlike `background` above, this drives the horizon/fog
    // atmosphere actually visible in a tight macro framing (see
    // `deriveEnvironmentColors`), not the ground: a saturated blue here
    // dominated the whole visible backdrop instead of staying the small
    // accent it is in the reference (see the petal-colour fix's own
    // commit). Cooling the ground didn't need to touch this.
    backgroundSecondary: '#EAD9BC',
    // Warm peachy light — bright and colourful on purpose, same as every
    // other palette's `glow` (the class docstring's note on why this role
    // specifically can't just be a pale neutral).
    glow: '#F0C9A0',
    foliagePrimary: '#26432E',
    foliageSecondary: '#5C7A46',
    // Re-read against the reference a second time: the dominant bloom
    // colours are actually a *saturated* yellow and red, not the muted
    // coral/terracotta this started with, and the cool blue note is a real
    // third petal colour, not just a background/accent detail — corrected
    // on both counts below. Blue needed pushing much further than seemed
    // reasonable in isolation, and even that first pass wasn't enough:
    // this palette's `glow` is warm, and a warm key light multiplying over
    // a blue petal crushes its blue channel on the way through (the exact
    // mechanism Baby Blue Eyes/Lupine's own petal anchors elsewhere in
    // this registry already had to correct for) — pixel-sampling the
    // actual render found the first, more moderate blue topping out at
    // ~30% saturation on screen, barely distinguishable from neutral
    // despite the source hex reading as a clear teal-blue on its own.
    petalPrimary: '#F5C518',
    petalSecondary: '#E0331C',
    petalTertiary: '#06A1EF',
    // The reference's small muted brown-grey flecks (visible against the
    // bright highlight) — a real, grounded "centre" tone rather than
    // something invented for the role.
    core: '#6B5F56',
    // Warm gold pollen note — distinct from the petals' own yellow/red/blue
    // so the centres still read as their own thing.
    accent: '#E8A93A',
    stem: '#4A4A32',
    // Warm neutral rather than tinted to any one petal hue — yellow, red,
    // and blue don't share a family to tint towards the way a single-hue
    // petal set would, so this just stays close to black with enough
    // warmth to sit behind all three without reading as a fourth, off-key
    // colour (same reasoning Potpourri's own mixed-hue `deepShade` uses
    // elsewhere in this registry).
    deepShade: '#241A12',
    paleLight: '#FBF3E8',
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
