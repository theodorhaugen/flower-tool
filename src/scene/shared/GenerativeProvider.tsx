import { button, useControls } from 'leva'
import type { ReactNode } from 'react'
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { CAMERA_CONFIG } from '../camera/config'
import { installFlowerToolDebugHook } from './debugHook'
import { deriveGenerativeState, randomSeed, SEED_MAX, ZOOM_MAX, ZOOM_MIN } from './generative'
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

/** Raw `ZOOM_MIN`-`ZOOM_MAX` divisor -> the 0-1 fraction the Zoom slider displays/drags. */
function normalizeZoom(zoom: number): number {
  return (zoom - ZOOM_MIN) / (ZOOM_MAX - ZOOM_MIN)
}

/** Inverse of `normalizeZoom` — slider's 0-1 fraction -> the raw divisor `fov` is actually computed from. */
function denormalizeZoom(fraction: number): number {
  return ZOOM_MIN + fraction * (ZOOM_MAX - ZOOM_MIN)
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
 *
 * This is also the one place holding every fold's Leva `set` function, so
 * it's what installs `window.__flowerToolDebug` (shared/debugHook.ts) —
 * a scriptable, DOM-independent equivalent of dragging each fold's
 * sliders, built for automated testing/verification that shouldn't have
 * to depend on Leva's own DOM structure (and won't have anything to grab
 * onto at all once a custom UI replaces the rendered panel).
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
  const [cameraControls, setCameraFold] = useControls(
    'Camera',
    () => ({
      height: { value: base.camera.position[1], min: CAMERA_CONFIG.position[1] - 7, max: CAMERA_CONFIG.position[1] + 8, label: 'Height' },
      distance: { value: base.camera.position[2], min: CAMERA_CONFIG.position[2] - 5, max: CAMERA_CONFIG.position[2] + 4, label: 'Distance' },
      pan: { value: base.camera.target[0], min: CAMERA_CONFIG.target[0] - 5, max: CAMERA_CONFIG.target[0] + 5, label: 'Pan' },
      // A real optical zoom — narrows/widens the lens's actual field of
      // view (MainCamera.tsx), not a dolly (Distance above moves the
      // camera itself, changing perspective/parallax along with framing;
      // this changes only the framing/compression, the way swapping lenses
      // does). Inverted from the raw FOV value (fov = base / zoom) so
      // dragging this slider right reads as "more zoomed in" the way every
      // camera zoom control does, rather than a raw, non-intuitive FOV
      // number where smaller is actually more zoomed in.
      //
      // Dragged/displayed as a 0-1 fraction of the usable band
      // (`ZOOM_MIN`-`ZOOM_MAX`, generative.ts — see `normalizeZoom`/
      // `denormalizeZoom` above) rather than that raw 1.5-2.0 divisor
      // directly: a 0.5-wide raw span reads as an oddly cramped slider,
      // where 0-1 matches this app's own "how much" convention (Blur
      // Amount, Aperture, etc.) — and, unlike those, this range really is
      // the *entire* usable band rather than a soft "1 = as tuned" middle,
      // so 0-1 fits it exactly with nothing left over. Seed-derived
      // starting point (`base.zoom`) rather than a flat default — same
      // reasoning as Blur Length/Haze/Grain above; `zoom`'s own docstring
      // covers why that seed draw used to be silently ignored.
      zoom: { value: normalizeZoom(base.zoom), min: 0, max: 1, label: 'Zoom' },
      // A direct value (like `focusDistance`/`maxBlur` in the Lens fold
      // below), not a multiplier on top of the seed's own pick — dragging
      // this slider replaces which "how blurred" this render is, the same
      // way dragging Focus Distance replaces where it's focused. Range
      // matches `motionBlurStrength`'s own natural floor/ceiling exactly
      // (shared/generative.ts) rather than extending past it — min used to
      // be 0.15, so the slider could never actually reach zero sweep; max
      // used to be 1.9, past camera/config.ts's `maxRotationAmplitudeDeg`
      // clamp, so the top of the slider's travel did nothing. 0 now means a
      // genuinely motionless sweep (CameraSweep.tsx's amplitude is a
      // straight multiply, so 0 in means 0 out); 1.7 lands exactly on that
      // clamp, a strong but still-recognisable streak rather than past it.
      blurLength: { value: base.motionBlurStrength, min: 0, max: 1.7, label: 'Blur Length' },
      blurDirection: { value: THREE.MathUtils.radToDeg(base.motionBlurDirectionAngle), min: 0, max: 360, label: 'Blur Direction' },
    }),
    [seed],
  )

  // --- Lighting: mood knobs, not raw light colours/intensities ---
  const [lightingControls, setLightingFold] = useControls(
    'Lighting',
    () => ({
      overcast: { value: 1, min: 0.4, max: 1.8, label: 'Overcast' },
      warmth: { value: 1, min: 0, max: 2, label: 'Warmth' },
      shadowDepth: { value: 1, min: 0, max: 2.5, label: 'Shadow Depth' },
    }),
    [seed],
  )

  // --- Flowers: how many, how big, how often the poppy accent shows up — not petal-level jitter ---
  const [flowerControls, setFlowersFold] = useControls(
    'Flowers',
    () => ({
      density: { value: 1, min: 0.2, max: 1.6, label: 'Density' },
      scale: { value: 1, min: 0.5, max: 1.8, label: 'Scale' },
      // Capped well under 0.5 — this is a per-plant probability
      // (generateFlowerField.ts's `rollIsPoppy`) that also forces the
      // plant's species to a single poppy bloom, so above ~0.5 the "accent"
      // stops being an accent and becomes the field's actual majority
      // species, drowning out the active palette's own petal anchors and
      // the umbel/spike structural variety this fold's Density/Scale are
      // meant to be shaping. 0.35 still reaches "poppies everywhere" well
      // past the tuned default (0.15) without crossing into "this is just
      // a poppy field now."
      poppyAccent: { value: base.poppyAccentProbability, min: 0, max: 0.35, label: 'Poppy Accent' },
    }),
    [seed],
  )

  // --- Colour: which palette, hue shift, plus manual tone-editing controls — not the raw shader strengths ---
  const [colourControls, setColourFold] = useControls(
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
  const [atmosphereControls, setAtmosphereFold] = useControls(
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
  const [lensControls, setLensFold] = useControls(
    'Lens',
    () => ({
      // Anchored to this seed's own composition (base.focusDistance), the
      // same pattern Camera > Height/Distance/Pan already use, rather than
      // a flat absolute 5-35 world-unit range: the actual in-focus band the
      // thin-lens DOF math produces at this rig's aperture/focal-length is
      // only ~1-3 world units wide (LensOpticsDepthOfFieldEffect.ts), so a
      // range this much wider than that meant an entirely ordinary drag —
      // not even an extreme one — could push every last thing in frame
      // outside the sharp band at once, with nothing left in focus
      // anywhere. Anchoring keeps the full useful "rack focus forward/back
      // through this composition" travel while making it much harder to
      // wander that far off the actual subject by accident.
      focusDistance: { value: base.focusDistance, min: base.focusDistance - 7, max: base.focusDistance + 8, label: 'Focus Distance' },
      blurAmount: { value: base.maxBlur, min: 0.2, max: 3, label: 'Blur Amount' },
      aperture: { value: base.fStop, min: 0.5, max: 4, label: 'Aperture' },
      glowIntensity: { value: base.bloomIntensity, min: 0, max: 1, label: 'Glow Intensity' },
      highlightBloom: { value: base.highlightBloomIntensity, min: 0, max: 1.5, label: 'Highlight Bloom' },
    }),
    [seed],
  )

  // --- Film: emulsion grain — not exposed anywhere else since it's purely a "look", not a scene property. Grain Amount's own initial value is seed-derived (base.grainAmount, see shared/generative.ts's `drama`) — Grain Size stays flat, see that field's docstring for why. ---
  const [filmControls, setFilmFold] = useControls(
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
  const [grassControls, setGrassFold] = useControls(
    'Grass',
    () => ({
      density: { value: 1, min: 0.3, max: 3, label: 'Density' },
      height: { value: 1, min: 0.4, max: 1.4, label: 'Height' },
      width: { value: 1, min: 0.4, max: 2, label: 'Width' },
    }),
    [seed],
  )

  // Every fold above passes `[seed]` as its `useControls` deps array,
  // believing that resets each control back to that seed's own
  // `base.xxx` value on reseed — it doesn't. Leva's `deps` only refreshes a
  // control's *settings* (min/max/label/options) once its path already
  // exists; verified directly against leva's own store implementation
  // (`addData`'s "override" pass explicitly destructures `value` out of
  // what it's willing to overwrite). In practice every one of these
  // "seed-derived" values — blur strength/direction, haze, grain, focus
  // distance, bloom, palette, poppy-accent probability, camera framing —
  // stayed frozen at whatever the *first* seed on page load happened to
  // roll, for the rest of the session, no matter how many times the seed
  // changed afterwards; only the raw sub-seeds never routed through a Leva
  // control (flower placement/species/colour, meadow layout, terrain,
  // wind timing) actually varied. Explicitly pushing each fold back to its
  // fresh defaults via its own `set` function — the same mechanism the
  // debug hook's setters already use — is what actually resets them, the
  // same "reset to the new seed's defaults, don't carry a manual tweak
  // across an unrelated new composition" behaviour the folds above already
  // claim to have.
  useEffect(() => {
    setCameraFold({
      height: base.camera.position[1],
      distance: base.camera.position[2],
      pan: base.camera.target[0],
      zoom: normalizeZoom(base.zoom),
      blurLength: base.motionBlurStrength,
      blurDirection: THREE.MathUtils.radToDeg(base.motionBlurDirectionAngle),
    })
    setLightingFold({ overcast: 1, warmth: 1, shadowDepth: 1 })
    setFlowersFold({ density: 1, scale: 1, poppyAccent: base.poppyAccentProbability })
    setColourFold({
      palette: base.palette.name,
      hueShift: 0,
      exposure: 1,
      brightness: 0,
      contrast: 1,
      highlights: 0,
      shadows: 0,
      vibrance: 1,
    })
    setAtmosphereFold({ haze: base.hazeAmount, softness: 1, fog: 1, windStrength: base.wind.strength })
    setLensFold({
      focusDistance: base.focusDistance,
      blurAmount: base.maxBlur,
      aperture: base.fStop,
      glowIntensity: base.bloomIntensity,
      highlightBloom: base.highlightBloomIntensity,
    })
    setFilmFold({ grainAmount: base.grainAmount, grainSize: 1 })
    setGrassFold({ density: 1, height: 1, width: 1 })
    // Deliberately keyed on `seed` alone, not every `base.xxx`/setter this
    // reads — matches every fold's own (currently-ineffective) `[seed]`
    // deps array above, and firing this only on an actual reseed (not
    // every unrelated re-render) is the whole point.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [seed])

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
      fov: CAMERA_CONFIG.fov / denormalizeZoom(cameraControls.zoom),
      zoom: denormalizeZoom(cameraControls.zoom),
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

  // `state` is a fresh object every render — this ref is what lets
  // `getState()` below hand back the *latest* one from an arbitrary,
  // later point in time (a Playwright `page.evaluate` call has no idea
  // when React last rendered) rather than a stale closure over whichever
  // render happened to be current when the debug hook was installed.
  const stateRef = useRef(state)
  stateRef.current = state

  useEffect(() => {
    installFlowerToolDebugHook({
      getState: () => stateRef.current,
      setScene: (partial) => setScene(partial),
      setCamera: (partial) => setCameraFold(partial),
      setLighting: (partial) => setLightingFold(partial),
      setFlowers: (partial) => setFlowersFold(partial),
      setColour: (partial) => setColourFold(partial),
      setAtmosphere: (partial) => setAtmosphereFold(partial),
      setLens: (partial) => setLensFold(partial),
      setFilm: (partial) => setFilmFold(partial),
      setGrass: (partial) => setGrassFold(partial),
    })
  }, [setScene, setCameraFold, setLightingFold, setFlowersFold, setColourFold, setAtmosphereFold, setLensFold, setFilmFold, setGrassFold])

  return <GenerativeContext.Provider value={state}>{children}</GenerativeContext.Provider>
}
