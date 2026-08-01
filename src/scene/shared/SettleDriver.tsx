import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useRef } from 'react'
import { CAMERA_CONFIG } from '../camera/config'
import { beginCapture, finishCapture } from './captureStore'
import { useGenerative } from './generativeContext'
import { settleRequests, virtualClock } from './virtualClock'

/**
 * One full sweep period's worth of virtual time — long enough for
 * LongExposureBlurPass's history to converge close to its steady-state
 * streak (its half-life is well under a second, see effects/config.ts's
 * `motionBlur` block), and landing back on the sweep's own period means
 * the freeze point sits at the same phase the burst started from, rather
 * than an arbitrary point that might freeze mid-reversal with almost no
 * streak.
 */
const SETTLE_VIRTUAL_SECONDS = CAMERA_CONFIG.sweep.periodSeconds

/**
 * Drives `virtualClock.time` (shared/virtualClock.ts) through a short,
 * deterministic burst on mount and on every seed/parameter change, then
 * captures the result — this is the piece that turns "camera sweeps and
 * grass sways forever" into "generates one reproducible still per
 * seed/parameter-set," by feeding CameraFraming/HandheldDrift/
 * CameraSweep/wind/AtmosphericHaze/LongExposureBlurPass a
 * controlled timeline instead of a live one. Those components don't know
 * or care that the clock they're reading is virtual — the whole point of
 * routing everything through one shared clock is that freezing it
 * freezes all of them at once, with no per-system "are we frozen" logic.
 *
 * A burst runs by calling `beginCapture()` (shared/captureStore.ts), which
 * flips `isGenerating` to `true` — CapturedView.tsx reads that and passes
 * `frameloop="always"` down to `<Canvas>` for as long as it stays true,
 * so the hidden scene actually renders. This component then advances
 * `virtualClock.time` by each frame's *real* elapsed delta until the
 * running total reaches `SETTLE_VIRTUAL_SECONDS`, captures the canvas to
 * a data URL via `finishCapture()`, which flips `isGenerating` back to
 * `false` and — through that same prop — lets the canvas go idle again.
 *
 * This does *not* call `useThree().setFrameloop()` directly, even though
 * that's available and looks like the obvious way to toggle rendering on
 * and off from in here. It doesn't work: `<Canvas>` re-syncs the store's
 * frameloop back to match its own `frameloop` *prop* on every internal
 * config check, so an imperative override from deep inside the tree gets
 * silently stomped back within a frame or two — which is exactly what
 * made early versions of this settle after only 1-2 frames instead of the
 * full burst. Routing the toggle through `isGenerating` (React state the
 * prop is actually derived from) means there's nothing left to fight.
 * `invalidate()` is still called directly, though — unlike a frameloop
 * *value*, requesting one more frame is a one-shot action, not a
 * standing state something else could contradict.
 *
 * The capture itself is deferred by exactly one more `useFrame` tick
 * rather than happening the instant `remainingRef` reaches zero: this
 * callback runs *before* the composer's own render for the same tick (see
 * camera/CameraSweep.tsx's docstring on subscriber ordering), so the
 * settled frame's pixels haven't actually reached the canvas yet the
 * moment the burst's last step completes. By the time the *next* tick's
 * callback runs, the previous tick's `update()` — composer render
 * included — has fully returned, so `toDataURL()` is guaranteed to read
 * the finished image rather than the one before it.
 *
 * Every tick during an active burst also calls `invalidate()` directly,
 * on top of relying on the `frameloop="always"` prop above — belt and
 * suspenders. React's state update from `beginCapture()` (which is what
 * eventually flips that prop) is asynchronous relative to this callback,
 * so there's a real window right at a burst's start where the canvas's
 * frameloop is still technically `"demand"` as far as the store is
 * concerned; explicitly requesting the next frame each tick keeps the
 * burst self-sustaining through that window regardless of exactly when
 * the prop update lands.
 *
 * Mounted once, high in the tree (Experience.tsx), inside `<Canvas>` (needs
 * `useThree`/`useFrame`) and inside `GenerativeProvider` (needs
 * `useGenerative` to notice parameter changes).
 *
 * Two ways a burst starts:
 * - `state` (the *entire* generative state — seed or any Leva control)
 *   changing always restarts the burst from virtual time 0, so the same
 *   seed+parameters always generate the exact same still — the
 *   reproducibility the "tweak against a stable reference" workflow needs.
 * - `settleRequests.pendingReroll` (shared/virtualClock.ts) being set by
 *   Leva's Scene > Reroll Still button jumps to a *randomised* start time
 *   instead of 0, landing on a different — but, once picked, equally
 *   reproducible — moment in the same seed's sweep/drift/wind.
 */
export function SettleDriver() {
  const invalidate = useThree((s) => s.invalidate)
  const state = useGenerative()
  /** Virtual seconds still owed before this burst is done. */
  const remainingRef = useRef(0)
  /** True for exactly the one extra tick after `remainingRef` reaches 0 — see the class docstring. */
  const captureNextRef = useRef(false)

  useEffect(() => {
    virtualClock.invalidate = invalidate
  }, [invalidate])

  useEffect(() => {
    virtualClock.time = 0
    remainingRef.current = SETTLE_VIRTUAL_SECONDS
    captureNextRef.current = false
    beginCapture()
    invalidate()
    // `state` is a fresh object on every seed change *and* every Leva
    // control tweak (GenerativeProvider.tsx's useMemo) — that's exactly
    // the "anything that could change the look" signal this wants.
  }, [state, invalidate])

  useFrame((threeState, delta) => {
    if (captureNextRef.current) {
      captureNextRef.current = false
      finishCapture(threeState.gl.domElement.toDataURL('image/png'))
      return
    }

    if (settleRequests.pendingReroll) {
      settleRequests.pendingReroll = false
      virtualClock.time = Math.random() * 1000
      remainingRef.current = SETTLE_VIRTUAL_SECONDS
      captureNextRef.current = false
      beginCapture()
    }

    if (remainingRef.current <= 0) return

    const step = Math.min(delta, remainingRef.current)
    virtualClock.time += step
    remainingRef.current -= step
    captureNextRef.current = remainingRef.current <= 0
    invalidate()
  })

  return null
}
