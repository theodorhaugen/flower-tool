import { useMemo } from 'react'
import * as THREE from 'three'
import { useGenerative } from '../shared/generativeContext'

function mix(a: string, b: string, t: number): string {
  return `#${new THREE.Color(a).lerp(new THREE.Color(b), THREE.MathUtils.clamp(t, 0, 1)).getHexString()}`
}

/**
 * Broken-sun lighting: without any shadow mapping in this renderer (see
 * PostProcessing.tsx/Environment.tsx — there are none), the *only* way a
 * surface can read as "in shadow" is its own diffuse N·L falloff — facing
 * away from the key light. That only produces real per-pixel dynamic range
 * if the non-directional floor (hemisphere + ambient, which light every
 * surface regardless of orientation) sits well *below* the key light's
 * peak. It previously didn't: hemisphere(1.7) + ambient(0.55) = 2.25
 * exceeded the key light's 1.85, so a petal facing dead away from the sun
 * still read almost as bright as one facing it — flat exposure, no matter
 * how the post-process contrast pivot (see effects/config.ts's
 * `paletteGrade`) was tuned, because that pivot can only stretch dynamic
 * range that already exists in the lit input, not manufacture shadow depth
 * a flat lighting ratio never produced. Rebalanced so the floor (0.8 + 0.15
 * = 0.95) sits well under the key (2.6) and the fill (0.35) barely lifts
 * the shadow side — this is the actual "exposure" fix the reference photos'
 * deep-shadow/bright-highlight character calls for; the grade pass now only
 * needs to add a mild punch on top of a genuinely wide-range input.
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
      <hemisphereLight color={colors.sky} groundColor={colors.ground} intensity={0.8 * lightingOvercast} />
      <ambientLight intensity={0.15 * lightingOvercast} />
      <directionalLight position={[4, 6, 3]} intensity={2.6 * lightingShadowDepth} color={colors.key} />
      <directionalLight position={[-3, 3, -4]} intensity={0.35 * lightingShadowDepth} color={colors.fill} />
    </>
  )
}
