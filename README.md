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
      MainCamera.tsx        perspective camera
      CameraControls.tsx    orbit controls
    lighting/
      SceneLighting.tsx     ambient + directional lighting rig
    effects/
      PostProcessing.tsx    EffectComposer pipeline
    shared/                 procedural primitives used by more than one system
      random.ts               seeded PRNG — same seed always reproduces the same output
      noise.ts                 layered value noise (fbm) + a 1D slice for path curves
      meadowLayout.ts          combines noise into density(x, z)/pathFactor(x, z)/clusterField(x, z)
      meadowLayoutConfig.ts    the one meadow layout both flowers and environment sample
      frustum.ts               "how wide/deep is the meadow" — keeps placement in sync with the camera
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

### Environment (`environment/`)

The meadow the flowers grow in. It exists to give the flower field
believable lighting, depth, and colour, and is deliberately kept
soft/muted so it never becomes the visual subject — everything here
assumes it'll mostly be seen through heavy depth of field, so
photographic plausibility (soft shape, soft colour, atmosphere) is
prioritized over geometric detail.

- **Terrain** (`buildTerrainGeometry.ts`, `terrainHeight.ts`) — a
  single displaced, vertex-coloured ground mesh built directly in
  world space; height comes from layered noise (broad rolling
  undulation + a finer bump layer).
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

No GUI/controls panel yet by design.
