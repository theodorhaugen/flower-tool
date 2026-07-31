import { PerspectiveCamera } from '@react-three/drei'

/**
 * Default scene camera. Kept as an explicit, named component (rather than
 * relying on the Canvas's implicit default camera) so future work — e.g.
 * depth-of-field tuned to a specific focal length — has a single place to
 * adjust fov/near/far.
 */
export function MainCamera() {
  return (
    <PerspectiveCamera
      makeDefault
      fov={35}
      near={0.1}
      far={150}
      position={[0, 0, 6]}
    />
  )
}
