import { useMemo } from 'react'
import * as THREE from 'three'
import { CAMERA_SHOT_PRESETS } from '../shared/generative'
import { useGenerative } from '../shared/generativeContext'
import { foliageShadowTint } from '../shared/palette'

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
 * Floor raised again since (0.8/0.15 → 0.95/0.19, ~21% higher): the "flat
 * exposure" fix above was correct on its own terms — a real, wide dynamic
 * range now exists per-pixel — but ICM's heavy motion blur *averages* that
 * per-pixel lit/shadowed pattern across the whole camera sweep, which
 * softens the crisp highlight/shadow separation a sharp photo would keep
 * and pulls the *perceived* result back down towards the floor's own level.
 * A floor tuned for a sharp reference read as a diffuse blur reference
 * that's too dark overall, not just low-contrast. Still comfortably under
 * the key light (2.6) — this keeps real directional falloff, just lifts
 * where it falls from.
 *
 * A first attempt at +58% (1.2/0.3) overshot badly — but stacked at the
 * same time with a highlightBloom threshold drop (effects/config.ts) and a
 * much bigger haze/fog brightening (paletteColors.ts) than either carries
 * today, both since reverted/reduced. That combination, not this lever
 * alone, is what washed whole renders to near-solid white — bloom's own
 * glow spreads from and blends *between* every pixel that crosses
 * threshold, so it was the interaction that ran away, not the floor by
 * itself. With the threshold back at its original value, raised further
 * again (0.95/0.19 → 1.1/0.24, ~42% over the original 0.95) in isolation.
 *
 * Colours are tinted by the active render's palette — `glow` (the colour of
 * light itself) warms the sky/key light, a lightness-capped `foliagePrimary`
 * (see shared/palette.ts's `foliageShadowTint` — the meadow's own greenery,
 * standing in for ground-bounce) cools the ground-bounce/fill light — mixed
 * with fixed neutral anchors rather than used at full
 * strength, so lighting stays plausible (sunlight is still close to white)
 * while still reading as the same mood as the flowers/environment it's
 * lighting. Ambient stays uncoloured on purpose: it lights everything
 * uniformly, so tinting it would wash the whole image rather than reading
 * as light.
 *
 * `lightingOvercast`/`lightingWarmth`/`lightingShadowDepth` (Leva's
 * Lighting fold) scale the sky/ambient fill brightness, how much palette
 * tint bleeds into the lights, and the key/fill directional lights'
 * intensity respectively — all 1 = as tuned above.
 */
// `lightingShadowDepth` scales the two directional lights linearly with no
// floor of its own — at its Leva minimum (0) both go to exactly 0,
// collapsing this whole "broken-sun" design back into the flat, no-shadow
// lighting the class docstring above describes fixing (hemisphere+ambient
// alone light every surface uniformly regardless of orientation). 0 is a
// perfectly reachable slider position, not a far corner, so this floors the
// *effective* multiplier well below the tuned baseline (a soft, low-relief
// look) without ever fully zeroing the directional cue out.
const MIN_SHADOW_DEPTH = 0.15

export function SceneLighting() {
  const { palette, lightingOvercast, lightingWarmth, lightingShadowDepth, shotPresetName } = useGenerative()
  const effectiveShadowDepth = Math.max(MIN_SHADOW_DEPTH, lightingShadowDepth)
  // See `lightingFloorScale`'s own comment on `CameraShotPreset` (shared/
  // generative.ts) — only `Sky bloom` sets this today, to lift its own
  // grazing-angle-ground-crushes-to-black problem without touching the key/
  // fill lights every other preset already has tuned.
  const lightingFloorScale = CAMERA_SHOT_PRESETS.find((p) => p.name === shotPresetName)?.lightingFloorScale ?? 1

  const colors = useMemo(() => {
    // Lightness-capped, not the raw palette value — see
    // shared/palette.ts's foliageShadowTint docstring: a palette whose
    // `foliagePrimary` runs light (Sunlit pastel's mint) would otherwise
    // tint the "shadow" side of the lighting *brighter*, not darker.
    const shadowTint = foliageShadowTint(palette)
    return {
      sky: mix('#eef1ec', palette.glow, 0.45 * lightingWarmth),
      ground: mix('#8a8060', shadowTint, 0.45 * lightingWarmth),
      key: mix('#fff4de', palette.glow, 0.6 * lightingWarmth),
      fill: mix('#dbe4e6', shadowTint, 0.5 * lightingWarmth),
    }
  }, [palette, lightingWarmth])

  return (
    <>
      <hemisphereLight color={colors.sky} groundColor={colors.ground} intensity={1.1 * lightingOvercast * lightingFloorScale} />
      <ambientLight intensity={0.24 * lightingOvercast * lightingFloorScale} />
      <directionalLight position={[4, 6, 3]} intensity={2.6 * effectiveShadowDepth} color={colors.key} />
      <directionalLight position={[-3, 3, -4]} intensity={0.35 * effectiveShadowDepth} color={colors.fill} />
    </>
  )
}
