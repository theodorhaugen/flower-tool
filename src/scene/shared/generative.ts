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
}

export interface DeriveGenerativeStateOptions {
  /** Pins a specific palette by exact name, overriding whatever the seed would have picked — for tuning/screenshotting one deliberately. */
  forcePaletteName?: string
}

/**
 * Derives the render's entire generative state from one integer seed. Pure
 * function — same `seed` (and `forcePaletteName`) always produce the exact
 * same state.
 */
export function deriveGenerativeState(seed: number, { forcePaletteName }: DeriveGenerativeStateOptions = {}): GenerativeState {
  const paletteRng = createRng(seed + SEED_OFFSETS.palette)
  const rolledPalette = PALETTES[Math.floor(paletteRng() * PALETTES.length)]
  const palette = (forcePaletteName && findPaletteByName(forcePaletteName)) || rolledPalette

  // Varies around CAMERA_CONFIG's carefully-composed base framing (45°
  // macro angle, off-axis target) rather than anything unbounded — every
  // seed should still look like a deliberate macro-photography shot, not a
  // randomly-aimed camera.
  const cameraRng = createRng(seed + SEED_OFFSETS.camera)
  const [baseX, baseY, baseZ] = CAMERA_CONFIG.position
  const [targetX, targetY, targetZ] = CAMERA_CONFIG.target
  const camera: GenerativeCamera = {
    position: [
      baseX + range(cameraRng, -3, 3),
      baseY + range(cameraRng, -1.2, 1.2),
      baseZ + range(cameraRng, -2, 2),
    ],
    target: [targetX + range(cameraRng, -3, 3), targetY, targetZ + range(cameraRng, -3, 3)],
  }

  // Both vary around CAMERA_CONFIG.dof/POST_PROCESSING_CONFIG.bloom's own
  // tuned base value, same reasoning as the camera position above — a
  // deliberately-tuned centre with generative spread around it, not an
  // arbitrary absolute range.
  const focusRng = createRng(seed + SEED_OFFSETS.focus)
  const focusDistance = CAMERA_CONFIG.dof.focusDistance + range(focusRng, -5, 6)

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
  }
}

/** A fresh random 32-bit seed, for when no `?seed=` override is present. */
export function randomSeed(): number {
  return Math.floor(Math.random() * 2 ** 31)
}
