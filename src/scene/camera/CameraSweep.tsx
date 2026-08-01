import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { useGenerative } from '../shared/generativeContext'
import { virtualClock } from '../shared/virtualClock'
import { CAMERA_CONFIG } from './config'

const BASE_ROTATION_AMPLITUDE = THREE.MathUtils.degToRad(CAMERA_CONFIG.sweep.rotationAmplitudeDeg)
const MAX_ROTATION_AMPLITUDE = THREE.MathUtils.degToRad(CAMERA_CONFIG.sweep.maxRotationAmplitudeDeg)
const ANGULAR_FREQUENCY = (Math.PI * 2) / CAMERA_CONFIG.sweep.periodSeconds
const ROLL_WEIGHT = CAMERA_CONFIG.sweep.rollWeight

/**
 * The dominant driver of the long-exposure motion-blur look — a wide, slow
 * sweep, not HandheldDrift's fine tremor. Real intentional-camera-movement
 * photography sweeps through one continuous arc during the exposure rather
 * than shaking randomly, and a slow sine wave approximates that well: over
 * the blur pass's short accumulation window (a fraction of the sweep's full
 * period), it looks like steady motion in one direction, which is what
 * produces a linear streak instead of a fuzzy multi-directional smear.
 *
 * Same non-cumulative pattern as HandheldDrift: recomputed fresh from
 * elapsed time every frame and applied via `camera.rotateX/Y/Z` after
 * CameraFraming's own per-frame look-at reset, so it layers on top of
 * that fixed base pose rather than fighting it, and can't run away.
 *
 * `cameraMovementMultiplier` (Leva's Camera > Movement, a manual dial) and
 * `motionBlurStrength` (shared/generative.ts, a per-seed default — how hard
 * *this* render's sweep should swing) both scale the pitch/yaw amplitude
 * together; `motionBlurDirectionAngle` (also per-seed) blends how much of
 * that swing is horizontal (yaw) vs. vertical (pitch), so the streak's
 * direction varies render to render instead of every seed panning the same
 * way. Roll stays fixed/small (`rollWeight`) regardless — a subtle texture
 * wobble, not the sweep's main direction. LongExposureBlurPass.ts's own
 * within-frame streak estimate reads the exact same strength/direction so
 * it never drifts out of sync with what the camera is actually doing.
 *
 * Reads `virtualClock.time` (shared/virtualClock.ts), not real wall-clock
 * time — see that module's docstring for why: this is what lets the whole
 * scene settle into a reproducible still instead of sweeping forever.
 */
export function CameraSweep() {
  const { camera } = useThree()
  const { cameraMovementMultiplier, motionBlurStrength, motionBlurDirectionAngle } = useGenerative()

  useFrame(() => {
    const phase = virtualClock.time * ANGULAR_FREQUENCY
    // Movement (Leva) and motionBlurStrength (seed default, also
    // Leva-overridable — see GenerativeProvider.tsx's "Blur Strength")
    // multiply together, so this clamp is the actual backstop against
    // sweeping far enough off-scene to lose all structure — see
    // camera/config.ts's `maxRotationAmplitudeDeg` docstring.
    const rotationAmplitude = Math.min(BASE_ROTATION_AMPLITUDE * cameraMovementMultiplier * motionBlurStrength, MAX_ROTATION_AMPLITUDE)
    const yawWeight = Math.cos(motionBlurDirectionAngle)
    const pitchWeight = Math.sin(motionBlurDirectionAngle)

    // Per-axis phase offsets keep the sweep from looking like a perfectly
    // mechanical single-axis metronome.
    camera.rotateX(Math.sin(phase + 0.6) * rotationAmplitude * pitchWeight)
    camera.rotateY(Math.sin(phase) * rotationAmplitude * yawWeight)
    camera.rotateZ(Math.sin(phase + 1.3) * rotationAmplitude * ROLL_WEIGHT)
  })

  return null
}
