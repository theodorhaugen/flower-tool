import { OrbitControls } from '@react-three/drei'

/**
 * Orbit controls tuned for slow, deliberate movement — this is meant to
 * drift through a flower field, not fly around a scene. Distance range is
 * sized to the field's depth (see flowerField/config.ts).
 */
export function CameraControls() {
  return (
    <OrbitControls
      makeDefault
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
