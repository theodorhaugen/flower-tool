import { useSyncExternalStore } from 'react'

export interface CaptureState {
  imageUrl: string | null
  isGenerating: boolean
}

/**
 * What the user actually sees (CapturedView.tsx) — the WebGL canvas
 * itself is hidden; this is the one flat captured image standing in for
 * it, plus whether a fresh one is being generated right now. A plain
 * external store rather than React state/context: the writer
 * (shared/SettleDriver.tsx) lives deep inside the R3F tree and only ever
 * needs to push updates, not read anything reactively, so there's no
 * need for a Context Provider wrapping the canvas just to get a value
 * out of it — `useCaptureState` below is the one reactive read, via
 * `useSyncExternalStore`.
 *
 * `isGenerating` starts `true` and `imageUrl` starts `null` so the very
 * first render shows "generating" rather than a blank/broken image
 * before the first capture ever completes.
 */
let state: CaptureState = { imageUrl: null, isGenerating: true }
const listeners = new Set<() => void>()

function emit(): void {
  listeners.forEach((listener) => listener())
}

/** One-off, non-reactive read — effects/ExportControls.tsx's "Save Image" button wants the current image at click time, not a subscription. */
export function getCaptureState(): CaptureState {
  return state
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/**
 * Called the moment a new settle burst starts (shared/SettleDriver.tsx) —
 * deliberately keeps the previous `imageUrl` rather than clearing it, so
 * regenerating reads as "updating this image" (CapturedView.tsx layers a
 * label over the stale image) rather than flashing to blank.
 */
export function beginCapture(): void {
  state = { ...state, isGenerating: true }
  emit()
}

/** Called once a burst has settled and the frame has been captured. */
export function finishCapture(imageUrl: string): void {
  state = { imageUrl, isGenerating: false }
  emit()
}

/** CapturedView.tsx's one reactive read of the above. */
export function useCaptureState(): CaptureState {
  return useSyncExternalStore(subscribe, getCaptureState)
}
