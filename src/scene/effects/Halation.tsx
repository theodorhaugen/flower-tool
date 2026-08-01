import { useEffect, useMemo } from 'react'
import { POST_PROCESSING_CONFIG } from './config'
import { HalationPass } from './HalationPass'

/** R3F wrapper for HalationPass — same `primitive`-as-`Pass` pattern as LongExposureBlur.tsx/FilmGrain.tsx. */
export function Halation() {
  const { threshold, intensity, tint } = POST_PROCESSING_CONFIG.halation

  const pass = useMemo(() => new HalationPass({ threshold, intensity, tint }), [threshold, intensity, tint])

  useEffect(() => {
    return () => {
      pass.dispose()
    }
  }, [pass])

  return <primitive object={pass} />
}
