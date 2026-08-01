import { CAMERA_CONFIG } from '../camera/config'
import { POST_PROCESSING_CONFIG } from '../effects/config'
import type { ColorPalette } from './palette'
import { findPaletteByName, PALETTES } from './palette'
import { createRng, range } from './random'

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
    focusDistance: 14,
  },
  {
    // Tight single-subject crop — camera pulls in noticeably closer to the focal cluster.
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
    focusDistance: 10,
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

  // --- Creative-control defaults (see class docstring) ---
  /** Camera fold "Movement" — scales HandheldDrift + CameraSweep amplitude together. 1 = as tuned. */
  cameraMovementMultiplier: number
  /** Lighting fold "Overcast" — scales the hemisphere/ambient sky light together. 1 = as tuned. */
  lightingOvercast: number
  /** Lighting fold "Warmth" — scales how much `highlight`/`shadow` tint the lights. 1 = as tuned. */
  lightingWarmth: number
  /** Lighting fold "Shadow Depth" — scales the two directional lights' intensity (more = more defined shadow hint). 1 = as tuned. */
  lightingShadowDepth: number
  /** Flowers fold "Density" — multiplies flowerCount. 1 = as tuned. */
  flowerDensity: number
  /** Flowers fold "Scale" — multiplies every band's flower-scale range. 1 = as tuned. */
  flowerScale: number
  /** Flowers fold "Poppy Accent" — probability a flower uses the fixed hue-27 orange instead of the palette's own dominantHues. */
  poppyAccentProbability: number
  /** Colour fold "Hue Shift" — degrees every palette colour is rotated by before use. 0 = as picked. */
  hueShiftDeg: number
  /** Atmosphere fold "Haze" — scales AtmosphericHazeEffect's haze + volumetric strength together. 1 = as tuned. */
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
  /** Colour fold "Contrast" — scales PaletteGradePass's contrast pivot. 1 = as tuned. */
  contrastAmount: number
  /** Colour fold "Vibrance" — scales PaletteGradePass's vibrance boost. 1 = as tuned. */
  vibranceAmount: number
  /** Film fold "Grain Amount" — scales FilmGrainPass's opacity. 1 = as tuned. */
  grainAmount: number
  /** Film fold "Grain Size" — scales FilmGrainPass's grain cell size. 1 = as tuned. */
  grainSize: number
  /** Grass fold "Density" — multiplies ENVIRONMENT_CONFIG.grass.count. 1 = as tuned. */
  grassDensity: number
  /** Grass fold "Height" — multiplies each blade's height range. 1 = as tuned. */
  grassHeight: number
  /** Grass fold "Width" — multiplies each blade's width independently of height. 1 = as tuned. */
  grassWidth: number
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

    cameraMovementMultiplier: 1,
    lightingOvercast: 1,
    lightingWarmth: 1,
    lightingShadowDepth: 1,
    flowerDensity: 1,
    flowerScale: 1,
    poppyAccentProbability: 0.15,
    hueShiftDeg: 0,
    hazeAmount: 1,
    softness: 1,
    fogDensityMultiplier: 1,
    maxBlur: CAMERA_CONFIG.dof.maxBlur,
    fStop: CAMERA_CONFIG.dof.fStop,
    highlightBloomIntensity: POST_PROCESSING_CONFIG.highlightBloom.intensity,
    contrastAmount: 1,
    vibranceAmount: 1,
    grainAmount: 1,
    grainSize: 1,
    grassDensity: 1,
    grassHeight: 1,
    grassWidth: 1,
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
