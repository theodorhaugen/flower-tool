import { useTexture } from '@react-three/drei'
import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { useGenerative } from '../shared/generativeContext'
import { POST_PROCESSING_CONFIG } from './config'
import grainTextureUrl from './textures/grain.jpg'
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
 */
export function GrainOverlay() {
  const { opacity, size, highlightFalloffStart, highlightFalloffEnd } = POST_PROCESSING_CONFIG.grain
  const { grainAmount, grainSize } = useGenerative()
  const grainTexture = useTexture(grainTextureUrl)

  useEffect(() => {
    grainTexture.wrapS = THREE.RepeatWrapping
    grainTexture.wrapT = THREE.RepeatWrapping
    grainTexture.needsUpdate = true
  }, [grainTexture])

  const pass = useMemo(
    () =>
      new TextureGrainPass({
        grainTexture,
        opacity: opacity * grainAmount,
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
