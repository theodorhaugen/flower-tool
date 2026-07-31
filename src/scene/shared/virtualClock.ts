/**
 * A "virtual" elapsed-time clock, separate from real wall-clock time —
 * CameraSweep/HandheldDrift/wind/AtmosphericHaze/FilmGrain all read this
 * instead of `clock.elapsedTime` so the whole "this is one photograph"
 * illusion holds together: SettleDriver.tsx advances it through a fixed
 * sequence during a short settle burst (building up LongExposureBlurPass's
 * motion-blur trail exactly as it always has, just against a controlled
 * timeline instead of a live one) and then simply stops advancing it,
 * which freezes every one of those systems at once with no per-system
 * "are we frozen" branching — they're all just reading the same number,
 * and the number stopped changing.
 *
 * Deliberately a plain mutable singleton, not React state — every reader
 * is inside a `useFrame` callback (per-frame, not per-render) or a
 * shader's `render`/`update` method, none of which want a React re-render
 * on every tick. `invalidate` is stashed here by SettleDriver.tsx (the one
 * component that actually has it, via `useThree`) so `requestReroll` below
 * can wake the render-on-demand loop from outside the R3F tree — the Leva
 * "Reroll Still" button (GenerativeProvider.tsx) isn't itself inside a
 * component that could call `useThree`.
 */
export interface VirtualClockState {
  time: number
  invalidate: (() => void) | null
}

export const virtualClock: VirtualClockState = { time: 0, invalidate: null }

/** Consumed by SettleDriver.tsx's `useFrame` — sits here rather than as component state since the request can arrive from outside the React tree (the Leva button). */
export const settleRequests = { pendingReroll: false }

/** Wakes the render-on-demand loop and asks SettleDriver.tsx to start a fresh settle burst from a new, randomised moment in the same seed's camera sweep — Leva's Scene > Reroll Still button. */
export function requestReroll(): void {
  settleRequests.pendingReroll = true
  virtualClock.invalidate?.()
}
