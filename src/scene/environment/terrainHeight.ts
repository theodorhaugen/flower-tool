import { sampleTerrainHeight as sampleSharedTerrainHeight } from '../shared/terrainHeight'
import { TERRAIN_SHAPE } from '../shared/terrainShapeConfig'

/** Convenience wrapper so environment code doesn't have to pass TERRAIN_SHAPE around everywhere. */
export function sampleTerrainHeight(x: number, z: number): number {
  return sampleSharedTerrainHeight(x, z, TERRAIN_SHAPE)
}
