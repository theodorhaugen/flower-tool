import { LensDistortionEffect } from 'postprocessing'
import { useEffect, useMemo } from 'react'
import { Vector2 } from 'three'
import { POST_PROCESSING_CONFIG } from './config'

/**
 * Subtle barrel distortion — the gentle edge bow real lenses show, not a
 * fisheye gimmick. Not wrapped by @react-three/postprocessing, so it's
 * constructed directly and added as a `primitive` inside `<EffectComposer>`,
 * same pattern as LensOpticsDepthOfField.tsx.
 */
export function LensDistortion() {
  const { distortion, principalPoint, focalLength, skew } = POST_PROCESSING_CONFIG.lensDistortion

  const effect = useMemo(
    () =>
      new LensDistortionEffect({
        distortion: new Vector2(...distortion),
        principalPoint: new Vector2(...principalPoint),
        focalLength: new Vector2(...focalLength),
        skew,
      }),
    [distortion, principalPoint, focalLength, skew],
  )

  useEffect(() => {
    return () => {
      effect.dispose()
    }
  }, [effect])

  return <primitive object={effect} />
}
