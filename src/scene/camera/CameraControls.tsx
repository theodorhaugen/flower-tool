import { OrbitControls } from '@react-three/drei'

/**
 * Orbit controls tuned for slow, deliberate movement — this is meant to
 * frame a macro-style subject, not fly around a scene.
 */
export function CameraControls() {
  return (
    <OrbitControls
      makeDefault
      enableDamping
      dampingFactor={0.08}
      enablePan={false}
      minDistance={2}
      maxDistance={12}
      minPolarAngle={Math.PI / 4}
      maxPolarAngle={(Math.PI * 3) / 4}
    />
  )
}
