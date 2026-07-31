import { useEffect, useMemo } from 'react'
import { POST_PROCESSING_CONFIG } from './config'
import { BilateralSoftEffect } from './BilateralSoftEffect'

/**
 * R3F wrapper — constructs BilateralSoftEffect from effects/config.ts, same
 * pattern as LensOpticsDepthOfField.tsx: not exported by
 * @react-three/postprocessing since it's a custom Effect, so it's
 * constructed directly and added as a `primitive`.
 */
export function BilateralSoft() {
  const { radius, spatialSigma, rangeSigma } = POST_PROCESSING_CONFIG.atmosphere.bilateral

  const effect = useMemo(
    () => new BilateralSoftEffect({ radius, spatialSigma, rangeSigma }),
    [radius, spatialSigma, rangeSigma],
  )

  useEffect(() => {
    return () => {
      effect.dispose()
    }
  }, [effect])

  return <primitive object={effect} />
}
