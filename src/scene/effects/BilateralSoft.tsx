import { useEffect, useMemo } from 'react'
import { useGenerative } from '../shared/generativeContext'
import { POST_PROCESSING_CONFIG } from './config'
import { BilateralSoftEffect } from './BilateralSoftEffect'

/**
 * R3F wrapper — constructs BilateralSoftEffect from effects/config.ts, same
 * pattern as LensOpticsDepthOfField.tsx: not exported by
 * @react-three/postprocessing since it's a custom Effect, so it's
 * constructed directly and added as a `primitive`. `softness` (Leva's
 * Atmosphere > Softness) scales the blur radius — 1 = as tuned.
 */
export function BilateralSoft() {
  const { softness } = useGenerative()
  const { radius, spatialSigma, rangeSigma } = POST_PROCESSING_CONFIG.atmosphere.bilateral

  const effect = useMemo(
    () => new BilateralSoftEffect({ radius: radius * softness, spatialSigma, rangeSigma }),
    [radius, spatialSigma, rangeSigma, softness],
  )

  useEffect(() => {
    return () => {
      effect.dispose()
    }
  }, [effect])

  return <primitive object={effect} />
}
