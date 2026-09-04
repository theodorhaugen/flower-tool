import { useThree } from '@react-three/fiber'
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
 * `camera` is the live scene camera (MainCamera.tsx) — the pass reads its
 * real transform each frame to compute the within-frame streak directly,
 * rather than re-deriving CameraSweep.tsx's own sweep formula (see
 * LongExposureBlurPass's class docstring for why that changed). `useThree`
 * returns a stable reference for the app's whole lifetime here (one
 * `<PerspectiveCamera>`, never swapped), so this doesn't recreate the pass
 * on every render.
 *
 * `movementMultiplier` is `motionBlurStrength` (shared/generative.ts — how
 * hard *this* render's sweep should swing, directly Leva-overridable via
 * Camera > Blur Length) threaded through for `recoveryAmount` only (see the
 * pass's constructor) — recreating the pass on a change is fine (not a perf
 * concern; changes are infrequent) and matches LensOpticsDepthOfField.tsx/
 * AtmosphericHaze.tsx's own pattern, and SettleDriver.tsx already restarts
 * the whole settle burst — and thus this pass's accumulated history — on any
 * generative-state change anyway.
 */
export function LongExposureBlur() {
  const { halfLifeSeconds } = POST_PROCESSING_CONFIG.motionBlur
  const { motionBlurStrength } = useGenerative()
  const camera = useThree((state) => state.camera)

  const pass = useMemo(
    () =>
      new LongExposureBlurPass({
        halfLifeSeconds,
        movementMultiplier: motionBlurStrength,
        camera,
      }),
    [halfLifeSeconds, motionBlurStrength, camera],
  )

  useEffect(() => {
    return () => {
      pass.dispose()
    }
  }, [pass])

  return <primitive object={pass} />
}
