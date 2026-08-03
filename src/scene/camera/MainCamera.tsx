import { PerspectiveCamera } from '@react-three/drei'
import { useGenerative } from '../shared/generativeContext'
import { CAMERA_CONFIG } from './config'

/**
 * Default scene camera. Kept as an explicit, named component (rather than
 * relying on the Canvas's implicit default camera) so lens tuning has a
 * single place to live — see camera/config.ts. Position comes from the
 * active render's generative state (a jitter around `CAMERA_CONFIG.position`
 * — see shared/generative.ts) rather than the static config value directly,
 * so every seed gets a genuinely different vantage point. `fov` is likewise
 * the generative state's value (Leva's Camera > Zoom, `CAMERA_CONFIG.fov` by
 * default) rather than the static config directly, for the same reason —
 * effects/LongExposureBlurPass.ts reads the same generative `fov` too, so
 * its own within-frame streak estimate never desyncs from whatever this
 * camera is actually seeing.
 */
export function MainCamera() {
  const { camera, fov } = useGenerative()

  return (
    <PerspectiveCamera
      makeDefault
      fov={fov}
      near={CAMERA_CONFIG.near}
      far={CAMERA_CONFIG.far}
      position={camera.position}
    />
  )
}
