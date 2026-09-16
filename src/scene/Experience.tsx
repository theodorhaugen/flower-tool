import { CameraFraming } from './camera/CameraFraming'
import { CameraSweep } from './camera/CameraSweep'
import { HandheldDrift } from './camera/HandheldDrift'
import { MainCamera } from './camera/MainCamera'
import { Environment } from './environment/Environment'
import { ExportControls } from './effects/ExportControls'
import { PostProcessing } from './effects/PostProcessing'
import { SceneLighting } from './lighting/SceneLighting'
import { GenerativeProvider } from './shared/GenerativeProvider'
import { SettleDriver } from './shared/SettleDriver'
import { FlowerField } from './subjects/flowerField/FlowerField'

/**
 * Composition root for the scene graph. Keeps camera/controls/lighting/
 * environment/subject/effects as independent, swappable pieces so the
 * procedural flower work can land in `subjects/` and the meadow it grows in
 * can land in `environment/` without either touching the rest of this file.
 *
 * `GenerativeProvider` wraps everything else — it picks the one integer
 * seed this render belongs to and derives every generative axis (flower
 * placement/species/colour, meadow layout, terrain, camera, palette, focus
 * distance, bloom intensity, wind — see shared/generative.ts) from it, so
 * every subsystem below reads the same generative state via
 * `useGenerative()`/`usePalette()` rather than each picking its own
 * independent randomness.
 *
 * HandheldDrift/CameraSweep are mounted right after CameraFraming so their
 * per-frame nudges layer on top of, rather than fight, its per-frame
 * look-at reset — see HandheldDrift's docstring for why ordering matters
 * here.
 *
 * SettleDriver settles the whole scene (camera sweep/drift, wind, haze
 * drift, film grain, the long-exposure blur trail) into one reproducible
 * still per seed/parameter-set instead of animating forever, and captures
 * it as the image CapturedView.tsx (src/CapturedView.tsx, outside this
 * whole tree) actually displays — this `<Canvas>` itself stays hidden,
 * existing only to generate that image. See SettleDriver's docstring. It
 * needs `useGenerative()`, so it has to sit inside `GenerativeProvider`
 * like everything else here.
 */
export function Experience() {
  return (
    <GenerativeProvider>
      <MainCamera />
      <CameraFraming />
      <HandheldDrift />
      <CameraSweep />
      <SettleDriver />
      <SceneLighting />
      <Environment />
      <FlowerField />
      <PostProcessing />
      <ExportControls />
    </GenerativeProvider>
  )
}
