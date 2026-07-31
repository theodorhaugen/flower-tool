import type { ReactNode } from 'react'
import { useMemo } from 'react'
import { pickPalette } from './palette'
import { PaletteContext } from './paletteContext'

interface PaletteProviderProps {
  children: ReactNode
  /** Pins a specific palette by name (see palette.ts's `PALETTES`) — for tuning/screenshotting one deliberately instead of getting a random one. */
  forceName?: string
}

/**
 * Picks the one palette this render belongs to, once, and makes it
 * available to every subsystem below it via `usePalette()` (paletteContext.ts)
 * — flowers, environment, lighting, and post-processing all read from the
 * same instance, which is what keeps them cohesive instead of independently
 * colourful. Also readable from a `?palette=Golden%20Hour` URL query
 * param, which takes priority over `forceName`, as a zero-friction way to
 * pin one while developing without editing code.
 */
export function PaletteProvider({ children, forceName }: PaletteProviderProps) {
  const palette = useMemo(() => {
    const fromUrl =
      typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('palette') : null
    return pickPalette(fromUrl ?? forceName)
    // Deliberately picked once per app load, same as a seed, not re-rolled
    // on every re-render — forceName is expected static for the provider's
    // lifetime, same as a seed prop elsewhere in this codebase.
  }, [forceName])

  return <PaletteContext.Provider value={palette}>{children}</PaletteContext.Provider>
}
