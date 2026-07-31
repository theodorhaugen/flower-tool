import { useEffect, useMemo } from 'react'
import { useGenerative } from '../shared/generativeContext'
import { POST_PROCESSING_CONFIG } from './config'
import { FilmGrainPass } from './FilmGrainPass'

/**
 * R3F wrapper for FilmGrainPass — constructed from effects/config.ts's
 * `grain` block (base tuning) and the generative state's
 * `grainAmount`/`grainSize` (Leva's Film fold, 1 = as tuned), same pattern
 * as LongExposureBlur.tsx.
 */
export function FilmGrain() {
  const { grainAmount, grainSize } = useGenerative()
  const { opacity, size } = POST_PROCESSING_CONFIG.grain

  const pass = useMemo(
    () => new FilmGrainPass({ opacity: opacity * grainAmount, grainSize: size * grainSize }),
    [opacity, grainAmount, size, grainSize],
  )

  useEffect(() => {
    return () => {
      pass.dispose()
    }
  }, [pass])

  return <primitive object={pass} />
}
