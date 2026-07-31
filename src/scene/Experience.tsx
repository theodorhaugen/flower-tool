import { CameraControls } from './camera/CameraControls'
import { MainCamera } from './camera/MainCamera'
import { PostProcessing } from './effects/PostProcessing'
import { SceneLighting } from './lighting/SceneLighting'
import { FlowerField } from './subjects/flowerField/FlowerField'

/**
 * Composition root for the scene graph. Keeps camera/controls/lighting/
 * effects/subject as independent, swappable pieces so the procedural
 * flower work can land in `subjects/` without touching anything else here.
 */
export function Experience() {
  return (
    <>
      <MainCamera />
      <CameraControls />
      <SceneLighting />
      <FlowerField />
      <PostProcessing />
    </>
  )
}
