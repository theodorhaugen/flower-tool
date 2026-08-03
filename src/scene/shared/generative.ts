import { CAMERA_CONFIG } from '../camera/config'
import { POST_PROCESSING_CONFIG } from '../effects/config'
import type { ColorPalette } from './palette'
import { findPaletteByName, PALETTES } from './palette'
import { createRng, gaussianish, range } from './random'

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
} as const

export interface GenerativeCamera {
  position: readonly [number, number, number]
  target: readonly [number, number, number]
}

type OffsetRange = readonly [number, number]

interface CameraShotPreset {
  /** Selection weight, relative to the other presets — doesn't need to sum to 1. */
  weight: number
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
 * different composition. These four discrete presets (picked per seed, then
 * jittered *within* the picked preset the same way the old single band was)
 * give real compositional variety instead: a classic dead-on macro, a low
 * worm's-eye looking up into the blooms, an elevated near-top-down look, and
 * a tighter single-subject crop. `classic` keeps most of the weight so the
 * field still mostly reads as the deliberately-composed base shot — the
 * others are a meaningful minority, not a coin flip.
 */
const CAMERA_SHOT_PRESETS: readonly CameraShotPreset[] = [
  {
    // Classic macro — the original tuned base framing's own jitter band, unchanged.
    weight: 0.55,
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
    // Low worm's-eye — camera drops near ground level and looks up into the field instead of steeply down.
    // focusDistance left at the classic-shot-era value: this composition's
    // dominant subject is the near flowers looming close to the lens (the
    // whole point of "looking up into the blooms"), not a ground-plane
    // intersection far out — a straight-line-of-sight ground raycast for
    // this preset lands anywhere from ~15 to ~44 world units depending on
    // seed jitter alone (grazing-angle distance estimates blow up exactly
    // like this), too unstable to retune against with any confidence. The
    // other three presets' raycast distances varied by seed by well under
    // 2 units; this one swung by over 20. Left alone pending a live-render
    // check rather than risk retuning against a proxy this seed-sensitive.
    weight: 0.15,
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
    // Elevated — camera rises well above the base height, steepening the look-down angle towards near-top-down.
    // focusDistance retuned 14 → 18: this composition's own camera→target
    // geometry puts the near flower content the bottom of frame actually
    // shows at ~18-20 world units (computed by casting a ray at the
    // bottom-of-frame vertical angle from this preset's position/target
    // down to the ground plane, averaged across many seeds — consistent to
    // within ~1 unit across seeds, unlike worm's-eye above), not the 14 it
    // was set to — invisible before fixing CIRCLE_OF_CONFUSION above only
    // because *everything* rendered at max blur regardless of focus
    // distance.
    weight: 0.15,
    positionOffset: [
      [-2, 2],
      [4, 7],
      [-1, 1],
    ],
    targetOffset: [
      [-2, 2],
      [-3, -1],
      [-2, 2],
    ],
    focusDistance: 18,
  },
  {
    // Tight single-subject crop — camera pulls in noticeably closer to the focal cluster.
    // focusDistance retuned 10 → 13, same reasoning/method as `elevated`
    // above: this preset's own geometry puts its near ground content at
    // ~13 world units, consistently across seeds, not the 10 it was set to.
    weight: 0.15,
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
  /** Camera fold "Zoom" — overrides CAMERA_CONFIG.fov (degrees). Narrower = more zoomed in/telephoto-compressed, wider = more zoomed out. As tuned. */
  fov: number
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
  const camera: GenerativeCamera = {
    position: [
      baseX + range(cameraRng, ...shotPreset.positionOffset[0]),
      baseY + range(cameraRng, ...shotPreset.positionOffset[1]),
      baseZ + range(cameraRng, ...shotPreset.positionOffset[2]),
    ],
    target: [
      targetX + range(cameraRng, ...shotPreset.targetOffset[0]),
      targetY + range(cameraRng, ...shotPreset.targetOffset[1]),
      targetZ + range(cameraRng, ...shotPreset.targetOffset[2]),
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
  const focusDistance = shotPreset.focusDistance + range(focusRng, -1.5, 1.5)

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

  // Wide on purpose — 0.2 barely sweeps at all (the residual blur comes
  // almost entirely from HandheldDrift's tiny tremor and wind sway, soft
  // enough to still read the underlying flower shapes) while 1.7 sweeps
  // meaningfully wider than the original fixed amplitude ever did (a
  // strongly directional, shape-erasing streak). Capped well under the
  // naive "as wide as it can go" ceiling: `rotationAmplitudeDeg`(20°) * 1.7
  // ≈ 34°, against a 22° vertical FOV — verified directly that going much
  // past this (an earlier version allowed up to 2.2, i.e. 44° peak swing)
  // let the camera swing far enough off the actual scene, for enough of the
  // accumulation window landing on empty sky/haze, that the blended result
  // lost *all* structure — flat noise, not a strong streak, a genuinely
  // different (broken) failure mode from what a wide sweep is supposed to
  // produce. Direction is a full circle, not just a left-right pan — see
  // CAMERA_CONFIG.sweep's docstring for why that used to always be
  // almost-pure yaw. The centre of the range now comes from `drama`
  // (see above) rather than rolling independently across the whole 0.2-1.7
  // span; the ±0.15 jitter on top keeps two similarly-dramatic seeds from
  // landing on the exact same strength.
  const motionBlurRng = createRng(seed + SEED_OFFSETS.motionBlur)
  const motionBlurCenter = 0.2 + (1.7 - 0.2) * drama
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
  const hazeRng = createRng(seed + SEED_OFFSETS.haze)
  const hazeCenter = 0.7 + (1.4 - 0.7) * drama
  const hazeAmount = Math.min(1.55, Math.max(0.55, hazeCenter + range(hazeRng, -0.1, 0.1)))

  const grainRng = createRng(seed + SEED_OFFSETS.grain)
  const grainCenter = 0.7 + (1.3 - 0.7) * drama
  const grainAmount = Math.min(1.45, Math.max(0.55, grainCenter + range(grainRng, -0.08, 0.08)))

  return {
    seed,
    palette,
    flowerFieldSeed: seed + SEED_OFFSETS.flowerField,
    meadowLayoutSeed: seed + SEED_OFFSETS.meadowLayout,
    terrainShapeSeed: seed + SEED_OFFSETS.terrainShape,
    environmentSeed: seed + SEED_OFFSETS.environment,
    camera,
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
    poppyAccentProbability: 0.15,
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
    fov: CAMERA_CONFIG.fov,
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
