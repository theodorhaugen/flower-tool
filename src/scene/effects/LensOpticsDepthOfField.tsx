import { useEffect, useMemo } from 'react'
import { CAMERA_CONFIG } from '../camera/config'
import { LensOpticsDepthOfFieldEffect } from './LensOpticsDepthOfFieldEffect'

/**
 * Physically-inspired depth of field: LensOpticsDepthOfFieldEffect derives
 * the per-pixel blur radius from the actual thin-lens circle-of-confusion
 * equation — focal length, f-stop (aperture), and focus distance feed the
 * same formula a real lens uses — rather than an artificial hand-tuned
 * near/far blur gradient. It's not wrapped by @react-three/postprocessing,
 * so it's added directly as a `primitive` inside `<EffectComposer>`, which
 * is all any effect needs: the composer's `EffectPass` supplies the
 * camera/depth-texture uniforms automatically based on the effect's
 * declared attributes.
 *
 * `focus` is in meters and `focalLength` in mm — real physical units the
 * lens equation needs — so the world-space `focusDistance` is converted via
 * `metersPerWorldUnit`. See camera/config.ts for all three configurable
 * lens parameters (aperture/fStop, focus distance, focal length).
 */
export function LensOpticsDepthOfField() {
  const { focusDistance, metersPerWorldUnit, focalLength, fStop, maxBlur, rings, samples } = CAMERA_CONFIG.dof

  const effect = useMemo(
    () =>
      new LensOpticsDepthOfFieldEffect({
        focus: focusDistance * metersPerWorldUnit,
        focalLength,
        fStop,
        maxBlur,
        rings,
        samples,
      }),
    [focusDistance, metersPerWorldUnit, focalLength, fStop, maxBlur, rings, samples],
  )

  useEffect(() => {
    return () => {
      effect.dispose()
    }
  }, [effect])

  return <primitive object={effect} />
}
