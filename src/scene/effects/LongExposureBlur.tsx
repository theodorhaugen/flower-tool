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
 * `movementMultiplier` combines Leva's Camera > Movement (a manual dial)
 * with the per-seed `motionBlurStrength` (shared/generative.ts — how hard
 * *this* render's sweep should swing by default) and is threaded through so
 * the pass's own within-frame yaw/pitch-delta estimate (see
 * LongExposureBlurPass's `render()`) tracks whatever CameraSweep.tsx is
 * actually scaling its sweep by. `directionAngle` (also per-seed) keeps
 * that estimate pointed the same way the sweep itself is — recreating the
 * pass on a change is fine (not a perf concern; changes are infrequent) and
 * matches LensOpticsDepthOfField.tsx/AtmosphericHaze.tsx's own pattern, and
 * SettleDriver.tsx already restarts the whole settle burst — and thus this
 * pass's accumulated history — on any generative-state change anyway.
 */
export function LongExposureBlur() {
  const { halfLifeSeconds } = POST_PROCESSING_CONFIG.motionBlur
  const { cameraMovementMultiplier, motionBlurStrength, motionBlurDirectionAngle } = useGenerative()

  const pass = useMemo(
    () =>
      new LongExposureBlurPass({
        halfLifeSeconds,
        movementMultiplier: cameraMovementMultiplier * motionBlurStrength,
        directionAngle: motionBlurDirectionAngle,
      }),
    [halfLifeSeconds, cameraMovementMultiplier, motionBlurStrength, motionBlurDirectionAngle],
  )

  useEffect(() => {
    return () => {
      pass.dispose()
    }
  }, [pass])

  return <primitive object={pass} />
}
