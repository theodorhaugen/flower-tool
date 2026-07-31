import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { useGenerative } from '../shared/generativeContext'
import { CAMERA_CONFIG } from './config'

const BASE_ROTATION_AMPLITUDE = THREE.MathUtils.degToRad(CAMERA_CONFIG.sweep.rotationAmplitudeDeg)
const ANGULAR_FREQUENCY = (Math.PI * 2) / CAMERA_CONFIG.sweep.periodSeconds
const [PITCH_WEIGHT, YAW_WEIGHT, ROLL_WEIGHT] = CAMERA_CONFIG.sweep.axisWeights

/**
 * The dominant driver of the long-exposure motion-blur look — a wide, slow
 * sweep (mostly yaw/panning), not HandheldDrift's fine tremor. Real
 * intentional-camera-movement photography sweeps through one continuous
 * arc during the exposure rather than shaking randomly, and a slow sine
 * wave approximates that well: over the blur pass's short accumulation
 * window (a fraction of the sweep's full period), it looks like steady
 * motion in one direction, which is what produces a linear streak instead
 * of a fuzzy multi-directional smear.
 *
 * Same non-cumulative pattern as HandheldDrift: recomputed fresh from
 * elapsed time every frame and applied via `camera.rotateX/Y/Z` after
 * OrbitControls' own update, so it layers on top of the controls rather
 * than fighting them, and can't run away.
 *
 * `cameraMovementMultiplier` (Leva's Camera > Movement) scales this
 * together with HandheldDrift's amplitude — see that component's docstring.
 */
export function CameraSweep() {
  const { camera, clock } = useThree()
  const { cameraMovementMultiplier } = useGenerative()

  useFrame(() => {
    const phase = clock.elapsedTime * ANGULAR_FREQUENCY
    const rotationAmplitude = BASE_ROTATION_AMPLITUDE * cameraMovementMultiplier

    // Per-axis phase offsets keep the sweep from looking like a perfectly
    // mechanical single-axis metronome.
    camera.rotateX(Math.sin(phase + 0.6) * rotationAmplitude * PITCH_WEIGHT)
    camera.rotateY(Math.sin(phase) * rotationAmplitude * YAW_WEIGHT)
    camera.rotateZ(Math.sin(phase + 1.3) * rotationAmplitude * ROLL_WEIGHT)
  })

  return null
}
