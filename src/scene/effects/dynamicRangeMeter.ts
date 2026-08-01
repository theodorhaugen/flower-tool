export interface DynamicRangeMeterState {
  blackPoint: number
  whitePoint: number
}

/**
 * Auto-levels feedback state — DynamicRangeMeterPass (last in the pipeline,
 * see PostProcessing.tsx) measures each rendered frame's actual luminance
 * spread and writes a corrective black/white point here; PaletteGradePass
 * (first in the pipeline) reads it back out on the *next* frame and applies
 * it as a levels stretch, so shadows/highlights stay defined regardless of
 * how a given seed/palette/lighting combination would otherwise land. A
 * plain mutable singleton rather than React state, for the same reason
 * virtualClock.ts is one — every reader/writer here is inside a Pass's own
 * per-frame `render()`, not a React render, and neither side wants a
 * re-render on every tick.
 *
 * The one-frame lag (this frame's measurement lands on the *next* frame's
 * grade) is deliberate, not a bug — SettleDriver.tsx's settle burst runs
 * many frames before the capture, plenty of room for this to converge well
 * before the frame that actually gets captured, the same way a real
 * camera's auto-exposure meters off the previous frame rather than the one
 * it's currently taking.
 *
 * Reset to the neutral (0, 1) — no stretch — at the start of every settle
 * burst (SettleDriver.tsx), not left at whatever the previous render
 * converged to: this project's whole "same seed+parameters always
 * reproduce the exact same still" guarantee would otherwise quietly break,
 * since the same seed could converge to a very slightly different final
 * stretch depending on what happened to render immediately before it in
 * the same session.
 */
export const dynamicRangeMeter: DynamicRangeMeterState = { blackPoint: 0, whitePoint: 1 }
