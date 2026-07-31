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
      config.ts              lens tuning: fov, position/target, DoF, handheld drift
      MainCamera.tsx          perspective camera, narrow fov, elevated ~45° down at the meadow
      CameraControls.tsx      orbit controls, off-axis target
      HandheldDrift.tsx       subtle per-frame sway layered on top of the controls
    lighting/
      SceneLighting.tsx     ambient + directional lighting rig
    effects/
      PostProcessing.tsx    EffectComposer pipeline — bloom, depth of field, vignette
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
- **Shallow depth of field** — `PostProcessing.tsx`'s `DepthOfField`
  keeps only a thin world-space slice in focus (`dof.focusDistance`/
  `dof.focusRange`), melting everything else into bokeh; bloom is
  listed before it in the effect chain so its highlights blur into
  soft bokeh discs instead of staying crisp on top of the blur.
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

No GUI/controls panel, and no fixed-aspect-ratio cropping, yet by
design — this is expected to end up behind a canvas-based editor later.
