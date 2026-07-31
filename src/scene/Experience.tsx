import { CameraControls } from './camera/CameraControls'
import { MainCamera } from './camera/MainCamera'
import { Environment } from './environment/Environment'
import { PostProcessing } from './effects/PostProcessing'
import { SceneLighting } from './lighting/SceneLighting'
import { FlowerField } from './subjects/flowerField/FlowerField'

/**
 * Composition root for the scene graph. Keeps camera/controls/lighting/
 * environment/subject/effects as independent, swappable pieces so the
 * procedural flower work can land in `subjects/` and the meadow it grows in
 * can land in `environment/` without either touching the rest of this file.
 */
export function Experience() {
  return (
    <>
      <MainCamera />
      <CameraControls />
      <SceneLighting />
      <Environment />
      <FlowerField />
      <PostProcessing />
    </>
  )
}
