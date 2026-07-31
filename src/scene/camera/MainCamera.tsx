import { PerspectiveCamera } from '@react-three/drei'
import { CAMERA_CONFIG } from './config'

/**
 * Default scene camera. Kept as an explicit, named component (rather than
 * relying on the Canvas's implicit default camera) so lens tuning has a
 * single place to live — see camera/config.ts.
 */
export function MainCamera() {
  return (
    <PerspectiveCamera
      makeDefault
      fov={CAMERA_CONFIG.fov}
      near={CAMERA_CONFIG.near}
      far={CAMERA_CONFIG.far}
      position={CAMERA_CONFIG.position}
    />
  )
}
