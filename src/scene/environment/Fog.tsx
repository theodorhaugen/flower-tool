import { ENVIRONMENT_CONFIG } from './config'
import { useEnvironmentPaletteColors } from './paletteColors'

/** Atmospheric depth cue — also what makes the horizon blend seamlessly with the terrain's far edge. */
export function Fog() {
  const { fogColor } = useEnvironmentPaletteColors()
  const { density } = ENVIRONMENT_CONFIG.fog
  return <fogExp2 attach="fog" args={[fogColor, density]} />
}
