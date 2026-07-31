# flower-tool

Procedural rendering engine for editorial blog imagery: soft, dreamy,
heavily defocused macro-photography-style flower compositions. Not
photoreal, not SVG-blob abstraction — atmospheric, organic, premium.

Built with Vite + React + TypeScript + React Three Fiber (Three.js) +
`@react-three/postprocessing`.

## Getting started

```bash
npm install
npm run dev
```

## Architecture

```
src/
  scene/
    SceneCanvas.tsx        R3F <Canvas> — renderer/color-management setup
    Experience.tsx         composition root for the scene graph
    camera/
      config.ts              lens tuning: fov, position/target, DoF, handheld drift, ICM sweep
      MainCamera.tsx          perspective camera, narrow fov, elevated ~45° down at the meadow
      CameraControls.tsx      orbit controls, off-axis target
      HandheldDrift.tsx       tiny per-frame tremor layered on top of the controls
      CameraSweep.tsx         wide, fast sine-wave pan — the motion that drives the ICM blur streak
    lighting/
      SceneLighting.tsx     overcast "sky dome" rig — hemisphere + ambient dominate, directional lights are just a whisper
    effects/
      config.ts                        every post-processing tuning knob
      PostProcessing.tsx               EffectComposer pipeline — bloom, DoF, atmospheric haze, bilateral soft, chromatic aberration, lens distortion, vignette, grain
      LensOpticsDepthOfField.tsx       R3F wrapper — constructs the effect below from camera/config.ts
      LensOpticsDepthOfFieldEffect.ts   the thin-lens circle-of-confusion Effect itself
      AtmosphericHaze.tsx              R3F wrapper — constructs the effect below from effects/config.ts
      AtmosphericHazeEffect.ts         custom Effect: depth-gated low-frequency haze + volumetric scatter
      BilateralSoft.tsx                R3F wrapper — constructs the effect below from effects/config.ts
      BilateralSoftEffect.ts           custom Effect: edge-aware (luminance-weighted) softening
      LensDistortion.tsx               R3F wrapper for postprocessing's (unwrapped) LensDistortionEffect
      LongExposureBlur.tsx             R3F wrapper — constructs the Pass below from effects/config.ts
      LongExposureBlurPass.ts          custom Pass: two-buffer temporal accumulation driven by CameraSweep, not a velocity-buffer streak
    shared/                 procedural primitives used by more than one system
      random.ts               seeded PRNG — same seed always reproduces the same output
      noise.ts                 layered value noise (fbm) + a 1D slice for path curves
      meadowLayout.ts          combines noise into density(x, z)/pathFactor(x, z)/clusterField(x, z)
      meadowLayoutConfig.ts    the one meadow layout both flowers and environment sample
      frustum.ts               "how wide/deep is the meadow" — keeps placement in sync with the camera
      terrainHeight.ts         layered-noise ground height, shared so flowers sit on it, not float above it
      terrainShapeConfig.ts    the one terrain shape both the environment mesh and the flowers sample
      taperedBlade.ts          deformed-plane geometry (taper/curl/twist/jitter) for petals, grass, leaves
      colorJitter.ts           small per-instance HSL nudge away from a base color
      instancing.ts / InstancedGroup.tsx   generic InstancedMesh renderer
    subjects/
      flowerField/            the flowers — see below
    environment/             the meadow the flowers grow in — see below
```

Each concern (camera, controls, lighting, environment, subject,
effects) is an independent, swappable component. Defocus-oriented
post effects (depth of field, grain, chromatic aberration) extend
`scene/effects/PostProcessing.tsx` without touching the rest of the
scene graph.

### Flower field (`subjects/flowerField/`)

Not botanically accurate by design — each "flower" is a small cluster
of translucent petals (randomized count, size, rotation, color, and
per-petal jitter). Nearly everything is instanced: a couple dozen
unique petal/center geometries (enough variety that repetition doesn't
read at a glance) each back one `InstancedMesh` with thousands of
per-instance transforms/colors, so it's a handful of draw calls
regardless of flower count.

Placement is meadow-like rather than uniformly random
(`shared/meadowLayout.ts`): a low-frequency noise field decides
roughly where the clusters and clearings are, a higher-frequency field
breaks up each cluster with texture, and the result is
contrast-sharpened into clear patches vs. gaps. One or more
low-frequency noise curves then carve winding, low-density "path"
corridors through it. Flowers are placed by rejecting/accepting
candidate positions against this density
(`generateFlowerField.ts`), so density varies continuously — no
hard-edged cluster shapes.

Depth reads in three bands (`config.ts`'s `depthBands`): a sparse
foreground of a few large blooms, a busy midground (the meadow's main
body), and a much smaller/simpler background haze — each band's flower
count comes from its approximate on-screen area times a density
multiplier, not a fixed share, so a near band (small on-screen area)
doesn't get packed as densely as a far one just because they were
each assigned "X% of the flowers."

Each flower's height comes from `shared/terrainHeight.ts` (the same
ground the environment's terrain mesh is built from) plus a stem —
`stemHeightFactorRange` × the flower's own scale, so bigger blooms sit
on proportionally taller stems — rather than an independent random
altitude, which is what used to make the field look like it was
floating above the grass instead of growing out of it.

**Petal materials** (`materials.ts`) are `MeshPhysicalMaterial`, not
plain `MeshStandardMaterial`, in service of a few things real
translucent tissue does that a flat tint can't:

- **Subsurface-like translucency** — alpha blending still carries the
  base "you can partly see through this" read (real `transmission`
  remains deliberately avoided: with tens of thousands of overlapping
  instances, its extra background-sampling pass and per-fragment
  refraction cost would multiply with the overdraw this scene already
  has). `sheen` adds a soft, cheap rim-light term on top — light
  catching a thin, slightly fibrous edge — which combined with a
  boosted emissive reads as light re-emerging through tissue rather
  than merely reflecting off it.
- **Soft colour bleeding** — `petalGeometry.ts` bakes a base-to-tip
  vertex-colour gradient into each geometry variant (deeper/richer
  near the attachment point, paler at the thin tip), jittered per
  vertex so the transition reads as an organic bleed rather than a
  printed gradient line. Vertex colour and per-instance colour
  multiply together automatically (three.js's `USE_COLOR` +
  `USE_INSTANCING_COLOR`), so this cost nothing extra at the instance
  level — it's baked into the same handful of unique meshes already
  doing double duty for shape variety.
- **Subtle roughness variation** — `buildPetalMaterialVariants` makes
  one material per petal *geometry variant* (not just per archetype),
  each with its own small roughness jitter around the archetype's
  base value, so glossiness varies group to group instead of being
  identical across thousands of petals.
- **Believable bloom response** falls out of the above rather than
  needing its own mechanism: the brighter tips/edges (from the colour
  gradient and sheen) cross Bloom's luminance threshold while the
  darker petal bases don't, so glow concentrates where a real
  translucent tip would catch light instead of the whole shape
  blooming uniformly.

All of this still resolves into soft colour and light once the depth-
of-field pass gets hold of it — none of these are hard-edged effects,
so the abstraction the brief calls for survives the blur.

### Lighting (`lighting/SceneLighting.tsx`)

Styled as an overcast summer afternoon, not a sunny establishing shot:
a `hemisphereLight` (soft sky colour above, muted ground-bounce colour
below) plus a plain `ambientLight` do most of the work, since cloud
cover scatters sunlight from the whole sky rather than one direction —
that's what keeps shading flat and shadows from reading at all. The
two `directionalLight`s are intentionally weak, there only to hint at
a light direction so forms don't go completely flat, not to model
anything. Petals lean into this: their emissive intensity is tuned a
little brighter than the diffuse light alone would produce, reading as
light glowing through translucent tissue rather than merely
reflecting off it — reinforced by `PostProcessing.tsx`'s bloom
threshold, lowered enough to catch that glow. `environment/config.ts`'s
fog and horizon colours are kept close to each other for the same
reason: a real overcast sky is famously flat, without much of a
vertical gradient.

### Environment (`environment/`)

The meadow the flowers grow in. It exists to give the flower field
believable lighting, depth, and colour, and is deliberately kept
soft/muted so it never becomes the visual subject — everything here
assumes it'll mostly be seen through heavy depth of field, so
photographic plausibility (soft shape, soft colour, atmosphere) is
prioritized over geometric detail.

- **Terrain** (`buildTerrainGeometry.ts`, `terrainHeight.ts`) — a
  single displaced, vertex-coloured ground mesh built directly in
  world space; height comes from `shared/terrainHeight.ts`'s layered
  noise (broad rolling undulation + a finer bump layer) — the same
  height function the flower field samples to plant flowers on it.
- **Ground colour** (`groundColor.ts`) — blends a muted dry/sparse/lush
  palette using the *same* shared meadow cluster field the flowers
  sample, plus the environment's own fine soil noise, so the ground
  reads as lusher where the flowers cluster and — together with the
  shared path field — visibly bare/dirt along the same corridor the
  flowers avoid, instead of two unrelated random patterns sharing a
  scene by coincidence.
- **Grass** (`generateGrass.ts`/`Grass.tsx`) — dense instanced blades
  (a handful of unique low-poly geometries, thousands of instances),
  planted only in the near/mid ground where individual blades would
  actually resolve before blur takes over, thinned along the shared
  path.
- **Wild vegetation** (`generateWildVegetation.ts`/`WildVegetation.tsx`)
  — small sparse leaf/weed clumps (a few leaflets fanning out from a
  point) scattered between the grass to break up its uniformity
  without introducing anything as visually loud as a flower.
- **Fog** (`Fog.tsx`) — `FogExp2` for atmospheric depth; its colour is
  what the horizon and the terrain's far edge both blend into.
- **Horizon** (`Horizon.tsx`) — a large backdrop sphere with a plain
  custom vertical-gradient shader (not a physically-based sky) so its
  colours stay inside the same muted editorial palette instead of
  drifting toward a literal blue-sky look; deliberately excludes the
  fog chunk since it represents "infinitely far away."

All tuning lives in `flowerField/config.ts` and `environment/config.ts`.

### Lens (`camera/`)

The camera is styled as a macro lens, not a generic 3D viewport:

- **Long focal length** — a narrow FOV (`camera/config.ts`) reads as
  telephoto/macro compression rather than a wide establishing shot.
- **Physically-inspired depth of field** — the dominant visual
  characteristic, not a finishing touch. `LensOpticsDepthOfFieldEffect.ts`
  computes the blur radius per pixel from the actual thin-lens
  circle-of-confusion equation (object depth, focal length, focus
  distance, and f-stop/aperture — the same formula a real lens obeys),
  not a hand-tuned near/far falloff. All three lens parameters
  (`focusDistance`, `focalLength`, `fStop`) are configurable in
  `camera/config.ts`; `metersPerWorldUnit` bridges our otherwise-arbitrary
  world units to the real meters/mm the equation needs. Bloom is listed
  before it in the effect chain so its highlights blur into soft bokeh
  discs instead of staying crisp on top of the blur.
- **A ~45° downward angle** — the camera is elevated and angled down
  at the meadow floor (`camera/config.ts`'s `position`/`target`) so
  flowers read as growing out of the ground it's looking at, rather
  than a level, eye-height view that made a floating field of flowers
  obvious. The orbit target is also nudged off-axis so the composition
  isn't dead-centered.
- **Handheld drift** (`HandheldDrift.tsx`) — a small per-frame sway
  built from two layered noise frequencies (slow sway + a faster
  tremor) rather than one sine wave, so it reads as organic hand
  movement, not a mechanical loop. It's recomputed as an absolute
  offset from elapsed time every frame rather than accumulated, so it
  can't run away, and it's mounted after `CameraControls` so its sway
  layers on top of, rather than fights, the controls' own update.
- **Camera sweep** (`CameraSweep.tsx`) — a much wider, faster,
  yaw-dominant rotation (`camera/config.ts`'s `sweep`), mounted right
  after `HandheldDrift` and following the same non-cumulative,
  time-driven, apply-after-`CameraControls` pattern. This is the actual
  motion behind the intentional-camera-movement blur streak below — a
  sine wave rather than noise, deliberately, since a sine is locally
  near-linear around its zero-crossings, which is what turns into a
  clean directional streak once blended rather than a fuzzy
  back-and-forth smear.

### Post-processing (`effects/`)

Styled after analogue photography, not a digital/social filter — every
effect is something a real lens or a real strip of film would do, all
tuned in `effects/config.ts` to be felt rather than noticed on its
own. Pipeline order (`PostProcessing.tsx`) matters: Bloom first so
depth of field blurs its highlights into soft bokeh discs, then
atmospheric haze/scatter and bilateral softening on the already-
defocused image, then the lens-level effects (chromatic aberration,
lens distortion), then Vignette, then simulated long-exposure blur,
with film grain last — the emulsion layer sitting on top of the
fully-formed image, not a digital overlay.

- **Atmospheric softness** (`AtmosphericHazeEffect.ts` +
  `BilateralSoftEffect.ts`, tuned together under `effects/config.ts`'s
  `atmosphere` block) is three techniques deliberately combined rather
  than tuned in isolation:
  - A **low-frequency haze** veil — a slow-drifting, large-scale noise
    pattern (two octaves, both under ~2 cycles per screen-width on
    purpose, so it reads as soft haze density rather than visible
    grain) tinted toward the same colour as the scene's own `FogExp2`
    (`environment/config.ts`), so the two read as one atmosphere.
  - A **volumetric softness** term — a few wide taps standing in for
    light scattering through that haze.
  - Both of the above are gated by real view-space distance
    (`depthFalloff`, shaped like the scene fog's own exponential
    falloff), not applied evenly — the foreground/focal subject stays
    close to untouched and the background reads hazier, the aerial-
    perspective way real atmosphere behaves. An even veil would just
    lighten and flatten the whole frame, which is the contrast loss
    this is built to avoid.
  - **Bilateral softening** then smooths whatever fine texture that
    haze/DoF/bloom leave behind (grass and petal micro-detail, the
    haze noise itself), but its neighbour-averaging weight also drops
    with how different a neighbour's *brightness* is from the centre
    pixel, not just how far away it is — that's what keeps a real
    contrast edge (a flower's silhouette against the grass) crisp
    while still blurring low-contrast texture into something softer. A
    plain Gaussian blur here would have eaten exactly the contrast the
    DoF/bloom pipeline relies on to keep the focal subject legible.
  - **Bloom's threshold/smoothing** (`luminanceThreshold: 0.42`,
    `luminanceSmoothing: 0.45`, both loosened from a "highlights only"
    bloom) is the fourth lever tuned alongside these three: glow now
    spreads from more of the pale, diffusely-lit petals and haze
    itself, not just the brightest few pixels, which is what makes the
    bloom itself read as atmosphere rather than a lens flare.
    `intensity` is trimmed slightly (`0.4` → `0.35`) to compensate, so
    the extra surfaces blooming don't just wash the frame brighter.
- **Chromatic aberration** uses `radialModulation` so the fringing
  only shows up towards the edges the way a real lens's does, not as
  a full-frame colour shift.
- **Lens distortion** (`LensDistortionEffect`, not wrapped by
  `@react-three/postprocessing` so it's constructed directly in
  `LensDistortion.tsx`, same pattern as the depth-of-field effect) is
  a slight barrel bow — enough to feel like a real lens, not a fisheye.
- **Simulated intentional-camera-movement (ICM) long exposure**
  (`LongExposureBlurPass.ts`) — blends each frame with a decaying
  history of recent frames, so `CameraSweep`'s wide pan drags the whole
  image into directional streaks the way a real ICM long exposure
  would, rather than streaking individual moving objects the way a
  per-object velocity-buffer motion blur does (nothing here moves
  independently of the camera, so that technique wouldn't even apply).
  It's a `Pass`, not an `Effect` — postprocessing's `Effect` model
  composes fragment shaders into one pass and has no concept of "last
  frame's render," so this owns its own persistent accumulation
  buffer, following the same two-buffer ping-pong technique three.js's
  `AfterimagePass` uses, but blending with a plain `mix()` instead of
  `max()` (`max()` produces bright ghost trails — a light-trail
  effect, which reads as digital streaking, not soft exposure blur).
  `halfLifeSeconds` (how long the blended history takes to fade to
  half strength) is computed against real elapsed time each frame, so
  the effect is framerate-independent. It's the main knob for streak
  strength/reach, and it's tuned opposite `CameraSweep`'s
  `periodSeconds`: keep `halfLifeSeconds` comfortably under half the
  sweep's period so the blended history stays within one directional
  half-swing — go past that and the blend starts pulling in the
  reversed half of the swing, which cancels the streak back out into a
  directionless wash instead of a clean smear.
- **Grain** (`Noise`, `premultiply`d) fades in shadows the way real
  emulsion grain does rather than sitting at uniform strength over the
  whole frame.

Distortion, aberration, and the long-exposure blur were all initially
tuned an order of magnitude too strong (or, in the blur's case,
validated by temporarily cranking it *up* rather than guessing "subtle"
was even wired correctly) — worth checking any new effect here at an
exaggerated value first, then dialing back, rather than trusting a
guessed value blind.

Headless screenshot testing for the ICM sweep/blur combo hit a real
limit worth knowing about: this sandbox's headless Chromium falls back
to software rendering (SwiftShader — check
`gl.getExtension('WEBGL_debug_renderer_info')`), which renders this
scene at well under 1fps. `CameraSweep`'s rotation and the blur's decay
are both computed from real elapsed time rather than accumulated
per-frame, so the *strength* of the effect at any given moment is
correct regardless of framerate — but at <1fps there are far too few
samples for the blend to look like a continuous streak; it shows up as
a few discrete ghosted copies instead. That's a sandbox artifact, not a
bug: a real browser with GPU acceleration blends dozens of samples per
`halfLifeSeconds` window at 60fps, which is what actually smooths the
discrete ghosting seen here into the continuous streak this was tuned
for. Confirm the *mechanism* (camera genuinely sweeping, buffer
genuinely accumulating history rather than snapping) in a sandbox like
this if needed, but don't chase pixel-perfect streak smoothness there.

No GUI/controls panel, and no fixed-aspect-ratio cropping, yet by
design — this is expected to end up behind a canvas-based editor later.
