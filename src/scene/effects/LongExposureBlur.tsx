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
 * `movementMultiplier` (Leva's Camera > Movement) is threaded through so the
 * pass's own within-frame yaw-delta estimate (see LongExposureBlurPass's
 * `render()`) tracks whatever CameraSweep.tsx is actually scaling its sweep
 * by — recreating the pass on a change is fine (not a perf concern; Leva
 * tweaks are infrequent) and matches LensOpticsDepthOfField.tsx/
 * AtmosphericHaze.tsx's own pattern, and SettleDriver.tsx already restarts
 * the whole settle burst — and thus this pass's accumulated history — on
 * any generative-state change anyway.
 */
export function LongExposureBlur() {
  const { halfLifeSeconds } = POST_PROCESSING_CONFIG.motionBlur
  const { cameraMovementMultiplier } = useGenerative()

  const pass = useMemo(
    () => new LongExposureBlurPass({ halfLifeSeconds, movementMultiplier: cameraMovementMultiplier }),
    [halfLifeSeconds, cameraMovementMultiplier],
  )

  useEffect(() => {
    return () => {
      pass.dispose()
    }
  }, [pass])

  return <primitive object={pass} />
}
