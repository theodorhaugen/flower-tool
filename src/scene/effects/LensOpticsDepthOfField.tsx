import { useEffect, useMemo } from 'react'
import { CAMERA_CONFIG } from '../camera/config'
import { useGenerative } from '../shared/generativeContext'
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
 * lens equation needs — so the world-space focus distance is converted via
 * `metersPerWorldUnit`. `maxBlur`/`fStop` come from the active render's
 * generative state (Leva's Lens fold overrides them, see
 * shared/GenerativeProvider.tsx) rather than the static config values
 * directly, so every seed — and every designer tweak — can pull
 * blur/aperture to a different value. `focalLength`/`rings`/`samples` stay
 * fixed config: focal length barely changes the "macro" read at these
 * apertures, and rings/samples are pure sampling quality, not creative.
 *
 * `focus` comes from `useGenerative()`'s `focusDistance` (Leva's Lens >
 * Focus Distance, seed-derived per camera shot preset — see
 * shared/generative.ts's `CAMERA_SHOT_PRESETS`), converted through
 * `metersPerWorldUnit` the same way the per-pixel depth this effect's
 * shader samples now is too (see LensOpticsDepthOfFieldEffect.ts's
 * docstring for a real bug that used to make those two sides of the
 * comparison land on different, incompatible scales).
 *
 * A live raycast-based autofocus (reading the actual on-screen depth at
 * screen-centre every frame, rather than a seed-derived guess) was tried
 * here and reverted. One version (raycasting the *entire* scene graph)
 * caused a clear, reproducible freeze — 100,000+ grass/petal/leaflet
 * instances is too much to raycast every frame, full stop. A second,
 * narrower version (scoped to just the terrain mesh, much cheaper) also
 * coincided with hangs during testing, but that session's test environment
 * later turned out to be independently degraded (even the pre-existing,
 * already-committed baseline started hanging under it), so that version's
 * safety was never conclusively either confirmed or ruled out. Left out
 * rather than shipped on that ambiguous a result — the seed-derived value
 * below is simpler and already known-safe; worth revisiting with a clean
 * test environment.
 */
export function LensOpticsDepthOfField() {
  const { metersPerWorldUnit, focalLength, rings, samples } = CAMERA_CONFIG.dof
  const { focusDistance, maxBlur, fStop } = useGenerative()

  const effect = useMemo(
    () =>
      new LensOpticsDepthOfFieldEffect({
        focus: focusDistance * metersPerWorldUnit,
        focalLength,
        fStop,
        maxBlur,
        rings,
        samples,
        metersPerWorldUnit,
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
