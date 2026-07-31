import { useMemo } from 'react'
import * as THREE from 'three'
import { usePalette } from '../shared/paletteContext'

function mix(a: string, b: string, t: number): string {
  return `#${new THREE.Color(a).lerp(new THREE.Color(b), t).getHexString()}`
}

/**
 * Overcast-summer-afternoon lighting: a big soft sky dome is the primary
 * source rather than a hard directional sun, so form comes from gentle
 * colour/value gradients instead of crisp shadow edges — cloud cover
 * scatters light from the whole sky, not one point, so shadows barely read
 * at all. The two directional lights are kept deliberately weak, there only
 * to hint at a light direction so petals don't go completely flat, not to
 * model anything.
 *
 * Colours are tinted by the active render's palette — `highlight` warms the
 * sky/key light, `shadow` cools the ground-bounce/fill light — mixed with
 * fixed neutral anchors rather than used at full strength, so lighting
 * stays plausible (an overcast sky is still mostly white/gray) while still
 * reading as the same mood as the flowers/environment it's lighting.
 * Ambient stays uncoloured on purpose: it lights everything uniformly, so
 * tinting it would wash the whole image rather than reading as light.
 */
export function SceneLighting() {
  const palette = usePalette()

  const colors = useMemo(
    () => ({
      sky: mix('#eef1ec', palette.highlight, 0.45),
      ground: mix('#8a8060', palette.shadow, 0.45),
      key: mix('#fdf6ec', palette.highlight, 0.6),
      fill: mix('#dbe4e6', palette.shadow, 0.5),
    }),
    [palette],
  )

  return (
    <>
      <hemisphereLight color={colors.sky} groundColor={colors.ground} intensity={0.85} />
      <ambientLight intensity={0.3} />
      <directionalLight position={[4, 6, 3]} intensity={0.22} color={colors.key} />
      <directionalLight position={[-3, 3, -4]} intensity={0.12} color={colors.fill} />
    </>
  )
}
