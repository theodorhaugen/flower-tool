import { useThree } from '@react-three/fiber'
import { button, useControls } from 'leva'
import { useGenerative } from '../shared/generativeContext'

/**
 * Designer-facing export actions — not a rendered effect, just two Leva
 * buttons. Needs `gl` (the renderer/canvas), so unlike the Scene fold this
 * has to live inside `<Canvas>`; mounted alongside PostProcessing in
 * Experience.tsx.
 */
export function ExportControls() {
  const { gl } = useThree()
  const { seed, palette } = useGenerative()

  useControls(
    'Export',
    () => ({
      'Save Image': button(() => {
        const link = document.createElement('a')
        link.download = `flower-field-seed-${seed}.png`
        // Requires SceneCanvas.tsx's preserveDrawingBuffer — otherwise this
        // can capture a blank/cleared buffer instead of the last frame.
        link.href = gl.domElement.toDataURL('image/png')
        link.click()
      }),
      'Copy Seed Link': button(() => {
        const url = new URL(window.location.href)
        url.searchParams.set('seed', String(seed))
        url.searchParams.set('palette', palette.name)
        navigator.clipboard?.writeText(url.toString())
      }),
    }),
    [seed, palette, gl],
  )

  return null
}
