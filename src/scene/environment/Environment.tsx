import { Fog } from './Fog'
import { Grass } from './Grass'
import { Horizon } from './Horizon'
import { Terrain } from './Terrain'
import { WildVegetation } from './WildVegetation'

/**
 * The meadow the flower field grows in: undulating terrain, dense grass,
 * sparse low vegetation, a distant horizon, and atmospheric fog. Exists to
 * ground the flowers in believable lighting, depth, and colour — kept muted
 * and soft throughout so it never competes with them, which matters even
 * before a depth-of-field pass exists since that's the intended final look.
 */
export function Environment() {
  return (
    <>
      <Fog />
      <Horizon />
      <Terrain />
      <Grass />
      <WildVegetation />
    </>
  )
}
