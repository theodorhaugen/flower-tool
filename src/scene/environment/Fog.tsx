import { ENVIRONMENT_CONFIG } from './config'

/** Atmospheric depth cue — also what makes the horizon blend seamlessly with the terrain's far edge. */
export function Fog() {
  const { color, density } = ENVIRONMENT_CONFIG.fog
  return <fogExp2 attach="fog" args={[color, density]} />
}
