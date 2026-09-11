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
 * Hard cap on how much virtual time a single real frame's `delta` is
 * allowed to advance the burst by — see the `useFrame` callback below for
 * why this exists at all.
 *
 * Tightened, 1/20 → 1/60: this cap doubles as the *granularity* of
 * LongExposureBlurPass's temporal accumulation whenever real rendering runs
 * slower than it (see that class's docstring on `elapsed`) — each real
 * frame contributes one accumulated "layer" at whatever position the
 * camera's sweep has reached, so a coarser cap means a bigger jump between
 * adjacent layers. Traced a persistent diagonal banding artifact (visible
 * on heavily-blurred renders, worse since Camera > Zoom started defaulting
 * every render to a narrower FOV than the fixed 22° this whole pipeline was
 * originally tuned against — see LongExposureBlurPass.ts's `MAX_STREAK_UV`
 * docstring) to exactly this: at the old 1/20 cap, the worst-case jump
 * between layers came out over 20% of the frame width — no amount of
 * within-frame streak smearing (raised twice chasing this same symptom,
 * see LongExposureBlurPass.ts's `STREAK_TAPS`/`MAX_STREAK_UV`) fully hid a
 * gap that wide. 1/60 — an ordinary 60fps-equivalent floor — cuts that
 * worst case to roughly a third.
 *
 * This only costs anything on hardware/scenes that can't already sustain
 * 60fps through this pipeline's full post-processing stack: on faster
 * hardware `delta` never exceeds the cap, so it never engages and settle
 * time is unaffected. Below 60fps, the burst takes proportionally longer
 * (more real frames needed to cover the same fixed virtual duration) in
 * exchange for the finer, smoother accumulation.
 */
const MAX_VIRTUAL_STEP_SECONDS = 1 / 60

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
 * Encoded as JPEG, not PNG: GrainOverlay's whole point is real per-pixel
 * film-grain noise laid over the final image, which is exactly the kind of
 * content PNG's lossless deflate compresses worst — measured multi-MB
 * exports for what's otherwise a fairly smooth photographic image. JPEG's
 * DCT-based compression handles that noise far better; 0.92 quality is
 * visually indistinguishable from the PNG on this pipeline's own output
 * while running a fraction of the size.
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
      finishCapture(threeState.gl.domElement.toDataURL('image/jpeg', 0.92))
      return
    }

    if (settleRequests.pendingReroll) {
      settleRequests.pendingReroll = false
      // Quantised to a whole number of sweep periods, not a bare
      // `Math.random() * 1000` — CameraSweep.tsx's zero-at-capture
      // invariant (see its docstring) only holds when the burst's *start*
      // time is itself a multiple of `periodSeconds`, since capture always
      // lands exactly one more period after the start. An unquantised
      // start landed capture at an arbitrary sweep phase instead of zero,
      // reopening the same subject-pitched-out-of-frame bug the phase fix
      // solved on the normal (non-reroll) path — confirmed to hit roughly
      // half of all rerolls. Wind/drift/haze all run at frequencies
      // unrelated to the sweep period, so quantising the start still
      // lands on a genuinely different moment for those — reroll's actual
      // purpose — without reintroducing the framing bug.
      const periods = Math.floor(Math.random() * 400)
      virtualClock.time = periods * CAMERA_CONFIG.sweep.periodSeconds
      remainingRef.current = SETTLE_VIRTUAL_SECONDS
      captureNextRef.current = false
      beginCapture()
    }

    if (remainingRef.current <= 0) return

    // `delta` also gets capped at `MAX_VIRTUAL_STEP_SECONDS`, not just
    // `remainingRef.current` — the real frame right after a parameter
    // change is often the one that has to rebuild the flower field's own
    // geometry/materials, which can make that single real frame take far
    // longer than a normal one. Left uncapped, that one slow frame's own
    // `delta` could — and, verified directly, did — cover most or all of
    // `SETTLE_VIRTUAL_SECONDS` by itself: the burst would end after that
    // one frame, whose `elapsed` versus the *previous* burst's leftover
    // `lastVirtualTime` is negative (a fresh-burst hard cut, see
    // LongExposureBlurPass's own docstring), so it's captured with zero
    // accumulated history and zero within-frame streak — grass, petals,
    // and centres suddenly reading fully sharp despite a real Blur Length,
    // right after changing an unrelated parameter. Capping the step forces
    // the burst to keep going across however many *more* real frames
    // (fast again, once that one rebuild is done) it actually takes to
    // spend the full virtual budget, giving LongExposureBlurPass's
    // temporal accumulation the real frame count it needs to converge
    // before capture, regardless of how slow any single frame was.
    const step = Math.min(delta, remainingRef.current, MAX_VIRTUAL_STEP_SECONDS)
    virtualClock.time += step
    remainingRef.current -= step
    captureNextRef.current = remainingRef.current <= 0
    invalidate()
  })

  return null
}
