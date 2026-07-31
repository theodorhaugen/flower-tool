import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useRef } from 'react'
import { CAMERA_CONFIG } from '../camera/config'
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
 * stops — this is the piece that turns "camera sweeps and grass sways
 * forever" into "settles into one reproducible still," by feeding
 * CameraSweep/HandheldDrift/wind/AtmosphericHaze/FilmGrain/
 * LongExposureBlurPass a controlled timeline instead of a live one. Those
 * components don't know or care that the clock they're reading is virtual
 * — the whole point of routing everything through one shared clock is
 * that freezing it freezes all of them at once, with no per-system
 * "are we frozen" logic.
 *
 * A burst runs by switching the canvas to `frameloop="always"` for its
 * duration (the same mode this app always rendered in before settling was
 * added), advancing `virtualClock.time` by each frame's *real* elapsed
 * delta until the running total reaches `SETTLE_VIRTUAL_SECONDS`, then
 * switching to `frameloop="demand"` to actually freeze. Deliberately not
 * a fixed frame count at a fixed virtual step: that would decouple the
 * settled look from real frame timing (a slow/throttled tab would take
 * the same *virtual* streak far too many *real* frames to reach), and
 * deliberately not sustained by repeatedly calling `invalidate()` from
 * inside this same `useFrame` — that self-re-invalidation turned out to
 * be flaky in practice (occasionally failing to schedule the next frame
 * at all), whereas `frameloop="always"` is the same simple, always-runs
 * mechanism the live version relied on the whole time.
 *
 * Mounted once, high in the tree (Experience.tsx), inside `<Canvas>` (needs
 * `useThree`/`useFrame`) and inside `GenerativeProvider` (needs
 * `useGenerative` to notice parameter changes).
 *
 * Two ways a burst starts:
 * - `state` (the *entire* generative state — seed or any Leva control)
 *   changing always restarts the burst from virtual time 0, so the same
 *   seed+parameters always settle into the exact same still — the
 *   reproducibility the "tweak against a stable reference" workflow needs.
 *   Dragging a slider fires this on every intermediate value, which in
 *   practice reads as a live preview while dragging (each restart resets
 *   the streak before the previous burst can finish) that only actually
 *   settles into a blurred still once you let go — a useful side effect,
 *   not a special case.
 * - `settleRequests.pendingReroll` (shared/virtualClock.ts) being set by
 *   Leva's Scene > Reroll Still button jumps to a *randomised* start time
 *   instead of 0, landing on a different — but, once picked, equally
 *   reproducible — moment in the same seed's sweep/drift/wind.
 */
export function SettleDriver() {
  const invalidate = useThree((s) => s.invalidate)
  const setFrameloop = useThree((s) => s.setFrameloop)
  const state = useGenerative()
  /** Virtual seconds still owed before this burst is done. */
  const remainingRef = useRef(0)

  useEffect(() => {
    virtualClock.invalidate = invalidate
  }, [invalidate])

  useEffect(() => {
    virtualClock.time = 0
    remainingRef.current = SETTLE_VIRTUAL_SECONDS
    setFrameloop('always')
    invalidate()
    // `state` is a fresh object on every seed change *and* every Leva
    // control tweak (GenerativeProvider.tsx's useMemo) — that's exactly
    // the "anything that could change the look" signal this wants.
  }, [state, setFrameloop, invalidate])

  useFrame((_, delta) => {
    if (settleRequests.pendingReroll) {
      settleRequests.pendingReroll = false
      virtualClock.time = Math.random() * 1000
      remainingRef.current = SETTLE_VIRTUAL_SECONDS
      setFrameloop('always')
    }

    if (remainingRef.current <= 0) return

    const step = Math.min(delta, remainingRef.current)
    virtualClock.time += step
    remainingRef.current -= step

    if (remainingRef.current <= 0) {
      setFrameloop('demand')
    }
  })

  return null
}
