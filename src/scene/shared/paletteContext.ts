import { createContext, useContext } from 'react'
import type { ColorPalette } from './palette'

/**
 * Split from PaletteProvider.tsx so that file only exports the component
 * (needed for fast-refresh) — the context object and hook are plain logic,
 * not JSX, same split as shared/instancing.ts vs InstancedGroup.tsx.
 */
export const PaletteContext = createContext<ColorPalette | null>(null)

/** The active render's palette — throws if used outside `<PaletteProvider>` so a missing provider fails loudly, not with silent defaults. */
export function usePalette(): ColorPalette {
  const palette = useContext(PaletteContext)
  if (!palette) {
    throw new Error('usePalette() called outside <PaletteProvider>')
  }
  return palette
}
