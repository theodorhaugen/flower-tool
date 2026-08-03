import { useEffect, useMemo } from 'react'
import { useGenerative } from '../shared/generativeContext'
import { POST_PROCESSING_CONFIG } from './config'
import { LongExposureBlurPass } from './LongExposureBlurPass'

/**
 * R3F wrapper for LongExposureBlurPass — a `Pass`, not an `Effect`, so it's
 * added the same way LensDistortion/LensOpticsDepthOfField are: constructed
 * directly and passed to `<EffectComposer>` as a `primitive`, which the
 * composer picks up via `instanceof Pass` rather than `instanceof Effect`.
 *
 * `movementMultiplier` is `motionBlurStrength` (shared/generative.ts — how
 * hard *this* render's sweep should swing, directly Leva-overridable via
 * Camera > Blur Length) threaded through so the pass's own within-frame
 * yaw/pitch-delta estimate (see LongExposureBlurPass's `render()`) tracks
 * whatever CameraSweep.tsx is actually scaling its sweep by. `directionAngle`
 * (also per-seed/Leva-overridable) keeps that estimate pointed the same way
 * the sweep itself is — recreating the pass on a change is fine (not a perf
 * concern; changes are infrequent) and matches LensOpticsDepthOfField.tsx/
 * AtmosphericHaze.tsx's own pattern, and SettleDriver.tsx already restarts
 * the whole settle burst — and thus this pass's accumulated history — on any
 * generative-state change anyway. `fov` (Leva's Camera > Zoom-overridable —
 * see MainCamera.tsx) is threaded through for the same reason: the pass
 * converts an angular yaw/pitch delta into a UV fraction of the frame, which
 * depends on the actual field of view MainCamera.tsx is using, not a fixed
 * default.
 */
export function LongExposureBlur() {
  const { halfLifeSeconds } = POST_PROCESSING_CONFIG.motionBlur
  const { motionBlurStrength, motionBlurDirectionAngle, fov } = useGenerative()

  const pass = useMemo(
    () =>
      new LongExposureBlurPass({
        halfLifeSeconds,
        movementMultiplier: motionBlurStrength,
        directionAngle: motionBlurDirectionAngle,
        fov,
      }),
    [halfLifeSeconds, motionBlurStrength, motionBlurDirectionAngle, fov],
  )

  useEffect(() => {
    return () => {
      pass.dispose()
    }
  }, [pass])

  return <primitive object={pass} />
}
