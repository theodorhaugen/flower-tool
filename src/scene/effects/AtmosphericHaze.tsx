import { useEffect, useMemo } from 'react'
import { POST_PROCESSING_CONFIG } from './config'
import { AtmosphericHazeEffect } from './AtmosphericHazeEffect'

/**
 * R3F wrapper — constructs AtmosphericHazeEffect from effects/config.ts,
 * same pattern as LensOpticsDepthOfField.tsx.
 */
export function AtmosphericHaze() {
  const { haze, volumetric } = POST_PROCESSING_CONFIG.atmosphere

  const effect = useMemo(
    () =>
      new AtmosphericHazeEffect({
        color: haze.color,
        frequency: haze.frequency,
        driftSpeed: haze.driftSpeed,
        hazeStrength: haze.strength,
        depthFalloff: haze.depthFalloff,
        volumetricStrength: volumetric.strength,
        volumetricRadius: volumetric.radius,
      }),
    [haze, volumetric],
  )

  useEffect(() => {
    return () => {
      effect.dispose()
    }
  }, [effect])

  return <primitive object={effect} />
}
