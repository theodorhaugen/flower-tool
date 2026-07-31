import { Canvas } from '@react-three/fiber'
import type { ReactNode } from 'react'
import { Suspense } from 'react'
import * as THREE from 'three'

interface SceneCanvasProps {
  children: ReactNode
}

/**
 * Top-level R3F canvas. Owns renderer/color-management setup so every
 * downstream component (camera, lighting, effects) can stay unopinionated
 * about it.
 */
export function SceneCanvas({ children }: SceneCanvasProps) {
  return (
    <Canvas
      dpr={[1, 2]}
      gl={{
        antialias: true,
        toneMapping: THREE.ACESFilmicToneMapping,
        toneMappingExposure: 1.0,
      }}
      style={{ position: 'absolute', inset: 0 }}
    >
      <color attach="background" args={['#0a0908']} />
      <Suspense fallback={null}>{children}</Suspense>
    </Canvas>
  )
}
