import type { ReactNode } from 'react'
import { useEffect, useMemo } from 'react'
import { deriveGenerativeState, randomSeed } from './generative'
import { GenerativeContext } from './generativeContext'

interface GenerativeProviderProps {
  children: ReactNode
  /** Pins a specific integer seed, overridden by a `?seed=` URL param if present — for tuning/reproducing one deliberately instead of getting a random one. */
  forceSeed?: number
  /** Pins a specific palette by name (see palette.ts's `PALETTES`), overridden by a `?palette=` URL param if present. */
  forcePaletteName?: string
}

/**
 * Picks the one integer seed this render belongs to, once, and derives
 * every generative axis — flower placement/species/colour, the shared
 * meadow layout, terrain, camera vantage point, colour palette, focus
 * distance, bloom intensity, wind (see shared/generative.ts) — from it.
 * Every subsystem below reads the result via `useGenerative()`/
 * `usePalette()` (generativeContext.ts), which is what makes a single seed
 * actually drive the *whole* render instead of just one piece of it.
 *
 * Also readable from `?seed=12345` (and `?palette=Golden%20Hour` to
 * additionally pin just the palette) URL query params, which take
 * priority over the props — a zero-friction way to reproduce or pin a
 * specific render while developing, without editing code. The chosen seed
 * is logged to the console on load specifically so a render worth keeping
 * can be noted down and revisited later.
 */
export function GenerativeProvider({ children, forceSeed, forcePaletteName }: GenerativeProviderProps) {
  const state = useMemo(() => {
    const params = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null
    const seedParam = params?.get('seed')
    const paletteParam = params?.get('palette')

    const parsedSeedParam = seedParam !== null && seedParam !== '' ? Number(seedParam) : Number.NaN
    const seed = Number.isFinite(parsedSeedParam) ? parsedSeedParam : forceSeed ?? randomSeed()

    return deriveGenerativeState(seed, { forcePaletteName: paletteParam ?? forcePaletteName })
    // Deliberately picked once per app load, not re-rolled on every
    // re-render — forceSeed/forcePaletteName are expected static for the
    // provider's lifetime, same as a seed prop elsewhere in this codebase.
  }, [forceSeed, forcePaletteName])

  useEffect(() => {
    console.info(
      `[flower-tool] seed=${state.seed} palette="${state.palette.name}" — reproduce with ?seed=${state.seed}`,
    )
  }, [state])

  return <GenerativeContext.Provider value={state}>{children}</GenerativeContext.Provider>
}
