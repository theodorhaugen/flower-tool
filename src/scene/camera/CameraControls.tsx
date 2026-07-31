import { OrbitControls } from '@react-three/drei'
import { useGenerative } from '../shared/generativeContext'

/**
 * Orbit controls tuned for slow, deliberate movement — this is meant to
 * drift through a flower field, not fly around a scene. Distance range is
 * sized to the field's depth (see flowerField/config.ts). Target comes
 * from the active render's generative state (a jitter around
 * `CAMERA_CONFIG.target` — see shared/generative.ts), matching MainCamera's
 * generative position.
 */
export function CameraControls() {
  const { camera } = useGenerative()

  return (
    <OrbitControls
      makeDefault
      target={camera.target}
      enableDamping
      dampingFactor={0.08}
      enablePan={false}
      minDistance={1.5}
      maxDistance={45}
      minPolarAngle={Math.PI / 4}
      maxPolarAngle={(Math.PI * 3) / 4}
    />
  )
}
