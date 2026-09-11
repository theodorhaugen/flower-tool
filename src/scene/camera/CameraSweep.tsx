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
 * `motionBlurStrength` (shared/generative.ts — a per-seed default, directly
 * Leva-overridable via Camera > Blur Length, see GenerativeProvider.tsx)
 * is the single dial on the pitch/yaw amplitude; `motionBlurDirectionAngle`
 * (also per-seed/Leva-overridable, Camera > Blur Direction) blends how much
 * of that swing is horizontal (yaw) vs. vertical (pitch), so the streak's
 * direction varies render to render instead of every seed panning the same
 * way. `cameraMovementMultiplier` is a separate fixed baseline (always 1,
 * not Leva-exposed) that only HandheldDrift's tremor still reads — the two
 * used to be one shared "Movement" dial scaling both effects together,
 * which meant fine-tuning it *and* Blur Length jointly for one look; now
 * Blur Length alone owns the sweep/streak's strength. Roll stays
 * fixed/small (`rollWeight`) regardless — a subtle texture wobble, not the
 * sweep's main direction. LongExposureBlurPass.ts's own within-frame streak
 * estimate reads the exact same strength/direction so it never drifts out
 * of sync with what the camera is actually doing.
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
    // `cameraMovementMultiplier` is a fixed 1 here (see this component's
    // docstring) — `motionBlurStrength` (Leva's "Blur Length") is what
    // actually varies. Still clamped: even Blur Length alone, maxed, can
    // land close to the tested-safe ceiling — see camera/config.ts's
    // `maxRotationAmplitudeDeg` docstring.
    const rotationAmplitude = Math.min(BASE_ROTATION_AMPLITUDE * cameraMovementMultiplier * motionBlurStrength, MAX_ROTATION_AMPLITUDE)
    const yawWeight = Math.cos(motionBlurDirectionAngle)
    const pitchWeight = Math.sin(motionBlurDirectionAngle)

    // Pitch and yaw share the exact same phase (both scaled by sin(phase),
    // just weighted by cos/sin of the direction angle) so the sweep traces
    // a straight line through the origin along `motionBlurDirectionAngle`
    // rather than an ellipse — and, just as importantly, so *both* axes
    // are exactly zero whenever `phase` is a multiple of 2π, which is
    // precisely when SettleDriver.tsx freezes and captures (one full
    // `periodSeconds` of virtual time). A previous version offset pitch by
    // a fixed +0.6 rad "to avoid looking mechanical" — but that meant the
    // *captured* frame carried a real pitch tilt (up to sin(0.6) ≈ 57% of
    // full amplitude) whenever a seed's direction had any vertical
    // component, pitching the composed subject out of frame entirely on a
    // meaningful fraction of seeds. Roll (below) keeps its own offset since
    // a few degrees of roll at capture is a harmless wobble, not a framing
    // break.
    camera.rotateX(Math.sin(phase) * rotationAmplitude * pitchWeight)
    camera.rotateY(Math.sin(phase) * rotationAmplitude * yawWeight)
    camera.rotateZ(Math.sin(phase + 1.3) * rotationAmplitude * ROLL_WEIGHT)
  })

  return null
}
