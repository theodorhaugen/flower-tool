import { useGenerative } from '../shared/generativeContext'
import { ENVIRONMENT_CONFIG } from './config'
import { useEnvironmentPaletteColors } from './paletteColors'

/**
 * Atmospheric depth cue — also what makes the horizon blend seamlessly
 * with the terrain's far edge. `fogDensityMultiplier` (Leva's Atmosphere >
 * Fog) scales ENVIRONMENT_CONFIG.fog.density — 1 = as tuned.
 */
export function Fog() {
  const { fogColor } = useEnvironmentPaletteColors()
  const { fogDensityMultiplier } = useGenerative()
  const { density } = ENVIRONMENT_CONFIG.fog
  return <fogExp2 attach="fog" args={[fogColor, density * fogDensityMultiplier]} />
}
