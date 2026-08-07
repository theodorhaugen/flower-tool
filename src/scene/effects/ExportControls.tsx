import { button, useControls } from 'leva'
import { getCaptureState } from '../shared/captureStore'
import { useGenerative } from '../shared/generativeContext'

/**
 * Designer-facing export actions — not a rendered effect, just two Leva
 * buttons.
 *
 * "Save Image" downloads shared/captureStore.ts's already-captured
 * image rather than re-capturing the canvas itself — this is deliberate:
 * it guarantees the export is *exactly* the pixels CapturedView.tsx has
 * been showing on screen, not a fresh (and potentially different, if a
 * regeneration happened to be mid-flight) render. That guarantee is the
 * whole point of the capture-first flow — no more exporting an image you
 * hadn't actually seen yet.
 */
export function ExportControls() {
  const { seed, palette } = useGenerative()

  useControls(
    'Export',
    () => ({
      'Save Image': button(() => {
        const { imageUrl } = getCaptureState()
        if (!imageUrl) return
        const link = document.createElement('a')
        link.download = `flower-field-seed-${seed}.jpg`
        link.href = imageUrl
        link.click()
      }),
      'Copy Seed Link': button(() => {
        const url = new URL(window.location.href)
        url.searchParams.set('seed', String(seed))
        url.searchParams.set('palette', palette.name)
        navigator.clipboard?.writeText(url.toString())
      }),
    }),
    [seed, palette],
  )

  return null
}
