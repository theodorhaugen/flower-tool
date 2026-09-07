import { useEffect, useMemo } from 'react'
import { useEnvironmentPaletteColors } from '../environment/paletteColors'
import { useGenerative } from '../shared/generativeContext'
import { POST_PROCESSING_CONFIG } from './config'
import { AtmosphericHazeEffect } from './AtmosphericHazeEffect'

/**
 * R3F wrapper — constructs AtmosphericHazeEffect from the active palette
 * (colour) and effects/config.ts's `atmosphere` block (structural tuning),
 * same pattern as LensOpticsDepthOfField.tsx. `hazeAmount` (Leva's
 * Atmosphere > Haze) scales the haze/volumetric strength together — 1 = as
 * tuned. Reads `fogColor` (environment/paletteColors.ts's derived,
 * whitened `backgroundSecondary` — see its own docstring), not the raw
 * palette value directly, so this screen-space haze reads as the same air
 * as the scene fog instead of two independently-tinted atmospheres, and
 * inherits that colour's brightness fix rather than needing its own.
 *
 * `palette.atmosphereScale` (optional, defaults to 1) additionally scales
 * strength/depthFalloff/volumetric-strength together — see its docstring in
 * shared/palette.ts for why a palette would want less than the tuned default.
 */
export function AtmosphericHaze() {
  const { palette, hazeAmount } = useGenerative()
  const { fogColor } = useEnvironmentPaletteColors()
  const { haze, volumetric } = POST_PROCESSING_CONFIG.atmosphere
  const atmosphereScale = palette.atmosphereScale ?? 1

  const effect = useMemo(
    () =>
      new AtmosphericHazeEffect({
        color: fogColor,
        frequency: haze.frequency,
        driftSpeed: haze.driftSpeed,
        hazeStrength: haze.strength * hazeAmount * atmosphereScale,
        depthFalloff: haze.depthFalloff * atmosphereScale,
        volumetricStrength: volumetric.strength * hazeAmount * atmosphereScale,
        volumetricRadius: volumetric.radius,
      }),
    [fogColor, haze, volumetric, hazeAmount, atmosphereScale],
  )

  useEffect(() => {
    return () => {
      effect.dispose()
    }
  }, [effect])

  return <primitive object={effect} />
}
