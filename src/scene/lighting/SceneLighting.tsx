import { useMemo } from 'react'
import * as THREE from 'three'
import { useGenerative } from '../shared/generativeContext'

function mix(a: string, b: string, t: number): string {
  return `#${new THREE.Color(a).lerp(new THREE.Color(b), THREE.MathUtils.clamp(t, 0, 1)).getHexString()}`
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
 *
 * `lightingOvercast`/`lightingWarmth`/`lightingShadowDepth` (Leva's
 * Lighting fold) scale the sky brightness, how much palette tint bleeds
 * into the lights, and the two directional lights' intensity
 * respectively — all 1 = as tuned above.
 */
export function SceneLighting() {
  const { palette, lightingOvercast, lightingWarmth, lightingShadowDepth } = useGenerative()

  const colors = useMemo(
    () => ({
      sky: mix('#eef1ec', palette.highlight, 0.45 * lightingWarmth),
      ground: mix('#8a8060', palette.shadow, 0.45 * lightingWarmth),
      key: mix('#fdf6ec', palette.highlight, 0.6 * lightingWarmth),
      fill: mix('#dbe4e6', palette.shadow, 0.5 * lightingWarmth),
    }),
    [palette, lightingWarmth],
  )

  return (
    <>
      <hemisphereLight color={colors.sky} groundColor={colors.ground} intensity={0.85 * lightingOvercast} />
      <ambientLight intensity={0.3 * lightingOvercast} />
      <directionalLight position={[4, 6, 3]} intensity={0.22 * lightingShadowDepth} color={colors.key} />
      <directionalLight position={[-3, 3, -4]} intensity={0.12 * lightingShadowDepth} color={colors.fill} />
    </>
  )
}
