import { Canvas } from '@react-three/fiber'
import type { ReactNode } from 'react'
import { Suspense } from 'react'

interface SceneCanvasProps {
  children: ReactNode
}

/**
 * Top-level R3F canvas. Owns renderer/color-management setup so every
 * downstream component (camera, lighting, effects) can stay unopinionated
 * about it. `preserveDrawingBuffer` is for effects/ExportControls.tsx's
 * "Save Image" button — without it, `gl.domElement.toDataURL()` can
 * capture a blank/cleared buffer since the browser is otherwise free to
 * clear it right after each frame.
 *
 * Deliberately does *not* set `toneMapping`/`toneMappingExposure` here:
 * effects/PostProcessing.tsx's `<EffectComposer>` force-sets
 * `renderer.toneMapping = NoToneMapping` for as long as it's mounted
 * (which is always, in this app), so a renderer-level setting would be
 * silently inert. Real ACES tone mapping lives as a `<ToneMapping>` effect
 * inside that composer instead — see its docstring for why.
 *
 * `frameloop="demand"`: nothing here free-runs on its own — every
 * animated system (camera sweep/drift, wind, haze drift, film grain, the
 * long-exposure blur trail) reads shared/virtualClock.ts's virtual time
 * rather than real elapsed time, and shared/SettleDriver.tsx is the only
 * thing that advances it, in a short deterministic burst rather than
 * forever. Rendering only actually happens when something calls
 * `invalidate()` — SettleDriver during a settle burst, or `OrbitControls`
 * on drag (it calls `invalidate()` itself, no extra wiring needed) — so
 * the canvas genuinely sits idle on an unchanging frame once settled,
 * rather than a live loop that just happens to look the same frame to
 * frame.
 */
export function SceneCanvas({ children }: SceneCanvasProps) {
  return (
    <Canvas
      dpr={[1, 2]}
      frameloop="demand"
      gl={{
        antialias: true,
        preserveDrawingBuffer: true,
      }}
      style={{ position: 'absolute', inset: 0 }}
    >
      <color attach="background" args={['#0a0908']} />
      <Suspense fallback={null}>{children}</Suspense>
    </Canvas>
  )
}
