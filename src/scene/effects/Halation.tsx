import { useEffect, useMemo } from 'react'
import { useGenerative } from '../shared/generativeContext'
import { POST_PROCESSING_CONFIG } from './config'
import { HalationPass } from './HalationPass'
import { zoomGlowFactor } from './zoomGlowCompensation'

/**
 * R3F wrapper for HalationPass — same `primitive`-as-`Pass` pattern as
 * LongExposureBlur.tsx/GrainOverlay.tsx. `radiusScale` tracks the active
 * render's actual zoom (see zoomGlowCompensation.ts) so the bleed ring's
 * reach grows with it — a 1:1 scale, not damped, since this is a literal
 * on-screen radius that should just track magnification directly, unlike
 * Bloom's intensity-based compensation (PostProcessing.tsx), which is a
 * proxy for a "reach" it can't directly control continuously.
 */
export function Halation() {
  const { threshold, intensity, tint } = POST_PROCESSING_CONFIG.halation
  const { fov } = useGenerative()
  const radiusScale = zoomGlowFactor(fov)

  const pass = useMemo(
    () => new HalationPass({ threshold, intensity, tint, radiusScale }),
    [threshold, intensity, tint, radiusScale],
  )

  useEffect(() => {
    return () => {
      pass.dispose()
    }
  }, [pass])

  return <primitive object={pass} />
}
