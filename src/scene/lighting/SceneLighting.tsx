/**
 * Overcast-summer-afternoon lighting: a big soft sky dome is the primary
 * source rather than a hard directional sun, so form comes from gentle
 * colour/value gradients instead of crisp shadow edges — cloud cover
 * scatters light from the whole sky, not one point, so shadows barely read
 * at all. The two directional lights are kept deliberately weak, there only
 * to hint at a light direction so petals don't go completely flat, not to
 * model anything.
 */
export function SceneLighting() {
  return (
    <>
      <hemisphereLight color="#eef1ec" groundColor="#8a8060" intensity={0.85} />
      <ambientLight intensity={0.3} />
      <directionalLight position={[4, 6, 3]} intensity={0.22} color="#fdf6ec" />
      <directionalLight position={[-3, 3, -4]} intensity={0.12} color="#dbe4e6" />
    </>
  )
}
