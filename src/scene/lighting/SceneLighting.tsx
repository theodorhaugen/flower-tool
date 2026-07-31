/**
 * Minimal three-point-style lighting rig. Deliberately soft and low-contrast
 * to suit a defocused, atmospheric look — swap/extend here as the subject
 * matter grows more elaborate, no need to touch the rest of the scene.
 */
export function SceneLighting() {
  return (
    <>
      <ambientLight intensity={0.6} />
      <directionalLight position={[4, 5, 3]} intensity={1.2} color="#fff4e6" />
      <directionalLight position={[-4, -2, -3]} intensity={0.4} color="#cfe0ff" />
    </>
  )
}
