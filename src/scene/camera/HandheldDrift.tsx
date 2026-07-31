import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { useGenerative } from '../shared/generativeContext'
import { noise1D } from '../shared/noise'
import { virtualClock } from '../shared/virtualClock'
import { CAMERA_CONFIG } from './config'

const BASE_ROTATION_AMPLITUDE = THREE.MathUtils.degToRad(CAMERA_CONFIG.drift.rotationAmplitudeDeg)
const BASE_POSITION_AMPLITUDE = CAMERA_CONFIG.drift.positionAmplitude

/** Two layered noise frequencies (slow sway + a faster tremor) rather than one sine — reads as organic, not mechanical. */
function driftAxis(t: number, seed: number, slowFreq: number, fastFreq: number): number {
  const slow = (noise1D(t * slowFreq, seed) - 0.5) * 2
  const fast = (noise1D(t * fastFreq, seed + 37) - 0.5) * 2
  return slow * 0.7 + fast * 0.3
}

/**
 * Subtle handheld sway layered on top of CameraFraming's per-frame look-at
 * reset — small enough to read as a hand holding a macro lens, not camera
 * shake. Must be mounted after CameraFraming in the tree so its useFrame
 * callback runs later in the same (default-priority) frame. Each frame's
 * offset is recomputed fresh from elapsed time rather than accumulated, so
 * it can never run away or fight that reset — next frame CameraFraming
 * resets to its fixed base pose regardless of what this nudged last frame.
 *
 * `cameraMovementMultiplier` (Leva's Camera > Movement, see
 * shared/GenerativeProvider.tsx) scales this together with CameraSweep's
 * amplitude, so a designer has one "how much does the shot move" dial
 * rather than two separately-named amplitude sliders.
 *
 * Reads `virtualClock.time` (shared/virtualClock.ts), not real wall-clock
 * time — see CameraSweep.tsx's docstring for why.
 */
export function HandheldDrift() {
  const { camera } = useThree()
  const { cameraMovementMultiplier } = useGenerative()

  useFrame(() => {
    const t = virtualClock.time
    const positionAmplitude = BASE_POSITION_AMPLITUDE * cameraMovementMultiplier
    const rotationAmplitude = BASE_ROTATION_AMPLITUDE * cameraMovementMultiplier

    camera.position.x += driftAxis(t, 11, 0.12, 0.5) * positionAmplitude
    camera.position.y += driftAxis(t, 53, 0.15, 0.6) * positionAmplitude * 0.7
    camera.position.z += driftAxis(t, 97, 0.1, 0.45) * positionAmplitude * 0.5

    camera.rotateX(driftAxis(t, 131, 0.11, 0.55) * rotationAmplitude)
    camera.rotateY(driftAxis(t, 173, 0.13, 0.5) * rotationAmplitude)
    camera.rotateZ(driftAxis(t, 211, 0.09, 0.4) * rotationAmplitude * 0.6)
  })

  return null
}
