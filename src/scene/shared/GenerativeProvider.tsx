import { button, useControls } from 'leva'
import type { ReactNode } from 'react'
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { CAMERA_CONFIG } from '../camera/config'
import { deriveGenerativeState, randomSeed, SEED_MAX } from './generative'
import type { GenerativeState } from './generative'
import { GenerativeContext } from './generativeContext'
import { PALETTES, shiftPaletteHue } from './palette'
import { requestReroll } from './virtualClock'

interface GenerativeProviderProps {
  children: ReactNode
  /** Pins a specific integer seed, overridden by a `?seed=` URL param if present — for tuning/reproducing one deliberately instead of getting a random one. */
  forceSeed?: number
  /** Pins a specific palette by name (see palette.ts's `PALETTES`), overridden by a `?palette=` URL param if present. */
  forcePaletteName?: string
}

const PALETTE_NAMES = PALETTES.map((p) => p.name)

function readUrlParams(): { seedParam: string | null; paletteParam: string | null } {
  if (typeof window === 'undefined') return { seedParam: null, paletteParam: null }
  const params = new URLSearchParams(window.location.search)
  return { seedParam: params.get('seed'), paletteParam: params.get('palette') }
}

/**
 * Wraps into the Scene fold's displayable [0, SEED_MAX] range rather than
 * clamping — clamping would silently collapse every out-of-range seed
 * (any `?seed=` value, or `forceSeed` prop, above SEED_MAX) down to the
 * exact same number, which is a real bug: Leva's number control clamps a
 * `value` outside its own min/max, so an unwrapped seed of e.g. 50,000,000
 * would render fine internally but *display and actually use* SEED_MAX
 * instead, silently breaking reproducibility for every large seed at once.
 */
function wrapSeed(seed: number): number {
  return ((seed % (SEED_MAX + 1)) + (SEED_MAX + 1)) % (SEED_MAX + 1)
}

/**
 * Picks the one integer seed this render belongs to, derives every
 * generative axis from it (see shared/generative.ts), and layers a
 * designer-facing Leva panel on top — every fold's controls initialise
 * from that seed's own derived values (so a fresh seed still looks
 * considered) but are then live-editable, and reset to the new seed's
 * defaults whenever the seed changes (Scene's "New Random Scene" button,
 * or a fresh page load) rather than carrying a manual tweak across an
 * otherwise-unrelated new composition.
 *
 * Deliberately hides the technical parameters those creative controls sit
 * on top of (rings/samples, noise frequencies, per-effect internal
 * strengths, ...) — see each fold below for exactly what's exposed and
 * why. Every subsystem still reads the result via `useGenerative()`/
 * `usePalette()` (generativeContext.ts), unchanged — this is the one place
 * that merges "what the seed picked" with "what the panel overrode".
 *
 * Also readable from `?seed=12345` (and `?palette=Golden%20hour%20meadow` to
 * additionally pin just the palette) URL query params, which seed the
 * Scene fold's initial value — a zero-friction way to reproduce or pin a
 * specific render without the panel. The chosen seed is logged to the
 * console on load specifically so a render worth keeping can be noted
 * down and revisited later.
 */
export function GenerativeProvider({ children, forceSeed, forcePaletteName }: GenerativeProviderProps) {
  // Resolved once, on mount — not re-derived on re-render, same reasoning
  // the previous non-Leva version used.
  const initial = useRef<{ seed: number; paletteParam: string | null } | null>(null)
  if (!initial.current) {
    const { seedParam, paletteParam } = readUrlParams()
    const parsedSeedParam = seedParam !== null && seedParam !== '' ? Number(seedParam) : Number.NaN
    const seed = wrapSeed(Number.isFinite(parsedSeedParam) ? parsedSeedParam : forceSeed ?? randomSeed())
    initial.current = { seed, paletteParam }
  }
  const { seed: initialSeed, paletteParam } = initial.current

  // --- Scene: the one control that changes *what* got generated, not just how it's dressed ---
  const [{ seed }, setScene] = useControls('Scene', () => ({
    seed: { value: initialSeed, min: 0, max: SEED_MAX, step: 1, label: 'Seed' },
  }))
  useControls('Scene', () => ({ 'New Random Scene': button(() => setScene({ seed: randomSeed() })) }), [setScene])
  // The scene settles into one reproducible still per seed+parameter-set
  // (shared/SettleDriver.tsx) rather than animating forever — this is the
  // deliberate way to see a *different* settled moment (streak/wind phase)
  // without touching the seed or any other parameter.
  useControls('Scene', () => ({ 'Reroll Still': button(() => requestReroll()) }))

  const base = useMemo(
    () => deriveGenerativeState(seed, { forcePaletteName: paletteParam ?? forcePaletteName }),
    [seed, paletteParam, forcePaletteName],
  )

  // --- Camera: spatial framing + how much the shot moves, not the raw lens/rig numbers ---
  // height/distance bounds are widened past the base pose's own ±3/±4 jitter
  // to cover every shot preset's spread (shared/generative.ts's
  // CAMERA_SHOT_PRESETS — the low worm's-eye/elevated/tight-crop presets all
  // push position further than the classic macro shot alone did) — without
  // this, Leva would silently clamp a non-classic preset's initial value
  // right back into the old, narrower range.
  //
  // There used to be a separate "Movement" dial here too, scaling
  // HandheldDrift's tremor and CameraSweep's sweep together — on top of
  // Blur Length *also* scaling the sweep, that was two overlapping dials
  // for what's really one effect, needing constant joint fine-tuning to
  // avoid over/under-shooting. `cameraMovementMultiplier` is now a fixed
  // baseline (see shared/generative.ts — always 1, no longer Leva-exposed)
  // so Blur Length alone controls the sweep/streak's whole strength.
  const [cameraControls] = useControls(
    'Camera',
    () => ({
      height: { value: base.camera.position[1], min: CAMERA_CONFIG.position[1] - 7, max: CAMERA_CONFIG.position[1] + 8, label: 'Height' },
      distance: { value: base.camera.position[2], min: CAMERA_CONFIG.position[2] - 5, max: CAMERA_CONFIG.position[2] + 4, label: 'Distance' },
      pan: { value: base.camera.target[0], min: CAMERA_CONFIG.target[0] - 5, max: CAMERA_CONFIG.target[0] + 5, label: 'Pan' },
      // A direct value (like `focusDistance`/`maxBlur` in the Lens fold
      // below), not a multiplier on top of the seed's own pick — dragging
      // this slider replaces which "how blurred" this render is, the same
      // way dragging Focus Distance replaces where it's focused. Still
      // clamped at the physical-sweep level (camera/config.ts's
      // `maxRotationAmplitudeDeg`) so it alone can't swing the camera far
      // enough off-scene to lose all structure — see CameraSweep.tsx.
      blurLength: { value: base.motionBlurStrength, min: 0.15, max: 1.9, label: 'Blur Length' },
      blurDirection: { value: THREE.MathUtils.radToDeg(base.motionBlurDirectionAngle), min: 0, max: 360, label: 'Blur Direction' },
    }),
    [seed],
  )

  // --- Lighting: mood knobs, not raw light colours/intensities ---
  const [lightingControls] = useControls(
    'Lighting',
    () => ({
      overcast: { value: 1, min: 0.4, max: 1.8, label: 'Overcast' },
      warmth: { value: 1, min: 0, max: 2, label: 'Warmth' },
      shadowDepth: { value: 1, min: 0, max: 2.5, label: 'Shadow Depth' },
    }),
    [seed],
  )

  // --- Flowers: how many, how big, how often the poppy accent shows up — not petal-level jitter ---
  const [flowerControls] = useControls(
    'Flowers',
    () => ({
      density: { value: 1, min: 0.2, max: 1.6, label: 'Density' },
      scale: { value: 1, min: 0.5, max: 1.8, label: 'Scale' },
      poppyAccent: { value: base.poppyAccentProbability, min: 0, max: 0.6, label: 'Poppy Accent' },
    }),
    [seed],
  )

  // --- Colour: which palette, hue shift, plus manual tone-editing controls — not the raw shader strengths ---
  const [colourControls] = useControls(
    'Colour',
    () => ({
      palette: { value: base.palette.name, options: PALETTE_NAMES, label: 'Palette' },
      hueShift: { value: 0, min: -180, max: 180, label: 'Hue Shift' },
      exposure: { value: 1, min: 0.3, max: 2.5, label: 'Exposure' },
      brightness: { value: 0, min: -0.4, max: 0.4, label: 'Brightness' },
      contrast: { value: 1, min: 0.5, max: 1.8, label: 'Contrast' },
      highlights: { value: 0, min: -0.4, max: 0.4, label: 'Highlights' },
      shadows: { value: 0, min: -0.4, max: 0.4, label: 'Shadows' },
      vibrance: { value: 1, min: 0, max: 2.5, label: 'Vibrance' },
    }),
    [seed],
  )

  // --- Atmosphere: haze/softness/fog/wind "amount" — not each effect's internal shader knobs. Haze's own initial value is seed-derived (base.hazeAmount, see shared/generative.ts's `drama`), same pattern as Camera > Blur Length. ---
  const [atmosphereControls] = useControls(
    'Atmosphere',
    () => ({
      haze: { value: base.hazeAmount, min: 0, max: 2.5, label: 'Haze' },
      softness: { value: 1, min: 0, max: 2.5, label: 'Softness' },
      fog: { value: 1, min: 0, max: 2.5, label: 'Fog' },
      windStrength: { value: base.wind.strength, min: 0, max: 0.5, label: 'Wind' },
    }),
    [seed],
  )

  // --- Lens: the optical character (focus/blur/aperture/glow) — not rings/samples/meters-per-unit ---
  const [lensControls] = useControls(
    'Lens',
    () => ({
      focusDistance: { value: base.focusDistance, min: 5, max: 35, label: 'Focus Distance' },
      blurAmount: { value: base.maxBlur, min: 0.2, max: 3, label: 'Blur Amount' },
      aperture: { value: base.fStop, min: 0.5, max: 4, label: 'Aperture' },
      glowIntensity: { value: base.bloomIntensity, min: 0, max: 1, label: 'Glow Intensity' },
      highlightBloom: { value: base.highlightBloomIntensity, min: 0, max: 1.5, label: 'Highlight Bloom' },
    }),
    [seed],
  )

  // --- Film: emulsion grain — not exposed anywhere else since it's purely a "look", not a scene property. Grain Amount's own initial value is seed-derived (base.grainAmount, see shared/generative.ts's `drama`) — Grain Size stays flat, see that field's docstring for why. ---
  const [filmControls] = useControls(
    'Film',
    () => ({
      grainAmount: { value: base.grainAmount, min: 0, max: 3, label: 'Grain Amount' },
      grainSize: { value: 1, min: 0.5, max: 4, label: 'Grain Size' },
    }),
    [seed],
  )

  // --- Grass: how much, how tall, how thick — not the blade taper/jitter shape itself ---
  // Height/Width capped well under where a naive "as wide as it can go"
  // range would let them run — environment/config.ts's own comment
  // documents blades already tuned to sit just under flower-stem height at
  // 1x; ENVIRONMENT_CONFIG.grass.heightRange scaled by ~1.45 already
  // reaches the taller range that comment says was found regularly
  // occluding blooms, so a naive max well past that (2.2 previously)
  // reopens the exact bug that range was tightened to fix. Same reasoning
  // for Width, capped tighter than a literal 3x since generateGrass.ts's
  // scale also multiplies width by the *height* multiplier.
  const [grassControls] = useControls(
    'Grass',
    () => ({
      density: { value: 1, min: 0.3, max: 3, label: 'Density' },
      height: { value: 1, min: 0.4, max: 1.4, label: 'Height' },
      width: { value: 1, min: 0.4, max: 2, label: 'Width' },
    }),
    [seed],
  )

  const state: GenerativeState = useMemo(() => {
    const palette = shiftPaletteHue(
      PALETTES.find((p) => p.name === colourControls.palette) ?? base.palette,
      colourControls.hueShift,
    )

    return {
      ...base,
      palette,
      camera: {
        position: [base.camera.position[0], cameraControls.height, cameraControls.distance],
        target: [cameraControls.pan, base.camera.target[1], base.camera.target[2]],
      },
      focusDistance: lensControls.focusDistance,
      bloomIntensity: lensControls.glowIntensity,
      maxBlur: lensControls.blurAmount,
      fStop: lensControls.aperture,
      highlightBloomIntensity: lensControls.highlightBloom,
      wind: { ...base.wind, strength: atmosphereControls.windStrength },
      motionBlurStrength: cameraControls.blurLength,
      motionBlurDirectionAngle: THREE.MathUtils.degToRad(cameraControls.blurDirection),
      lightingOvercast: lightingControls.overcast,
      lightingWarmth: lightingControls.warmth,
      lightingShadowDepth: lightingControls.shadowDepth,
      flowerDensity: flowerControls.density,
      flowerScale: flowerControls.scale,
      poppyAccentProbability: flowerControls.poppyAccent,
      hueShiftDeg: colourControls.hueShift,
      exposureAmount: colourControls.exposure,
      brightnessAmount: colourControls.brightness,
      highlightsAmount: colourControls.highlights,
      shadowsAmount: colourControls.shadows,
      contrastAmount: colourControls.contrast,
      vibranceAmount: colourControls.vibrance,
      hazeAmount: atmosphereControls.haze,
      softness: atmosphereControls.softness,
      fogDensityMultiplier: atmosphereControls.fog,
      grainAmount: filmControls.grainAmount,
      grainSize: filmControls.grainSize,
      grassDensity: grassControls.density,
      grassHeight: grassControls.height,
      grassWidth: grassControls.width,
    }
  }, [
    base,
    cameraControls,
    lightingControls,
    flowerControls,
    colourControls,
    atmosphereControls,
    lensControls,
    filmControls,
    grassControls,
  ])

  useEffect(() => {
    // Deliberately logs base.palette/base.drama (the seed's own picks), not
    // the possibly-overridden state — this fires once per reseed, not once
    // per Colour-fold tweak, so it isn't spammed on every slider drag.
    console.info(
      `[flower-tool] seed=${base.seed} palette="${base.palette.name}" drama=${base.drama.toFixed(2)} — reproduce with ?seed=${base.seed}`,
    )
  }, [base])

  return <GenerativeContext.Provider value={state}>{children}</GenerativeContext.Provider>
}
