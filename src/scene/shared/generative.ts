import { CAMERA_CONFIG } from '../camera/config'
import { POST_PROCESSING_CONFIG } from '../effects/config'
import { samplePathDepression } from '../environment/groundColor'
import { FLOWER_FIELD_CONFIG } from '../subjects/flowerField/config'
import { sampleBandPosition } from '../subjects/flowerField/generateFlowerField'
import { frustumWidthHalfAt } from './frustum'
import type { MeadowLayoutConfig } from './meadowLayout'
import { sampleMeadowDensity } from './meadowLayout'
import { createMeadowLayout } from './meadowLayoutConfig'
import type { ColorPalette } from './palette'
import { findPaletteByName, PALETTES } from './palette'
import { createRng, gaussianish, range } from './random'
import { sampleTerrainHeight } from './terrainHeight'
import { createTerrainShape } from './terrainShapeConfig'

/**
 * How many candidate cluster-centre draws `deriveGenerativeState`'s camera
 * aim tries before settling for whichever landed on the highest meadow
 * cluster density seen — see that function's own comment for why this
 * exists at all. Not "until a good one is found and stop" without a cap:
 * every draw still has to consume `cameraRng` deterministically for a given
 * seed to stay reproducible, and an unbounded loop would too if a seed's
 * meadow genuinely has no dense spot within the search radius at all.
 *
 * Raised from 20 — even after fixing the search to read the real,
 * path-aware density (see `sampleClusterAreaDensity` below) rather than
 * the raw cluster field, 20 draws spread thinly enough over the search
 * radius that most seeds never actually landed on a genuinely dense spot,
 * just whichever mediocre candidate happened to score best: measured
 * directly across 5000 seeds, 69% never reached `CLUSTER_AIM_DENSITY_MIN`
 * even once, and 7% settled for something under 0.2 — sparse enough to
 * read as "mostly grass" once diluted across depth bands and blur, the
 * actual "too few flowers in frame" report this was raised to fix. This
 * step is pure noise-field math with no rendering involved, so more draws
 * cost essentially nothing; 150 (measured on the same 5000 seeds) cuts the
 * under-0.2 tail to 1.1% with clearly diminishing returns past this point
 * (300 draws only reaches 0.9%).
 */
const CLUSTER_AIM_RETRY_ATTEMPTS = 150
/** "Good enough" meadow cluster density (see `sampleMeadowClusterField`'s [0, 1] range) to stop retrying at — comfortably above the meadow's own gap floor (0.03) without demanding the absolute peak. */
const CLUSTER_AIM_DENSITY_MIN = 0.35
/**
 * How far from the base target point (in each of x/z) the cluster-aim
 * search above is willing to look for a better spot — deliberately wider
 * than any single preset's own `targetOffset`, since the whole point is
 * reaching *past* a preset's narrow window into a neighbouring cluster
 * when that window itself sits inside one contiguous low-density region.
 * `clusterFrequency` 0.05 (meadowLayoutConfig.ts) puts clusters roughly 20
 * units apart; widened from ±9 to ±13 alongside the retry-count raise
 * above (same measurement) — ±9 already comfortably *reaches* the nearest
 * cluster in most cases, but ±13 gives the higher retry count more real
 * area to actually search rather than resampling the same ±9 window that
 * much more densely, without searching so far the shot stops being a
 * plausible jitter around the original composition.
 */
const CLUSTER_SEARCH_RADIUS: OffsetRange = [-13, 13]

/**
 * Sample-point offsets `sampleClusterAreaDensity` averages over, world
 * units. A single-point read is dominated by whichever of the cluster
 * field's two blended noise layers happens to spike right at that exact
 * coordinate — `detailFrequency`0.22 is high enough to swing a point from
 * "gap" to "looks dense" over just a couple of world units, even inside a
 * broad region the *low*-frequency `clusterFrequency`0.05 layer (the one
 * that actually corresponds to "a cluster of flowers is here", not fine
 * texture within one) says is genuinely sparse. Verified directly: seeds
 * 1111 and 1814 both had a lucky single-point spike pass the density search,
 * landing the camera on what was really still an empty area with one
 * detail-noise blip — averaging a small cross of points a few units apart
 * cancels that high-frequency component out and leaves mostly the
 * low-frequency signal the search is actually meant to be following.
 */
const CLUSTER_AREA_SAMPLE_OFFSETS: ReadonlyArray<readonly [number, number]> = [
  [0, 0],
  [3, 0],
  [-3, 0],
  [0, 3],
  [0, -3],
]

/**
 * How far past the aimed bloom (as a multiple of the camera→bloom
 * distance) `Sky bloom`'s own `target` sits — see that preset's camera-
 * position comment for why this has to be a real extension of the actual
 * camera→bloom vector, not an independently-built point that only
 * approximately points the same way. 1 would put `target` exactly on the
 * bloom itself (a valid look-at point on its own, just with no built-in
 * "and a bit of open sky past it" lean); comfortably past 1 keeps the
 * bloom on-axis while framing a little more of what's beyond it.
 */
export const SKY_BLOOM_LOOK_EXTENSION = 3

/**
 * Reads `sampleMeadowDensity` (the path-carved density flower/grass
 * placement actually samples — shared/meadowLayout.ts), not the raw
 * `sampleMeadowClusterField` this used to read. The cluster field alone has
 * no idea a dirt path (`MeadowLayoutConfig.paths`) cuts through this exact
 * spot — measured directly across 5000 seeds: 17% had the search rate a
 * candidate as comfortably dense (≥0.3) purely on the cluster field, while
 * the real, path-aware density there sat under 0.15 (some cases under 0.02,
 * against the meadow's own 0.03 gap floor), because the candidate happened
 * to sit on or near one of the two wandering paths (`minDensity` 0.08/0.14,
 * and the two can compound where they cross to under 1.2% of peak). The
 * search would then confidently aim the camera at what was actually a bare
 * dirt track — a real, seed-reachable "camera pointed mostly at empty
 * ground" render, not a rare edge case. Reading the same density function
 * placement itself uses is what makes "the search says this spot is good"
 * and "this spot actually has flowers on it" the same claim.
 */
function sampleClusterAreaDensity(x: number, z: number, layout: MeadowLayoutConfig): number {
  let sum = 0
  for (const [dx, dz] of CLUSTER_AREA_SAMPLE_OFFSETS) {
    const worldZ = z + dz
    sum += sampleMeadowDensity(x + dx, worldZ, frustumWidthHalfAt(worldZ), layout)
  }
  return sum / CLUSTER_AREA_SAMPLE_OFFSETS.length
}

/**
 * Safety margin against `frustumWidthHalfAt`'s own half-width, below — a
 * candidate right at the boundary is still in the thinly-populated fringe
 * the flower field's own edge falloff leaves sparse, not the solid interior
 * the density search is trying to land on.
 */
const CLUSTER_FRUSTUM_MARGIN = 0.85

/**
 * `sampleMeadowClusterField`/`sampleClusterAreaDensity` are pure noise over
 * *all* of world space — they have no idea the flower field itself only
 * actually spawns instances inside the camera's own widening frustum
 * (`frustumWidthHalfAt`, shared/frustum.ts): narrow near the camera, wider
 * far away. Without this check, the search can (and for seeds 1111/1814,
 * did) "find" a world position the noise field calls dense, that's simply
 * outside where any flower was ever placed — an abstractly-dense coordinate
 * in empty space, landing the camera on nothing. Every candidate the search
 * considers has to actually be inside the field's real populated area, not
 * just score well on the density field alone.
 */
function isWithinMeadowFrustum(x: number, z: number): boolean {
  return Math.abs(x) <= frustumWidthHalfAt(z) * CLUSTER_FRUSTUM_MARGIN
}

/**
 * Everything in this scene — flower placement/species/colour, the meadow's
 * whole layout, the terrain, the camera's vantage point, the colour
 * palette, focus distance, bloom intensity, wind — derives from one
 * integer seed. That's the actual meaning of "generative" here: the same
 * seed always reproduces the exact same render, and a different seed gives
 * a genuinely different one across *every* one of those axes at once,
 * rather than just reshuffling flowers while everything else stays static.
 *
 * Sub-seeds are `seed + offset`, spaced 100,000 apart (see `SEED_OFFSETS`)
 * so they never collide with the small internal offsets (+300, +1000,
 * +2000, etc.) individual generators already add on top — the same
 * decorrelation trick those generators use, just one level up.
 *
 * The fields below marked "creative control default" aren't derived from
 * the seed at all — they're neutral defaults (1 = unchanged from the
 * tuned baseline, 0 = no shift) that `shared/GenerativeProvider.tsx`'s
 * Leva panel overrides live. They live on this same state/type so every
 * consumer keeps reading one `useGenerative()`/`usePalette()` regardless
 * of whether a given value came from the seed or a designer's slider.
 */
const SEED_OFFSETS = {
  flowerField: 0,
  meadowLayout: 100_000,
  terrainShape: 200_000,
  environment: 300_000,
  palette: 400_000,
  camera: 500_000,
  focus: 600_000,
  bloom: 700_000,
  wind: 800_000,
  motionBlur: 900_000,
  drama: 1_000_000,
  haze: 1_100_000,
  grain: 1_200_000,
  zoom: 1_300_000,
  skyBloomAim: 1_400_000,
} as const

/**
 * Camera fold "Zoom"'s usable band, as a raw `CAMERA_CONFIG.fov` divisor
 * (see `zoom`'s own docstring below). Tightened from Leva's old 0.6-2.2
 * slider bound — which was doing double duty as both the *only* clamp and
 * the full creative range — after a visual sweep found only this narrower
 * band actually read as a lens zoom: below ~1.5 the framing barely changed
 * from the untouched default, and above ~2.0 it crushed into an
 * unrecognisably tight, flat-looking crop. Exported so
 * GenerativeProvider.tsx's Leva control can map its displayed 0-1 slider
 * onto the same band `zoom` below is actually drawn from, instead of the
 * two ranges silently drifting apart.
 */
export const ZOOM_MIN = 1.5
export const ZOOM_MAX = 2.0

export interface GenerativeCamera {
  position: readonly [number, number, number]
  target: readonly [number, number, number]
}

type OffsetRange = readonly [number, number]

interface CameraShotPreset {
  /** Display name — shown in Leva's Camera > Shot dropdown (GenerativeProvider.tsx) so a specific preset can be picked directly for comparison, bypassing the normal per-seed roll. */
  name: string
  /** Selection weight, relative to the other presets — doesn't need to sum to 1. */
  weight: number
  /**
   * Same mechanism/purpose as `ColorPalette.atmosphereScale` (palette.ts) —
   * scales `AtmosphericHazeEffect`'s strength/depthFalloff/volumetric-
   * strength together, multiplied with the active palette's own scale
   * (AtmosphericHaze.tsx). Optional, defaults to 1 (every preset's tuned
   * haze, unchanged). A preset whose composition is dominated by "infinite
   * depth" content (the sky dome, which doesn't write depth — see
   * AtmosphericHazeEffect.ts's `depthMask`) needs this: haze's exponential
   * depth mask reaches effectively 1 (maximum) there regardless of how
   * little of a normal, mostly-ground/midground frame that ever affects —
   * `Sky bloom` below is the one preset where that's most of the frame, not
   * a sliver of it.
   */
  atmosphereScale?: number
  /**
   * Overrides the lens's normal FOV (`CAMERA_CONFIG.fov / zoom`, ~11-15°)
   * with a fixed, wider value, degrees. Optional, defaults to unset (every
   * other preset keeps the normal macro-lens FOV and Leva's Zoom slider
   * keeps controlling it as usual). `Sky bloom` is the one preset that
   * needs this: at this lens's normal narrow FOV, a foreground-band bloom
   * close enough to sit at this preset's own short `focusDistance` subtends
   * several times the *entire* frame — there's no camera distance at that
   * FOV that fits both "bloom in focus" and "bloom actually fits in shot,
   * with sky around it" at once. A real macro lens can't do this either;
   * a wider one can. Confirmed the hard way: three separate geometry
   * fixes at the normal FOV each verified correctly (target genuinely
   * aimed at the bloom, camera genuinely above ground, standoff distance
   * genuinely clearing the flower's own footprint) and every one of them
   * still rendered as either "bloom fills 100%+ of frame, no sky" or "sky
   * only, bloom missed" — the FOV/distance mismatch, not the aim, was the
   * actual ceiling the whole time.
   */
  fovOverrideDeg?: number
  /**
   * Overrides the horizon dome's sky colour (Horizon.tsx, via
   * environment/paletteColors.ts) with a fixed blue, regardless of the
   * active palette's own `background` (what the sky normally derives from
   * — see that role's own docstring). Optional, defaults to unset (every
   * other preset's sky stays palette-tinted as normal). `Sky bloom` needs
   * this specifically: its whole composition is "a bloom against open
   * sky", and several palettes' own `background` reads as pale cream/mint/
   * lavender rather than anything a viewer would call "sky" once mixed
   * toward white for the horizon gradient — fine as a backdrop sliver in
   * every other preset's mostly-ground frame, not fine as ~80% of this
   * one's. The horizon's paler near-ground stop is derived from this same
   * override (mixed towards white), not overridden independently.
   */
  skyColorOverride?: string
  /**
   * Multiplies the non-directional lighting floor (hemisphere + ambient,
   * SceneLighting.tsx) on top of Leva's own Lighting > Overcast slider —
   * optional, defaults to 1 (every other preset's tuned floor, unchanged).
   * `Sky bloom`'s own low, near-grazing-angle view of the terrain (see its
   * camera-position comment) put large stretches of ground facing away
   * from the key light, and with no fill/floor light lifting them, they
   * crushed to flat black rather than reading as ground in shadow — a real,
   * photographically-plausible silhouette element in small doses (compare
   * the reference photo's own dark foreground shape), but not at the scale
   * a whole grazing-angle horizon band produced it at. Only the *floor*
   * lights are scaled, not the key/fill directional lights — those are
   * what the bloom's own bright, lit side depends on, and blowing them up
   * too would just move the "everything reads as one flat exposure" problem
   * SceneLighting.tsx's own docstring already fixed once back to being
   * one preset's problem again.
   */
  lightingFloorScale?: number
  /**
   * Multiplies `maxBlur` (LensOpticsDepthOfField.tsx's bokeh-disc-size
   * multiplier, Leva's Lens > Blur Amount) on top of whatever the seed/
   * Leva slider already set — optional, defaults to 1 (every other
   * preset's blur amount, unchanged). Exact-focus pixels always render
   * perfectly sharp regardless of `maxBlur` (the thin-lens formula's own
   * blur factor is 0 there, and 0 times anything is still 0) — `maxBlur`
   * only controls how much anything *away* from that exact point blurs.
   * `Sky bloom`'s aimed bloom has real depth across its own petals/leaves
   * (it isn't an infinitesimally thin plane sitting exactly at
   * `focusDistance`), so most of it was never actually *at* the sharp
   * point to begin with — reported as reading "too sharp" regardless, since
   * the tuned default `maxBlur` still left most of that real depth
   * variation only mildly softened. Raised well past every other preset's
   * implicit 1 so the bloom's own volume reads as gently, consistently
   * soft rather than picking out one crisp plane through it.
   */
  maxBlurScale?: number
  /**
   * When true, `positionOffset`/`targetOffset` below are ignored — camera
   * position/target are instead built around a real foreground-flower
   * ground position (`sampleBandPosition`, subjects/flowerField/
   * generateFlowerField.ts) computed once per seed below, not the fixed
   * `CAMERA_CONFIG.position`/`target` base every other preset offsets from.
   * `Sky bloom` (below) is the one preset that needs to aim at an actual
   * flower rather than a generic dense area — see its own comment for why
   * a camera aimed by area-density alone kept finding nothing but empty
   * air along its own steep, narrow upward view cone. Optional, defaults to
   * false.
   */
  aimAtNearFlower?: boolean
  positionOffset: readonly [OffsetRange, OffsetRange, OffsetRange]
  targetOffset: readonly [OffsetRange, OffsetRange, OffsetRange]
  /**
   * World-unit focus distance this preset's composition actually puts its
   * dominant, near flower content at — see the block below `pickCameraShotPreset`
   * for why this can't just be derived from the jittered camera/target
   * instead.
   */
  focusDistance: number
}

/**
 * Every seed used to vary within one continuous jitter band around a single
 * base pose — every render was "the same macro shot from a slightly
 * different tripod position," with no seed ever producing a genuinely
 * different composition. These discrete presets (picked per seed, then
 * jittered *within* the picked preset the same way the old single band was)
 * give real compositional variety instead: a classic dead-on macro, a low
 * worm's-eye looking up into the blooms, a tighter single-subject crop, and
 * `skyBloom` (below) — a much steeper worm's-eye that clears the meadow
 * entirely and looks almost straight up through one near bloom into open
 * sky. The first three share equal weight (an even 1-in-3-of-the-remaining-
 * weight each) rather than `classic` dominating — a deliberate choice to
 * make the less-common framings show up often enough to actually find/
 * reproduce one, not a coin flip that happens to look even. `skyBloom` is
 * weighted lower (see its own comment) so it reads as an occasional
 * distinctive variant rather than crowding out the normal meadow shots. An
 * `elevated` near-top-down preset used to sit here too; dropped for reading
 * as too visually complex/busy a composition.
 *
 * Each preset's `name` is also what populates Leva's Camera > Shot dropdown
 * (GenerativeProvider.tsx) — picking one there shows that preset's own
 * canonical framing (offset ranges' midpoint, no per-seed jitter, and its
 * own tuned `focusDistance`) directly, rather than waiting to reroll a seed
 * that happens to land on it, so the presets can actually be compared
 * side by side. That override is applied only at Leva's final state
 * composition, independent of `deriveGenerativeState` below — see this
 * export's own comment on why (position/target/focusDistance all come from
 * the picked preset directly while one is selected; Height/Distance/Pan/
 * Focus Distance's own sliders take back over once it's set back to the
 * "Seed default" option).
 */
export const CAMERA_SHOT_PRESETS: readonly CameraShotPreset[] = [
  {
    name: 'Classic',
    // Classic macro — the original tuned base framing's own jitter band, unchanged.
    weight: 1,
    positionOffset: [
      [-3, 3],
      [-1.2, 1.2],
      [-2, 2],
    ],
    targetOffset: [
      [-3, 3],
      [0, 0],
      [-3, 3],
    ],
    focusDistance: 15,
  },
  {
    name: "Worm's-eye",
    // Low worm's-eye — camera drops near ground level and looks up into the field instead of steeply down.
    // focusDistance left at the classic-shot-era value: this composition's
    // dominant subject is the near flowers looming close to the lens (the
    // whole point of "looking up into the blooms"), not a ground-plane
    // intersection far out — a straight-line-of-sight ground raycast for
    // this preset lands anywhere from ~15 to ~44 world units depending on
    // seed jitter alone (grazing-angle distance estimates blow up exactly
    // like this), too unstable to retune against with any confidence. The
    // other two presets' raycast distances varied by seed by well under
    // 2 units; this one swung by over 20. Left alone pending a live-render
    // check rather than risk retuning against a proxy this seed-sensitive.
    weight: 1,
    positionOffset: [
      [-2, 2],
      [-6, -4],
      [-1, 1],
    ],
    targetOffset: [
      [-2, 2],
      [3, 5],
      [-2, 2],
    ],
    focusDistance: 11,
  },
  {
    name: 'Tight crop',
    // Tight single-subject crop — camera pulls in noticeably closer to the focal cluster.
    // focusDistance retuned 10 → 13, same reasoning/method as `elevated`
    // used to have before it was dropped — this preset's own geometry puts
    // its near ground content at ~13 world units, consistently across
    // seeds, not the 10 it was set to.
    weight: 1,
    positionOffset: [
      [-1.5, 1.5],
      [-1, 1],
      [-4, -2],
    ],
    targetOffset: [
      [-1, 1],
      [0, 0],
      [-1, 1],
    ],
    focusDistance: 13,
  },
  {
    name: 'Sky bloom',
    // Camera drops below flower height and pitches steeply upward, so one
    // near bloom looms large and low in frame with nothing but open sky
    // behind/around it (no ground, no horizon, no neighbouring flowers) —
    // the composition a reference photo asked for directly: a single soft,
    // heavily-blurred bloom silhouetted against plain sky. Weighted lower
    // (0.5 against the other three's 1 each, ~1-in-7 renders) since it's a
    // deliberately distinctive occasional variant, not a replacement for
    // the normal meadow-filling shots.
    //
    // Two rounds of live-render debugging before this worked at all — worth
    // keeping both lessons on record since they're easy to reintroduce:
    //
    // 1) A pure offset-based first pass (like every other preset below)
    // rendered as a near-featureless pale wash: `positionOffset`'s Z sat
    // near the camera's normal front-of-meadow spot while `targetOffset`'s
    // Z stayed near the meadow itself, a real ~13-unit horizontal gap that
    // only produced a shallow ~30° pitch, not a steep "look straight up" —
    // and the short focus distance landed in empty air along that shallow
    // ray, nowhere near any actual flower.
    //
    // 2) Even after fixing the geometry to a genuine ~70-80° pitch (by
    // collapsing that horizontal gap), it *still* rendered as a near-
    // featureless wash. Two compounding causes: `AtmosphericHazeEffect`'s
    // depth mask reads the sky dome (Horizon.tsx, which doesn't write
    // depth) as maximum distance and fully hazes it — a non-issue for every
    // other preset's mostly-ground frame, but this preset's frame is
    // *mostly sky* by design (see `atmosphereScale` below); and offset-
    // based aiming only guarantees a generally *dense area* is ahead, not
    // that any specific flower sits directly along this preset's own
    // narrow, steeply-upward view cone — a real flower's stem has to be
    // within a fraction of a world unit of the camera's own (x, z) for a
    // ~11-15° FOV to actually catch it looking straight up, which offset
    // jitter around a general cluster centre essentially never lands on.
    // `aimAtNearFlower` (below) fixes the second cause by aiming at a real
    // foreground-band flower position instead.
    //
    // 3) The first `aimAtNearFlower` pass still came back near-black or
    // blank-pale, seed after seed — this time from standing *too close*: it
    // put the camera only ~0.3 world units sideways from the very flower it
    // was aiming at, near enough that its own stem/petals (not clear sky)
    // filled the extreme near field, reading as an opaque, near-featureless
    // (often backlit) blur rather than a bloom read against sky beyond it.
    // Fixed with a real standoff — but that pass's own `target` turned out
    // not to actually be aimed at the bloom at all (a separate bug, see the
    // camera-position comment in generative.ts), so results stayed
    // inconsistent (sometimes swallowed, sometimes missed) until that was
    // fixed too.
    //
    // 4) With `target` genuinely aimed at the bloom, results stopped being
    // random — and became consistently *wrong* the same way every time:
    // either the bloom filled the entire frame and then some (no sky
    // visible at all) or, when the ~0.3 world-unit-radius-ish foreground
    // bloom happened not to be quite on-axis, nothing but sky. The
    // lens's normal FOV (~11-15°) is simply too narrow for any camera
    // distance to satisfy "bloom close enough to be in focus at this
    // preset's own short `focusDistance`" and "bloom small enough to
    // actually fit inside the shot, with room for sky around it" at once —
    // a real macro lens has exactly this same limitation; a wider one
    // doesn't. `fovOverrideDeg` (see `CameraShotPreset` above) is that
    // wider lens, and `skyBloomCameraOffset`/`focusDistance` below were
    // rescaled to match the frame it produces.
    weight: 0.5,
    atmosphereScale: 0.35,
    fovOverrideDeg: 42,
    // Clear, believable sky blue — see this field's own comment on
    // `CameraShotPreset` above for why every palette's own (often pale
    // cream/mint/lavender) `background` doesn't work for a composition
    // that's mostly sky.
    skyColorOverride: '#6FA6DD',
    // Raised well past every other preset's implicit 1 — see this field's
    // own comment on `CameraShotPreset` above for the grazing-angle-ground
    // problem this is fixing.
    lightingFloorScale: 1.7,
    // See this field's own comment on `CameraShotPreset` above.
    maxBlurScale: 2.2,
    aimAtNearFlower: true,
    // Unused while `aimAtNearFlower` is true (see its own comment on
    // `CameraShotPreset` above) — kept as a documented fallback shape only,
    // not a real fallback path (there's no runtime branch that reads these
    // for this preset today).
    positionOffset: [
      [-1.5, 1.5],
      [-9.5, -8.5],
      [-13, -11],
    ],
    targetOffset: [
      [-1, 1],
      [8, 12],
      [-1, 1],
    ],
    // Matches the real camera→bloom distance `skyBloomCameraOffset`/the
    // vertical drop produce (generative camera-position comment) at
    // `fovOverrideDeg`'s wider framing — nowhere close to every offset-
    // based preset's 11-15, but no longer the point-blank ~1.2 either.
    focusDistance: 2.6,
  },
]

function pickCameraShotPreset(rng: () => number): CameraShotPreset {
  const totalWeight = CAMERA_SHOT_PRESETS.reduce((sum, preset) => sum + preset.weight, 0)
  let roll = rng() * totalWeight
  for (const preset of CAMERA_SHOT_PRESETS) {
    roll -= preset.weight
    if (roll <= 0) return preset
  }
  return CAMERA_SHOT_PRESETS[0] // unreachable — weights sum to totalWeight — but keeps TS happy
}

export interface GenerativeWind {
  /** World-unit bend magnitude at a blade's tip. */
  strength: number
  /** Oscillation speed, roughly radians/second. */
  speed: number
  /** World-space direction the wind blows towards, radians. */
  directionRad: number
  /** Spatial frequency of the gust wave across world x/z — lower reads as broad, slow-moving gusts; higher as tighter, busier turbulence. */
  frequency: number
}

export interface GenerativeState {
  seed: number
  palette: ColorPalette
  /** Sub-seed for generateFlowerField.ts's own per-flower RNG (archetype/petal-count/colour/etc). */
  flowerFieldSeed: number
  /** Sub-seed for the shared meadow density/cluster/path field both the flower field and environment sample. */
  meadowLayoutSeed: number
  /** Sub-seed for the shared terrain height field both the environment mesh and flower field sample. */
  terrainShapeSeed: number
  /** Sub-seed for the environment's own per-instance RNG (grass/vegetation placement, soil/damp texture). */
  environmentSeed: number
  camera: GenerativeCamera
  /** Which `CAMERA_SHOT_PRESETS` entry this seed rolled — only used to seed Leva's Camera > Shot dropdown's initial value (GenerativeProvider.tsx), not read anywhere else; the dropdown's own override bypasses this state entirely once changed (see `CAMERA_SHOT_PRESETS`'s own comment). */
  shotPresetName: string
  /** A real foreground-band flower's (x, y, z) ground/bloom-height position for this seed — see `CameraShotPreset.aimAtNearFlower`'s own comment. Always computed (cheap), regardless of which preset this seed actually rolled, so GenerativeProvider.tsx's Shot-dropdown override can reuse it without its own copy of the same lookup. */
  skyBloomAim: readonly [number, number, number]
  /** The same aim's bare ground height (no stem/bloom height added) — `skyBloomAim[1]` minus the same band's own representative stem height. Camera height anchors to this directly (plus a small clearance), not to `skyBloomAim[1]` minus a fixed offset — see the comment where this is used in `deriveGenerativeState` for why that fixed-offset version put the camera underground. */
  skyBloomGroundY: number
  focusDistance: number
  bloomIntensity: number
  wind: GenerativeWind
  /**
   * A per-seed "intensity" scalar, 0 (calm) to 1 (dramatic) — see
   * `deriveGenerativeState`'s docstring on `drama` for what it couples
   * together. Not itself Leva-exposed: a manual master dial on top of the
   * Blur Length/Haze/Grain Amount sliders it already feeds would recreate
   * the exact "two dials for one effect" problem `motionBlurStrength`'s
   * own docstring describes fixing. Informational only — logged alongside
   * the seed on reseed (GenerativeProvider.tsx) so a render's overall mood
   * is visible without reverse-engineering it from the individual sliders.
   */
  drama: number
  /**
   * How hard this render's camera sweep swings, relative to
   * `CAMERA_CONFIG.sweep.rotationAmplitudeDeg`. Its *centre* now comes from
   * `drama` (0.2 at drama=0, 1.7 at drama=1), with a smaller independent
   * jitter on top for texture — previously this rolled entirely
   * independently, which meant a seed could just as easily land on "heavy
   * blur, no haze, no grain" as any coherent combination; coupling the
   * centre is what makes a render's overall intensity read as one mood
   * instead of several unrelated dice rolls (see `deriveGenerativeState`).
   * The full range still spans from barely panning (soft blur that still
   * reads the flower shapes underneath) to a fully abstracted directional
   * streak, matching the spread real ICM reference photography shows.
   * This is the *only* dial on the sweep's strength — Leva's Camera > Blur
   * Length control (GenerativeProvider.tsx) sets this value directly, the
   * same way Lens > Focus Distance sets `focusDistance`. There used to
   * also be a separate "Movement" multiplier stacked on top, but two dials
   * for one effect just meant fine-tuning both together to avoid over/
   * under-shooting — `cameraMovementMultiplier` below is now a fixed
   * baseline instead, not Leva-exposed for this.
   */
  motionBlurStrength: number
  /**
   * Which way the sweep — and thus the motion-blur streak — points, radians.
   * 0 is a pure horizontal pan (yaw only, the original fixed behaviour);
   * other angles blend in vertical (pitch) sweep so streak direction varies
   * render to render instead of every seed panning the same way. See
   * CameraSweep.tsx/LongExposureBlurPass.ts, both of which read this so the
   * blur pass's own within-frame streak estimate never drifts out of sync
   * with the direction the camera is actually sweeping. Deliberately does
   * *not* read `drama` — intensity and direction are different kinds of
   * variety, and a dramatic render shouldn't also always sweep the same way.
   */
  motionBlurDirectionAngle: number

  // --- Creative-control defaults (see class docstring) ---
  /** A fixed baseline HandheldDrift's tremor scales by — no longer Leva-exposed (see `motionBlurStrength`'s docstring for why the sweep itself moved to a single dial). Always 1. */
  cameraMovementMultiplier: number
  /** Lighting fold "Overcast" — scales the hemisphere/ambient sky light together. 1 = as tuned. */
  lightingOvercast: number
  /** Lighting fold "Warmth" — scales how much `glow`/`foliagePrimary` tint the lights. 1 = as tuned. */
  lightingWarmth: number
  /** Lighting fold "Shadow Depth" — scales the two directional lights' intensity (more = more defined shadow hint). 1 = as tuned. */
  lightingShadowDepth: number
  /** Flowers fold "Density" — multiplies flowerCount. 1 = as tuned. */
  flowerDensity: number
  /** Flowers fold "Scale" — multiplies every band's flower-scale range. 1 = as tuned. */
  flowerScale: number
  /** Flowers fold "Poppy Accent" — probability a flower uses the fixed hue-27 orange instead of the palette's own petal anchors. */
  poppyAccentProbability: number
  /** Colour fold "Hue Shift" — degrees every palette colour is rotated by before use. 0 = as picked. */
  hueShiftDeg: number
  /**
   * Atmosphere fold "Haze" — scales AtmosphericHazeEffect's haze +
   * volumetric strength together. Seed-derived (see
   * `deriveGenerativeState`'s `drama` docstring) rather than a flat 1 —
   * the Leva slider's own displayed value starts wherever the seed put it,
   * the same pattern Camera > Blur Length uses for `motionBlurStrength`.
   */
  hazeAmount: number
  /** Atmosphere fold "Softness" — scales BilateralSoftEffect's blur radius. 1 = as tuned. */
  softness: number
  /** Atmosphere fold "Fog" — multiplies the scene's FogExp2 density. 1 = as tuned. */
  fogDensityMultiplier: number
  /** Lens fold "Blur Amount" — overrides CAMERA_CONFIG.dof.maxBlur. */
  maxBlur: number
  /** Lens fold "Aperture" — overrides CAMERA_CONFIG.dof.fStop (lower = shallower). */
  fStop: number
  /** Lens fold "Highlight Bloom" — intensity of the second, high-threshold bloom pass (PostProcessing.tsx). Direct value, not a multiplier, same as bloomIntensity. */
  highlightBloomIntensity: number
  /** Colour fold "Exposure" — scales PaletteGradePass's linear (camera-stop-like) exposure multiplier. 1 = as tuned. */
  exposureAmount: number
  /** Colour fold "Brightness" — PaletteGradePass's flat additive brightness offset. Direct value, not a multiplier (its neutral value is 0). 0 = unchanged. */
  brightnessAmount: number
  /** Colour fold "Highlights" — PaletteGradePass's additive lift/pull on just the bright end of the tonal range. Direct value, not a multiplier. 0 = unchanged. */
  highlightsAmount: number
  /** Colour fold "Shadows" — PaletteGradePass's additive lift/pull on just the dark end of the tonal range. Direct value, not a multiplier. 0 = unchanged. */
  shadowsAmount: number
  /** Colour fold "Contrast" — scales PaletteGradePass's contrast pivot. 1 = as tuned. */
  contrastAmount: number
  /** Colour fold "Vibrance" — scales PaletteGradePass's vibrance boost. 1 = as tuned. */
  vibranceAmount: number
  /**
   * Film fold "Grain Amount" — scales TextureGrainPass's Overlay-blend
   * opacity. Seed-derived (see `deriveGenerativeState`'s `drama`
   * docstring) rather than a flat 1 — same pattern as `hazeAmount`.
   */
  grainAmount: number
  /** Film fold "Grain Size" — scales how much of the grain plate GrainOverlay.tsx samples (see its docstring — inverted from TextureGrainPass's own `grainScale` so bigger reads as bigger grain). 1 = as tuned, and deliberately left independent of `drama` — grain *coarseness* is a stylistic choice, not an intensity axis. */
  grainSize: number
  /** Grass fold "Density" — multiplies ENVIRONMENT_CONFIG.grass.count. 1 = as tuned. */
  grassDensity: number
  /** Grass fold "Height" — multiplies each blade's height range. 1 = as tuned. */
  grassHeight: number
  /** Grass fold "Width" — multiplies each blade's width independently of height. 1 = as tuned. */
  grassWidth: number
  /** Camera fold "Zoom" — overrides CAMERA_CONFIG.fov (degrees). Narrower = more zoomed in/telephoto-compressed, wider = more zoomed out. Always the result of dividing CAMERA_CONFIG.fov by `zoom` below (GenerativeProvider.tsx recomputes it from the live Leva control the same way); not itself independently seed-derived. */
  fov: number
  /**
   * Camera fold "Zoom" — the raw divisor `fov` above is computed from
   * (bigger = narrower FOV = more zoomed in), bounded to `ZOOM_MIN`-
   * `ZOOM_MAX`. Seed-derived rather than a flat default — used to sit at
   * an always-1 constant regardless of seed (the same flat-default bug
   * `hazeAmount`/`grainAmount` above were fixed for), so every render used
   * the exact same framing tightness until a designer dragged the slider.
   * GenerativeProvider.tsx's Leva control shows this remapped to a 0-1
   * fraction of the band, not the raw divisor directly.
   */
  zoom: number
}

export interface DeriveGenerativeStateOptions {
  /** Pins a specific palette by exact name, overriding whatever the seed would have picked — for tuning/screenshotting one deliberately. */
  forcePaletteName?: string
}

/**
 * Derives the render's entire generative state from one integer seed. Pure
 * function — same `seed` (and `forcePaletteName`) always produce the exact
 * same state. The creative-control fields are set to neutral defaults here
 * (see the class docstring) — GenerativeProvider.tsx's Leva panel is what
 * actually overrides them.
 */
export function deriveGenerativeState(seed: number, { forcePaletteName }: DeriveGenerativeStateOptions = {}): GenerativeState {
  const paletteRng = createRng(seed + SEED_OFFSETS.palette)
  const rolledPalette = PALETTES[Math.floor(paletteRng() * PALETTES.length)]
  const palette = (forcePaletteName && findPaletteByName(forcePaletteName)) || rolledPalette

  // Picks one of a few discrete shot compositions (CAMERA_SHOT_PRESETS
  // above), then jitters within it — every seed used to vary continuously
  // around one single base pose, so every render was "the same shot from a
  // slightly different spot." Still bounded around CAMERA_CONFIG's
  // carefully-composed base framing rather than anything unbounded — every
  // preset should still look like a deliberate macro-photography shot, not
  // a randomly-aimed camera.
  const cameraRng = createRng(seed + SEED_OFFSETS.camera)
  const [baseX, baseY, baseZ] = CAMERA_CONFIG.position
  const [targetX, targetY, targetZ] = CAMERA_CONFIG.target
  const shotPreset = pickCameraShotPreset(cameraRng)

  // The target's x/z jitter used to be a single independent draw — the
  // camera had no idea where the meadow's own generated content actually
  // was, so it could (and, sampled across enough seeds, did) land pointed
  // at one of the meadow's own low-density "gaps" (shared/meadowLayout.ts's
  // `densityFloor` deliberately allows clearings as sparse as 3% of peak
  // density, for realism) purely by chance, rendering as a near-empty
  // frame — a handful of distant/heavily-blurred flowers over what's
  // otherwise just ground/haze, regardless of how much content exists
  // elsewhere in the same field.
  //
  // Two stages, not one rejection-sampling pass over each preset's own
  // (small) `targetOffset`: measured directly that for a real fraction of
  // seeds, that whole narrow window sits inside one contiguous low-density
  // region (clusters are ~20 units apart at `clusterFrequency`0.05 — easily
  // wider than a ±1-3 unit preset offset), so no amount of retries *inside
  // it* ever finds anything better. `CLUSTER_SEARCH_RADIUS` searches a
  // window wide enough to reliably reach a neighbouring cluster instead,
  // landing on a genuinely good general area; each preset's own
  // `targetOffset` is then applied as before, as fine composition variety
  // *around* that area rather than around the fixed base target point —
  // still exactly as much per-preset framing character, just centred on
  // real content.
  // Its own RNG stream, deliberately not `cameraRng` — this loop's iteration
  // count varies per seed (it early-exits the moment a candidate clears
  // `CLUSTER_AIM_DENSITY_MIN`), so drawing from the same stream `cameraRng`
  // used just below it would shift *every* subsequent position/targetOffset
  // draw by a different amount seed to seed. Verified directly: that
  // shared-stream version fixed some of the originally-flagged seeds but
  // made others (e.g. 1111, 1814) render emptier than before, because it was
  // really just re-rolling the camera position/offset jitter under a
  // different name, not landing it on better content — the density search
  // has to be fully decoupled from `cameraRng`'s own draw sequence for the
  // rest of this function to keep meaning what it says.
  //
  // Only actually search when the base target point itself is sparse.
  // Running the search unconditionally for every seed — even ones whose
  // original (untouched) aim was already fine — still changes the shot for
  // those seeds too, since the search's own candidate (0, 0) isn't
  // guaranteed to win against a denser-but-still-fine spot nearby; verified
  // directly that doing it unconditionally regressed seeds 1111 and 1814,
  // which were never actually landing on a gap in the first place. Checking
  // the base point first means a seed that was already fine keeps its exact
  // original framing — this only ever redirects the seeds that need it.
  const meadowLayout = createMeadowLayout(seed + SEED_OFFSETS.meadowLayout)
  let clusterCenterX = 0
  let clusterCenterZ = 0
  let bestClusterDensity = sampleClusterAreaDensity(targetX, targetZ, meadowLayout)

  if (bestClusterDensity < CLUSTER_AIM_DENSITY_MIN) {
    const clusterSearchRng = createRng(seed + SEED_OFFSETS.camera + 50_000)
    for (let attempt = 0; attempt < CLUSTER_AIM_RETRY_ATTEMPTS; attempt++) {
      const candidateX = range(clusterSearchRng, ...CLUSTER_SEARCH_RADIUS)
      const candidateZ = range(clusterSearchRng, ...CLUSTER_SEARCH_RADIUS)
      const worldX = targetX + candidateX
      const worldZ = targetZ + candidateZ
      if (!isWithinMeadowFrustum(worldX, worldZ)) continue
      const density = sampleClusterAreaDensity(worldX, worldZ, meadowLayout)
      if (density > bestClusterDensity) {
        bestClusterDensity = density
        clusterCenterX = candidateX
        clusterCenterZ = candidateZ
      }
      if (density >= CLUSTER_AIM_DENSITY_MIN) break
    }
  }

  // A real foreground-band flower's ground position/height — see
  // `CameraShotPreset.aimAtNearFlower`'s own comment for why `Sky bloom`
  // needs this instead of the generic offset-around-a-dense-area approach
  // every other preset uses. Computed unconditionally (cheap — a handful of
  // noise-function point queries, not a scene generation pass) both for
  // simplicity and so `skyBloomAim` below can be exposed on the returned
  // state for GenerativeProvider.tsx's Shot-dropdown override to reuse,
  // rather than needing its own copy of this same lookup.
  const skyBloomAimRng = createRng(seed + SEED_OFFSETS.skyBloomAim)
  const foregroundBand = FLOWER_FIELD_CONFIG.depthBands[0]
  const skyBloomAimGround = sampleBandPosition(skyBloomAimRng, foregroundBand, meadowLayout)
  const skyBloomTerrainShape = createTerrainShape(seed + SEED_OFFSETS.terrainShape)
  const skyBloomGroundY =
    sampleTerrainHeight(skyBloomAimGround.x, skyBloomAimGround.z, skyBloomTerrainShape) -
    samplePathDepression(skyBloomAimGround.x, skyBloomAimGround.z, meadowLayout)
  // Matches generateFlowerField.ts's own `flowerScale * stemHeightFactor`
  // formula for this exact band — range midpoints rather than a random
  // roll, since this only needs one representative bloom height to aim at,
  // not to reproduce any specific instance's own exact one.
  const skyBloomFlowerScale = (foregroundBand.scaleRange[0] + foregroundBand.scaleRange[1]) / 2
  const skyBloomStemHeightFactor = (foregroundBand.stemHeightFactorRange[0] + foregroundBand.stemHeightFactorRange[1]) / 2
  const skyBloomAimY = skyBloomGroundY + skyBloomFlowerScale * skyBloomStemHeightFactor
  const skyBloomAim: readonly [number, number, number] = [skyBloomAimGround.x, skyBloomAimY, skyBloomAimGround.z]

  // `Sky bloom`'s third geometry rework — a live render of the second one
  // (ground-clearance fix above, otherwise unchanged) came back either
  // near-black or blank-pale, seed after seed. Root cause: a ±0.3 XZ jitter
  // is nowhere near enough to clear the *aimed flower's own* stem/petal
  // footprint — the camera was routinely sitting right beside or under its
  // own target flower's foliage, close enough that DOF blurred that one
  // opaque, often-backlit surface into a near-featureless dark or pale mass
  // filling the whole frame, not a bloom read against clear sky beyond it.
  //
  // Fixed with a real standoff distance instead: the camera sits
  // `skyBloomCameraOffset` world units away from the aim point in a random
  // horizontal direction — comfortably past a foreground bloom's own
  // petal/leaf radius — and looks back roughly *through* the aim point
  // rather than straight up from beside it, so the bloom sits on the view
  // ray at a real, resolvable distance instead of point-blank. Ground
  // height is resampled at the camera's own (offset) position, not the aim
  // point's — terrain has real small-scale bump (`detailAmplitude`,
  // terrainShapeConfig.ts) over a ~1-unit radius, so reusing `skyBloomGroundY`
  // (sampled only at the aim point) was never a reliable clearance guarantee
  // for a camera sitting a unit away from it.
  // Horizontal standoff scaled up 0.8-1.1 → 2.2-2.8 for the fourth rework
  // (`fovOverrideDeg` on this preset, below) — clearing the aimed flower's
  // own footprint was never the limiting factor; matching the *frame* to
  // the bloom's own angular size at this now-much-wider FOV is. At the
  // lens's normal ~11-15° FOV, no standoff short enough to keep the bloom
  // in focus (this preset's own short `focusDistance`) ever kept the bloom
  // *inside* the frame at all — see `fovOverrideDeg`'s own comment
  // (CameraShotPreset above) for the full reasoning/math. Vertical drop is
  // chosen directly (not as an incidental side-effect of "ground height
  // plus a small clearance") and only pulled back up if it would put the
  // camera below the real, locally-resampled ground.
  const skyBloomCameraAngle = range(cameraRng, 0, Math.PI * 2)
  const skyBloomCameraOffset = range(cameraRng, 2.2, 2.8)
  const skyBloomCameraDrop = range(cameraRng, 0.5, 0.75)
  const skyBloomCameraX = skyBloomAim[0] + Math.cos(skyBloomCameraAngle) * skyBloomCameraOffset
  const skyBloomCameraZ = skyBloomAim[2] + Math.sin(skyBloomCameraAngle) * skyBloomCameraOffset
  const skyBloomCameraGroundY =
    sampleTerrainHeight(skyBloomCameraX, skyBloomCameraZ, skyBloomTerrainShape) -
    samplePathDepression(skyBloomCameraX, skyBloomCameraZ, meadowLayout)
  const skyBloomCameraY = Math.max(skyBloomCameraGroundY + 0.2, skyBloomAim[1] - skyBloomCameraDrop)

  const camera: GenerativeCamera = shotPreset.aimAtNearFlower
    ? {
        position: [skyBloomCameraX, skyBloomCameraY, skyBloomCameraZ],
        // Genuinely aimed at the bloom, not just roughly nearby — a real
        // bug in the previous pass: `target`'s X/Z came from `skyBloomAim`
        // directly and its Y from a large fixed offset above the camera,
        // which happened to point in a completely different direction from
        // the actual camera→bloom vector (measured directly on the pass
        // that shipped: an 82.6° pitch towards `target`, vs. the real
        // bloom sitting only ~24° above horizontal from the camera — the
        // two were never the same ray, so the bloom was usually well
        // outside this preset's own narrow field of view no matter how
        // dialled-in the standoff distance/ground clearance were).
        // `target` here is instead constructed by extending the real
        // camera→bloom vector further along the same line — the bloom
        // then sits exactly on the view ray at `skyBloomCameraOffset`-ish
        // world units out (this preset's own short `focusDistance` matches
        // that), with clear sky visible beyond it along that same sightline.
        target: [
          skyBloomCameraX + (skyBloomAim[0] - skyBloomCameraX) * SKY_BLOOM_LOOK_EXTENSION,
          skyBloomCameraY + (skyBloomAim[1] - skyBloomCameraY) * SKY_BLOOM_LOOK_EXTENSION,
          skyBloomCameraZ + (skyBloomAim[2] - skyBloomCameraZ) * SKY_BLOOM_LOOK_EXTENSION,
        ],
      }
    : {
        position: [
          baseX + range(cameraRng, ...shotPreset.positionOffset[0]),
          baseY + range(cameraRng, ...shotPreset.positionOffset[1]),
          baseZ + range(cameraRng, ...shotPreset.positionOffset[2]),
        ],
        target: [
          targetX + clusterCenterX + range(cameraRng, ...shotPreset.targetOffset[0]),
          targetY + range(cameraRng, ...shotPreset.targetOffset[1]),
          targetZ + clusterCenterZ + range(cameraRng, ...shotPreset.targetOffset[2]),
        ],
      }

  // Focus distance used to depend on the actual camera→target distance
  // (either a fixed constant, or later a per-seed geometric calc) — both
  // approaches assumed "however far the *camera* rolled from the *target*"
  // tracks "how far away the *flowers* actually are", which turns out false:
  // the flower field's own positions don't move with the camera's small
  // jitter, but a straight-line camera→target distance is directly and
  // fully sensitive to that jitter, so the two drift apart the more the
  // roll happens to push camera/target further from each other. Verified
  // directly (a Leva focus-distance sweep against a render that read as
  // fully out of focus at every naive-distance estimate — see git history
  // for the debugging session): the seeds that came out sharp all happened
  // to roll a *short* camera→target distance (14.5-16.6), every seed that
  // rolled *further* (17.3+) came out blurred edge-to-edge, even though
  // both groups are the same `classic` shot preset — the composition's
  // actual dominant, near flower content sits at a fairly consistent real
  // distance regardless of that jitter. Each preset above now carries its
  // own tuned `focusDistance` for exactly that reason — it describes where
  // *that composition* actually puts its subject, the same way its
  // position/targetOffset describe the vantage point, rather than being
  // rederived from whatever the jitter happens to roll. Small jitter on top
  // still varies which part of the near cluster (front bloom vs. one just
  // behind it) reads sharpest, without risking overshooting past it.
  const focusRng = createRng(seed + SEED_OFFSETS.focus)
  // `Sky bloom`'s own focus distance (~1-1.4, see `aimAtNearFlower`'s
  // camera-position comment above) sits far below every other preset's
  // 11-15 — the standard ±1.5 jitter is proportionally huge there and could
  // even go non-positive, so it gets a much tighter jitter band instead.
  // `Math.max` is a defensive floor for every preset, not just this one —
  // costs nothing today (no other preset's own focusDistance minus its own
  // jitter range ever gets close to it) but guards the same class of bug
  // this preset's own jitter needed fixing for.
  const focusJitterRange = shotPreset.aimAtNearFlower ? 0.25 : 1.5
  const focusDistance = Math.max(0.4, shotPreset.focusDistance + range(focusRng, -focusJitterRange, focusJitterRange))

  const bloomRng = createRng(seed + SEED_OFFSETS.bloom)
  const bloomIntensity = POST_PROCESSING_CONFIG.bloom.intensity + range(bloomRng, -0.13, 0.15)

  const windRng = createRng(seed + SEED_OFFSETS.wind)
  const wind: GenerativeWind = {
    strength: range(windRng, 0.06, 0.22),
    speed: range(windRng, 0.5, 1.4),
    directionRad: range(windRng, 0, Math.PI * 2),
    frequency: range(windRng, 0.08, 0.25),
  }

  // A shared per-seed "intensity" scalar, 0 (calm) to 1 (dramatic) —
  // motionBlurStrength/hazeAmount/grainAmount below all derive their
  // *centre* from this same value, each still with its own independent
  // jitter layered on top for texture. Without this, those three axes
  // rolled fully independently: a seed could just as easily land on
  // "heavy blur, no haze, no grain" as "no blur, thick haze, heavy grain"
  // — both individually fine, but reading as an inconsistent "look
  // language" render to render, since nothing tied them to one coherent
  // mood. gaussianish (not a flat 0-1 roll) also means most seeds land
  // somewhere moderate, with the fully-calm/fully-dramatic extremes
  // genuinely rarer — the same shape a real mixed batch of photographs
  // would have, rather than a uniform spread across "flat" to "chaotic."
  //
  // Capped at 0.85 (was uncapped, i.e. up to ~1.0): sampling the seed
  // distribution and rendering across it showed motionBlurStrength/
  // hazeAmount/grainAmount all stacking high enough above drama ≈ 0.9 to
  // erase the flower field into an illegible, muddy wash — a real "first
  // render is mud" complaint, not just an aggressively-styled one. Legible
  // (soft/hazy, but still readable) confirmed by direct render all the way
  // up to 0.85 itself; the uncapped tail above it was ~1.4% of random
  // seeds, common enough to hit repeatedly across ordinary reloads.
  const dramaRng = createRng(seed + SEED_OFFSETS.drama)
  const drama = Math.min(0.85, (gaussianish(dramaRng) + 1) / 2)

  // Squared, not used directly — `drama` itself is gaussian-ish around
  // 0.5, so a *linear* interpolation from each axis's calm floor to its
  // dramatic ceiling below put the *median* seed at roughly the midpoint
  // of that range, not near the calm end. Measured directly against a
  // render batch: that meant "moderate haze/blur/grain" was the typical
  // result, not the exception, reading as consistently gloomier/muddier
  // than intended rather than atmosphere reserved for genuinely dramatic
  // seeds. Squaring skews the curve so low-and-mid drama stay close to
  // the calm floor and only the upper tail actually climbs towards the
  // ceiling — same seed distribution, same three ceilings below, a
  // visibly calmer median.
  const dramaCurve = drama * drama

  // Wide on purpose — 0.2 barely sweeps at all (the residual blur comes
  // almost entirely from HandheldDrift's tiny tremor and wind sway, soft
  // enough to still read the underlying flower shapes) while 1.7 sweeps
  // into a strongly directional streak that's still legible — `
  // rotationAmplitudeDeg`(8°, camera/config.ts) × 1.7 ≈ 13.6°, just under
  // that file's own `maxRotationAmplitudeDeg`(14°) ceiling, so this never
  // needs that clamp to actually bite in normal use. Hard-capped at 1.7
  // itself (not just left to the degrees-per-unit scale above) because an
  // earlier version let `motionBlurStrength` run up to 2.2 and verified
  // directly that swinging the camera that far off the actual scene left
  // too much of the accumulation window landing on empty sky/haze — the
  // blended result lost *all* structure (flat noise), a genuinely
  // different failure mode from a strong-but-legible streak. Direction is
  // a full circle, not just a left-right pan — see CAMERA_CONFIG.sweep's
  // docstring for why that used to always be almost-pure yaw. The centre of
  // the range comes from `dramaCurve` (see above) rather than rolling
  // independently across the whole 0.2-1.7 span, or linearly off `drama`
  // itself; the ±0.15 jitter on top keeps two similarly-dramatic seeds
  // from landing on the exact same strength.
  const motionBlurRng = createRng(seed + SEED_OFFSETS.motionBlur)
  const motionBlurCenter = 0.2 + (1.7 - 0.2) * dramaCurve
  const motionBlurStrength = Math.min(1.7, Math.max(0.2, motionBlurCenter + range(motionBlurRng, -0.15, 0.15)))
  const motionBlurDirectionAngle = range(motionBlurRng, 0, Math.PI * 2)

  // Atmospheric haze and film grain — previously flat creative-control
  // defaults (always 1 until a designer touched the Leva panel), now
  // seed-derived from the same `drama` scalar as motionBlurStrength above,
  // for the same reason: a dramatic, heavily-swept render reads as more
  // coherent when the air around it is a little thicker and the grain a
  // little heavier too, instead of those staying flatly neutral regardless
  // of how hard the camera swept. Leva's Atmosphere > Haze / Film > Grain
  // Amount sliders still seed their displayed value from this (see
  // GenerativeProvider.tsx) and can override it same as always.
  //
  // Floors lowered (haze 0.7→0.55, grain 0.7→0.6) and ceilings trimmed
  // (haze 1.4→1.3, grain 1.3→1.2) alongside the same `dramaCurve` switch
  // motionBlurStrength above got: haze in particular is the single
  // heaviest-measured lever for washing colour/life out of a frame this
  // registry has (see palette.ts's `atmosphereScale` fixes) — a linear
  // centre that put the median seed *above* 1.0 (neutral) meant "hazier
  // than the tuned baseline" was the typical render, not a dramatic one.
  const hazeRng = createRng(seed + SEED_OFFSETS.haze)
  const hazeCenter = 0.55 + (1.3 - 0.55) * dramaCurve
  const hazeAmount = Math.min(1.55, Math.max(0.55, hazeCenter + range(hazeRng, -0.1, 0.1)))

  const grainRng = createRng(seed + SEED_OFFSETS.grain)
  const grainCenter = 0.6 + (1.2 - 0.6) * dramaCurve
  const grainAmount = Math.min(1.45, Math.max(0.55, grainCenter + range(grainRng, -0.08, 0.08)))

  // Independent of `cameraRng`/`dramaCurve` — deliberately just a flat draw
  // across the whole band, not coupled to `drama` the way motion blur/haze/
  // grain are. A dramatic, heavily-swept render doesn't need to also be a
  // tight crop (or a wide one) for its own sake; zoom is a framing choice,
  // not an intensity axis.
  const zoomRng = createRng(seed + SEED_OFFSETS.zoom)
  const zoom = range(zoomRng, ZOOM_MIN, ZOOM_MAX)

  return {
    seed,
    palette,
    flowerFieldSeed: seed + SEED_OFFSETS.flowerField,
    meadowLayoutSeed: seed + SEED_OFFSETS.meadowLayout,
    terrainShapeSeed: seed + SEED_OFFSETS.terrainShape,
    environmentSeed: seed + SEED_OFFSETS.environment,
    camera,
    shotPresetName: shotPreset.name,
    skyBloomAim,
    skyBloomGroundY,
    focusDistance,
    bloomIntensity,
    wind,
    drama,
    motionBlurStrength,
    motionBlurDirectionAngle,

    cameraMovementMultiplier: 1,
    lightingOvercast: 1,
    lightingWarmth: 1,
    lightingShadowDepth: 1,
    flowerDensity: 1,
    flowerScale: 1,
    // Zeroed for Baby Blue Eyes and Lupine specifically — both are meant to
    // be a field of *one* flower colour (blue, yellow respectively), and the
    // poppy accent (flowerField/palette.ts's `rollIsPoppy`) is deliberately
    // independent of the active palette so a stray warm poppy can show up
    // regardless of mood; that's the right default for every other palette
    // here, but it's exactly the "why is there an off-colour flower in my
    // single-colour field" report both of these got.
    poppyAccentProbability: palette.name === 'Baby Blue Eyes' || palette.name === 'Lupine' ? 0 : 0.15,
    hueShiftDeg: 0,
    hazeAmount,
    softness: 1,
    fogDensityMultiplier: 1,
    maxBlur: CAMERA_CONFIG.dof.maxBlur,
    fStop: CAMERA_CONFIG.dof.fStop,
    highlightBloomIntensity: POST_PROCESSING_CONFIG.highlightBloom.intensity,
    exposureAmount: 1,
    brightnessAmount: 0,
    highlightsAmount: 0,
    shadowsAmount: 0,
    contrastAmount: 1,
    vibranceAmount: 1,
    grainAmount,
    grainSize: 1,
    grassDensity: 1,
    grassHeight: 1,
    grassWidth: 1,
    fov: shotPreset.fovOverrideDeg ?? CAMERA_CONFIG.fov / zoom,
    zoom,
  }
}

/**
 * Upper bound for a seed — shared with GenerativeProvider.tsx's Scene fold
 * slider (`max`) so `randomSeed()` never produces a value the slider would
 * silently clamp down to its max, which would make every "New Random
 * Scene"/fresh-load seed collapse to the same clamped number.
 */
export const SEED_MAX = 999_999

/** A fresh random seed within `SEED_MAX`, for when no `?seed=` override is present. */
export function randomSeed(): number {
  return Math.floor(Math.random() * (SEED_MAX + 1))
}
