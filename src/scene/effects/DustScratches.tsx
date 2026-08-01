import { useEffect, useMemo } from 'react'
import { useGenerative } from '../shared/generativeContext'
import { DustScratchesPass } from './DustScratchesPass'

/**
 * R3F wrapper for DustScratchesPass — same `primitive`-as-`Pass` pattern as
 * LongExposureBlur.tsx/FilmGrain.tsx. Seeded from the render's own `seed`
 * (not a Leva control) so the fixed dust/scratch pattern changes along with
 * everything else on a reseed, but stays put across Leva tweaks to the same
 * seed the way a real lens's dust wouldn't move just because you adjusted
 * exposure.
 */
export function DustScratches() {
  const { seed } = useGenerative()

  const pass = useMemo(() => new DustScratchesPass({ seed }), [seed])

  useEffect(() => {
    return () => {
      pass.dispose()
    }
  }, [pass])

  return <primitive object={pass} />
}
