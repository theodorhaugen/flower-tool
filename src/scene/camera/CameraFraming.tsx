import { useFrame, useThree } from '@react-three/fiber'
import { useGenerative } from '../shared/generativeContext'

/**
 * Points the camera at its generative target every frame — the
 * non-interactive replacement for drei's `OrbitControls`. Free-drag
 * orbiting was dropped once the canvas became a hidden generator behind
 * a captured still (shared/captureStore.ts, shared/SettleDriver.tsx):
 * dragging a live 3D view doesn't make sense when what's actually on
 * screen is a flat image, and this tool's framing now comes from Leva's
 * Camera fold sliders instead, each regenerating a fresh capture.
 *
 * Still has to run every frame, not just once, for the same reason
 * `OrbitControls` did: HandheldDrift/CameraSweep apply their sway via
 * `camera.rotateX/Y/Z`, a *relative* rotation on top of whatever
 * orientation the camera already has. Without resetting to this fixed
 * look-at every frame, those small per-frame rotations would compound
 * indefinitely instead of each expressing a fresh, bounded offset from
 * the same base pose. Mounted before HandheldDrift/CameraSweep in
 * Experience.tsx so this reset happens first within the same frame.
 */
export function CameraFraming() {
  const { camera } = useThree()
  const { camera: generativeCamera } = useGenerative()

  useFrame(() => {
    camera.position.set(...generativeCamera.position)
    camera.lookAt(...generativeCamera.target)
  })

  return null
}
