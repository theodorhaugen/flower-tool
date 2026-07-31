import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { noise1D } from '../shared/noise'
import { CAMERA_CONFIG } from './config'

const ROTATION_AMPLITUDE = THREE.MathUtils.degToRad(CAMERA_CONFIG.drift.rotationAmplitudeDeg)
const POSITION_AMPLITUDE = CAMERA_CONFIG.drift.positionAmplitude

/** Two layered noise frequencies (slow sway + a faster tremor) rather than one sine — reads as organic, not mechanical. */
function driftAxis(t: number, seed: number, slowFreq: number, fastFreq: number): number {
  const slow = (noise1D(t * slowFreq, seed) - 0.5) * 2
  const fast = (noise1D(t * fastFreq, seed + 37) - 0.5) * 2
  return slow * 0.7 + fast * 0.3
}

/**
 * Subtle handheld sway layered on top of OrbitControls every frame — small
 * enough to read as a hand holding a macro lens, not camera shake. Must be
 * mounted after CameraControls in the tree so its useFrame callback runs
 * later in the same (default-priority) frame. Each frame's offset is
 * recomputed fresh from elapsed time rather than accumulated, so it can
 * never run away or fight the controls — next frame OrbitControls resets
 * from its own internal state regardless of what this nudged last frame.
 */
export function HandheldDrift() {
  const { camera, clock } = useThree()

  useFrame(() => {
    const t = clock.elapsedTime

    camera.position.x += driftAxis(t, 11, 0.12, 0.5) * POSITION_AMPLITUDE
    camera.position.y += driftAxis(t, 53, 0.15, 0.6) * POSITION_AMPLITUDE * 0.7
    camera.position.z += driftAxis(t, 97, 0.1, 0.45) * POSITION_AMPLITUDE * 0.5

    camera.rotateX(driftAxis(t, 131, 0.11, 0.55) * ROTATION_AMPLITUDE)
    camera.rotateY(driftAxis(t, 173, 0.13, 0.5) * ROTATION_AMPLITUDE)
    camera.rotateZ(driftAxis(t, 211, 0.09, 0.4) * ROTATION_AMPLITUDE * 0.6)
  })

  return null
}
