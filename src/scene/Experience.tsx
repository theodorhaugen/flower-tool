import { CameraControls } from './camera/CameraControls'
import { CameraSweep } from './camera/CameraSweep'
import { HandheldDrift } from './camera/HandheldDrift'
import { MainCamera } from './camera/MainCamera'
import { Environment } from './environment/Environment'
import { PostProcessing } from './effects/PostProcessing'
import { SceneLighting } from './lighting/SceneLighting'
import { PaletteProvider } from './shared/PaletteProvider'
import { FlowerField } from './subjects/flowerField/FlowerField'

/**
 * Composition root for the scene graph. Keeps camera/controls/lighting/
 * environment/subject/effects as independent, swappable pieces so the
 * procedural flower work can land in `subjects/` and the meadow it grows in
 * can land in `environment/` without either touching the rest of this file.
 *
 * `PaletteProvider` wraps everything else — it picks the one colour
 * palette this render belongs to (see shared/palette.ts) and every
 * colourful subsystem below (flowers, environment, lighting, effects)
 * reads it via `usePalette()`, which is what keeps the whole image
 * cohesive rather than each system inventing its own colours.
 *
 * HandheldDrift/CameraSweep are mounted right after CameraControls so their
 * per-frame nudges layer on top of, rather than fight, the orbit controls'
 * own per-frame update — see HandheldDrift's docstring for why ordering
 * matters here.
 */
export function Experience() {
  return (
    <PaletteProvider>
      <MainCamera />
      <CameraControls />
      <HandheldDrift />
      <CameraSweep />
      <SceneLighting />
      <Environment />
      <FlowerField />
      <PostProcessing />
    </PaletteProvider>
  )
}
