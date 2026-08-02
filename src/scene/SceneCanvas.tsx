import { Canvas } from '@react-three/fiber'
import type { ReactNode } from 'react'
import { Suspense } from 'react'

interface SceneCanvasProps {
  children: ReactNode
  /**
   * Passed straight through to `<Canvas>`. Deliberately a *prop* driven by
   * CapturedView.tsx's `isGenerating` (shared/captureStore.ts), not a
   * fixed value SettleDriver.tsx fights with an imperative
   * `store.setFrameloop()` call: R3F's `<Canvas>` re-syncs the store's
   * frameloop back to whatever this prop says on every internal config
   * check, so an imperative override from deep inside the tree just gets
   * silently stomped back the next time that check runs — which is
   * exactly the bug that made settle bursts die after 1-2 frames before
   * this was a prop. Routing the toggle through React state instead means
   * the prop *is* the desired value at all times, so there's nothing left
   * to fight.
   */
  frameloop: 'always' | 'demand'
}

/**
 * Top-level R3F canvas. Owns renderer/color-management setup so every
 * downstream component (camera, lighting, effects) can stay unopinionated
 * about it. `preserveDrawingBuffer` is for shared/SettleDriver.tsx's
 * capture step — without it, `gl.domElement.toDataURL()` can capture a
 * blank/cleared buffer since the browser is otherwise free to clear it
 * right after each frame.
 *
 * Deliberately does *not* set `toneMapping`/`toneMappingExposure` here:
 * effects/PostProcessing.tsx's `<EffectComposer>` force-sets
 * `renderer.toneMapping = NoToneMapping` for as long as it's mounted
 * (which is always, in this app), so a renderer-level setting would be
 * silently inert. Real ACES tone mapping lives as a `<ToneMapping>` effect
 * inside that composer instead — see its docstring for why.
 *
 * Also deliberately does *not* set `antialias` in `gl` (removed, was
 * `true`) for the same reason: `<EffectComposer>` renders the scene into
 * its own offscreen target via `RenderPass` (see @react-three/postprocessing's
 * source), never the canvas's own default framebuffer — the one thing the
 * context's native `antialias` flag actually affects. Edge antialiasing on
 * the initial render is EffectComposer's own `multisampling` option
 * instead (see PostProcessing.tsx). Verified this was truly inert, not
 * just theoretically: diffed renders of the same seed with/without the
 * flag against this pipeline's own run-to-run noise floor (LongExposureBlurPass's
 * accumulation is frame-timing-dependent, so even *identical* code renders
 * slightly differently run to run) — the flag's effect was indistinguishable
 * from that noise.
 *
 * This canvas is never actually looked at directly — CapturedView.tsx
 * (src/CapturedView.tsx, this component's caller) renders it fully hidden
 * and displays a captured still image on top instead (shared/
 * captureStore.ts). It exists purely so shared/SettleDriver.tsx has a
 * live WebGL scene to generate that image from.
 */
export function SceneCanvas({ children, frameloop }: SceneCanvasProps) {
  return (
    <Canvas
      dpr={[1, 2]}
      frameloop={frameloop}
      gl={{
        preserveDrawingBuffer: true,
      }}
      style={{ position: 'absolute', inset: 0 }}
    >
      <color attach="background" args={['#0a0908']} />
      <Suspense fallback={null}>{children}</Suspense>
    </Canvas>
  )
}
