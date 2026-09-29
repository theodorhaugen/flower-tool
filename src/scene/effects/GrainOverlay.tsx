import { useTexture } from '@react-three/drei'
import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { useGenerative } from '../shared/generativeContext'
import { POST_PROCESSING_CONFIG } from './config'
import grainTextureUrl from './textures/grain.webp'
import { TextureGrainPass } from './TextureGrainPass'

/**
 * R3F wrapper for TextureGrainPass — constructed from effects/config.ts's
 * `grain` block (base tuning) and the generative state's
 * `grainAmount`/`grainSize` (Leva's Film fold, 1 = as tuned), same pattern
 * FilmGrain.tsx (this replaces) used.
 *
 * `useTexture` suspends until the plate has loaded — SceneCanvas.tsx
 * already wraps the whole scene in a `<Suspense fallback={null}>`, so this
 * needs no extra boundary of its own; the settle burst simply doesn't start
 * until the plate (and thus the whole scene) is ready to mount, the same
 * as if any other child suspended.
 *
 * `RepeatWrapping` is set once, right after load — needed for `grainScale`
 * values other than 1 (Leva's Grain Size slider) to sample past the
 * plate's own edges without clamping into a smeared border; harmless at
 * the default scale, which never leaves the plate's own 0-1 UV range.
 *
 * Mipmapping is disabled — the plate (3160x3950) is minified relative to
 * the actual render resolution, and three.js's default trilinear mipmap
 * filtering averages exactly the fine per-pixel structure this plate
 * exists to provide, smoothing real grain into a faint, soft haze instead.
 * A plain bilinear sample at full resolution aliases slightly at that
 * minification instead of blurring — for noise-like content that reads as
 * sharper, more authentic grain, not a defect.
 */
export function GrainOverlay() {
  const { opacity, size, highlightFalloffStart, highlightFalloffEnd } = POST_PROCESSING_CONFIG.grain
  const { grainAmount, grainSize } = useGenerative()
  const grainTexture = useTexture(grainTextureUrl)

  useEffect(() => {
    grainTexture.wrapS = THREE.RepeatWrapping
    grainTexture.wrapT = THREE.RepeatWrapping
    grainTexture.generateMipmaps = false
    grainTexture.minFilter = THREE.LinearFilter
    grainTexture.needsUpdate = true
  }, [grainTexture])

  const pass = useMemo(
    () =>
      new TextureGrainPass({
        grainTexture,
        // Clamped to 1 — TextureGrainPass's own `strength = opacity *
        // highlightFade` feeds a plain `mix()`, which extrapolates rather
        // than saturating past t=1 (see that file's docstring: "1 is a
        // full Overlay blend"). grainAmount is seed-derived now (shared/
        // generative.ts's `drama`) with a ceiling of 1.45, so
        // `0.8 * 1.45 = 1.16` was a real, seed-reachable overshoot before
        // this clamp, not just a Leva-manual one.
        opacity: Math.min(opacity * grainAmount, 1),
        // Inverted — see effects/config.ts's `grain` docstring for why:
        // a bigger "Grain Size" should look like bigger grain, but a
        // bigger UV multiplier samples *more* of the plate per screen
        // pixel, which reads as finer grain, not coarser.
        grainScale: 1 / (size * grainSize),
        highlightFalloffStart,
        highlightFalloffEnd,
      }),
    [grainTexture, opacity, grainAmount, size, grainSize, highlightFalloffStart, highlightFalloffEnd],
  )

  useEffect(() => {
    return () => {
      pass.dispose()
    }
  }, [pass])

  return <primitive object={pass} />
}
