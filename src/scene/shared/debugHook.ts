import type { GenerativeState } from './generative'
import { getCaptureState } from './captureStore'
import { requestReroll } from './virtualClock'

type FoldSetter = (partial: Record<string, unknown>) => void

/**
 * Scriptable equivalent of dragging a Leva slider, one function per fold
 * (`setCamera({ blurLength: 1.7 })` is exactly what `Camera.blurLength`'s
 * slider does internally) — nothing here reaches any capability beyond
 * what the visible panel already exposes to every visitor, this is just a
 * DOM-independent way to reach it. Built specifically so automated
 * testing/verification stops depending on Leva's own DOM structure (input
 * ids, its drag/keyboard-commit quirks) — that dependency broke outright
 * more than once in the same session it was being relied on, and would
 * break completely the moment a custom UI replaces Leva's rendered panel.
 * As long as *some* state-setting layer (Leva today, whatever replaces it
 * later) keeps calling `installFlowerToolDebugHook`, test scripts written
 * against this API keep working unchanged across that swap.
 */
export interface FlowerToolDebugHook {
  /** The currently active, fully-merged generative state (seed defaults + every fold's live overrides) — the same object every subsystem in the scene reads via `useGenerative()`. */
  getState: () => GenerativeState
  setScene: FoldSetter
  setCamera: FoldSetter
  setLighting: FoldSetter
  setFlowers: FoldSetter
  setColour: FoldSetter
  setAtmosphere: FoldSetter
  setLens: FoldSetter
  setFilm: FoldSetter
  setGrass: FoldSetter
  /** Leva's Scene > Reroll Still button, callable without touching the DOM. */
  reroll: () => void
  /**
   * Resolves with the freshly captured still's data URL once the active
   * settle burst finishes (shared/captureStore.ts's `isGenerating` flips
   * back to false) — replaces polling the DOM for a "Generating…" label to
   * disappear, which has no defined contract to test against and breaks
   * the moment that markup changes. Any `set*` call above (or a fresh
   * page load) starts a new burst; call this right after to wait it out.
   */
  waitForSettle: (timeoutMs?: number) => Promise<string>
}

declare global {
  interface Window {
    __flowerToolDebug?: FlowerToolDebugHook
  }
}

const DEFAULT_TIMEOUT_MS = 60_000
const POLL_INTERVAL_MS = 100

function waitForSettle(timeoutMs = DEFAULT_TIMEOUT_MS): Promise<string> {
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + timeoutMs

    const poll = () => {
      const { isGenerating, imageUrl } = getCaptureState()
      if (!isGenerating && imageUrl) {
        resolve(imageUrl)
        return
      }
      if (Date.now() > deadline) {
        reject(new Error(`waitForSettle timed out after ${timeoutMs}ms — isGenerating=${isGenerating}`))
        return
      }
      setTimeout(poll, POLL_INTERVAL_MS)
    }

    poll()
  })
}

/**
 * Wires the active fold setters (and a live state reader) up to
 * `window.__flowerToolDebug` — called once from GenerativeProvider.tsx,
 * which is the one place that actually holds every fold's Leva `set`
 * function. Unconditional, not gated behind a dev/debug flag: everything
 * reachable through this hook is already fully user-facing through the
 * visible Leva panel in the current build, so this isn't granting a new
 * capability, just a scriptable route to an existing one.
 */
export function installFlowerToolDebugHook(setters: Omit<FlowerToolDebugHook, 'reroll' | 'waitForSettle'>): void {
  if (typeof window === 'undefined') return
  window.__flowerToolDebug = {
    ...setters,
    reroll: requestReroll,
    waitForSettle,
  }
}
