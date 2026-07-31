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
    subjects/
      flowerField/
        FlowerField.tsx          top-level component, wires everything together
        config.ts                every tuning knob (counts, bands, noise, paths)
        random.ts                seeded PRNG — same seed always reproduces the same field
        noise.ts                 layered value noise (fbm) + a 1D slice for path curves
        meadowDensity.ts         combines noise fields into a ground-plane density(x, z)
        palette.ts               editorial pastel palette + color jitter
        petalGeometry.ts         procedural petal mesh (taper/curl/twist/jitter)
        geometryVariants.ts      a handful of unique petal/center geometries
        generateFlowerField.ts   samples the density field per depth band, pure fn of seed
        InstancedGroup.tsx       generic InstancedMesh renderer
        types.ts
```

Each concern (camera, controls, lighting, effects, subject) is an
independent, swappable component. Defocus-oriented post effects (depth
of field, grain, chromatic aberration) extend
`scene/effects/PostProcessing.tsx` without touching the rest of the
scene graph.

### Flower field

Not botanically accurate by design — each "flower" is a small cluster
of translucent petals (randomized count, size, rotation, color, and
per-petal jitter). Nearly everything is instanced: a couple dozen
unique petal/center geometries (enough variety that repetition doesn't
read at a glance) each back one `InstancedMesh` with thousands of
per-instance transforms/colors, so it's a handful of draw calls
regardless of flower count.

Placement is meadow-like rather than uniformly random
(`meadowDensity.ts`): a low-frequency noise field decides roughly
where the clusters and clearings are, a higher-frequency field breaks
up each cluster with texture, and the result is contrast-sharpened
into clear patches vs. gaps. One or more low-frequency noise curves
then carve winding, low-density "path" corridors through it. Flowers
are placed by rejecting/accepting candidate positions against this
density (`generateFlowerField.ts`), so density varies continuously —
no hard-edged cluster shapes.

Depth reads in three bands (`config.ts`'s `depthBands`): a sparse
foreground of a few large blooms, a busy midground (the meadow's main
body), and a much smaller/simpler background haze — each band's flower
count comes from its approximate on-screen area times a density
multiplier, not a fixed share, so a near band (small on-screen area)
doesn't get packed as densely as a far one just because they were
each assigned "X% of the flowers."

All tuning lives in `flowerField/config.ts`.

No GUI/controls panel yet by design.
