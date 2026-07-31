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
      PlaceholderSubject.tsx  stand-in geometry — replaced by the
                              procedural flower generator
```

Each concern (camera, controls, lighting, effects, subject) is an
independent, swappable component. The procedural flower generator is
meant to land entirely inside `scene/subjects/`, and defocus-oriented
post effects (depth of field, grain, chromatic aberration) extend
`scene/effects/PostProcessing.tsx` — neither should require touching
the rest of the scene graph.

No GUI/controls panel yet by design.
