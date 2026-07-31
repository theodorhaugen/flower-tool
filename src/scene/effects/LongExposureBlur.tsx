import { useEffect, useMemo } from 'react'
import { POST_PROCESSING_CONFIG } from './config'
import { LongExposureBlurPass } from './LongExposureBlurPass'

/**
 * R3F wrapper for LongExposureBlurPass — a `Pass`, not an `Effect`, so it's
 * added the same way LensDistortion/LensOpticsDepthOfField are: constructed
 * directly and passed to `<EffectComposer>` as a `primitive`, which the
 * composer picks up via `instanceof Pass` rather than `instanceof Effect`.
 */
export function LongExposureBlur() {
  const { halfLifeSeconds } = POST_PROCESSING_CONFIG.motionBlur

  const pass = useMemo(() => new LongExposureBlurPass({ halfLifeSeconds }), [halfLifeSeconds])

  useEffect(() => {
    return () => {
      pass.dispose()
    }
  }, [pass])

  return <primitive object={pass} />
}
