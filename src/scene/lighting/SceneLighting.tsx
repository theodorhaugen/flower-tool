import { useMemo } from 'react'
import * as THREE from 'three'
import { useGenerative } from '../shared/generativeContext'

function mix(a: string, b: string, t: number): string {
  return `#${new THREE.Color(a).lerp(new THREE.Color(b), THREE.MathUtils.clamp(t, 0, 1)).getHexString()}`
}

/**
 * Broken-sun lighting: a real directional key light now does most of the
 * work — sized and angled to carve visible light/shadow across a petal's
 * folds the way direct sun does (see the poppy/wildflower reference photos
 * this was tuned against) — with the sky dome/ambient kept only as a fill
 * so shadows stay soft-edged rather than pitch-black, not as the dominant
 * source it was before. That swap (key light up, ambient/hemisphere down)
 * is what turns flat "everything lit evenly" overcast into the contrast and
 * tonal separation those references have.
 *
 * Colours are tinted by the active render's palette — `highlight` warms the
 * sky/key light, `shadow` cools the ground-bounce/fill light — mixed with
 * fixed neutral anchors rather than used at full strength, so lighting
 * stays plausible (sunlight is still close to white) while still reading as
 * the same mood as the flowers/environment it's lighting. Ambient stays
 * uncoloured on purpose: it lights everything uniformly, so tinting it
 * would wash the whole image rather than reading as light.
 *
 * `lightingOvercast`/`lightingWarmth`/`lightingShadowDepth` (Leva's
 * Lighting fold) scale the sky/ambient fill brightness, how much palette
 * tint bleeds into the lights, and the key/fill directional lights'
 * intensity respectively — all 1 = as tuned above.
 */
export function SceneLighting() {
  const { palette, lightingOvercast, lightingWarmth, lightingShadowDepth } = useGenerative()

  const colors = useMemo(
    () => ({
      sky: mix('#eef1ec', palette.highlight, 0.45 * lightingWarmth),
      ground: mix('#8a8060', palette.shadow, 0.45 * lightingWarmth),
      key: mix('#fff4de', palette.highlight, 0.6 * lightingWarmth),
      fill: mix('#dbe4e6', palette.shadow, 0.5 * lightingWarmth),
    }),
    [palette, lightingWarmth],
  )

  return (
    <>
      <hemisphereLight color={colors.sky} groundColor={colors.ground} intensity={1.7 * lightingOvercast} />
      <ambientLight intensity={0.55 * lightingOvercast} />
      <directionalLight position={[4, 6, 3]} intensity={1.85 * lightingShadowDepth} color={colors.key} />
      <directionalLight position={[-3, 3, -4]} intensity={0.6 * lightingShadowDepth} color={colors.fill} />
    </>
  )
}
