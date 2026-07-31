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
        config.ts                every tuning knob (counts, ranges, palette hookup)
        random.ts                seeded PRNG — same seed always reproduces the same field
        palette.ts               editorial pastel palette + color jitter
        petalGeometry.ts         procedural petal mesh (taper/curl/twist/jitter)
        geometryVariants.ts      a handful of unique petal/center geometries
        generateFlowerField.ts   scatters + orients thousands of flowers, pure fn of seed
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
per-petal jitter) scattered by the thousands through a depth-biased
volume in front of the camera. Nearly everything is instanced: a
couple dozen unique petal/center geometries (enough variety that
repetition doesn't read at a glance) each back one `InstancedMesh`
with thousands of per-instance transforms/colors, so it's a handful of
draw calls regardless of flower count. All tuning lives in
`flowerField/config.ts`.

No GUI/controls panel yet by design.
