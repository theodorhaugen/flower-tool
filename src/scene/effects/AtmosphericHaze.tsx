import { useEffect, useMemo } from 'react'
import { usePalette } from '../shared/paletteContext'
import { POST_PROCESSING_CONFIG } from './config'
import { AtmosphericHazeEffect } from './AtmosphericHazeEffect'

/**
 * R3F wrapper — constructs AtmosphericHazeEffect from the active palette
 * (colour) and effects/config.ts's `atmosphere` block (structural tuning),
 * same pattern as LensOpticsDepthOfField.tsx.
 */
export function AtmosphericHaze() {
  const palette = usePalette()
  const { haze, volumetric } = POST_PROCESSING_CONFIG.atmosphere

  const effect = useMemo(
    () =>
      new AtmosphericHazeEffect({
        color: palette.hazeTint,
        frequency: haze.frequency,
        driftSpeed: haze.driftSpeed,
        hazeStrength: haze.strength,
        depthFalloff: haze.depthFalloff,
        volumetricStrength: volumetric.strength,
        volumetricRadius: volumetric.radius,
      }),
    [palette, haze, volumetric],
  )

  useEffect(() => {
    return () => {
      effect.dispose()
    }
  }, [effect])

  return <primitive object={effect} />
}
