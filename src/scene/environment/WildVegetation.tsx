import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { useGenerative } from '../shared/generativeContext'
import { InstancedGroup } from '../shared/InstancedGroup'
import { useMeadowLayout } from '../shared/meadowLayoutConfig'
import { useTerrainShape } from '../shared/terrainShapeConfig'
import { applyWindDisplacement, useWindAnimation } from '../shared/windMaterial'
import { generateWildVegetation } from './generateWildVegetation'
import { useEnvironmentPaletteColors } from './paletteColors'

/** Small sparse weed/leaf clumps scattered through the grass, swaying a bit less than the taller grass does — smaller, stiffer leaflets. */
const WIND_STRENGTH_MULTIPLIER = 0.6

export function WildVegetation() {
  const { environmentSeed, meadowLayoutSeed, terrainShapeSeed, wind } = useGenerative()
  const { wildVegetationColorPalette } = useEnvironmentPaletteColors()
  const meadowLayout = useMeadowLayout(meadowLayoutSeed)
  const terrainShape = useTerrainShape(terrainShapeSeed)

  const groups = useMemo(
    () => generateWildVegetation(wildVegetationColorPalette, environmentSeed, meadowLayout, terrainShape),
    [wildVegetationColorPalette, environmentSeed, meadowLayout, terrainShape],
  )
  const material = useMemo(() => {
    const mat = new THREE.MeshStandardMaterial({
      color: new THREE.Color('#ffffff'),
      roughness: 0.85,
      side: THREE.DoubleSide,
      // Reads the baked base-darkening AO every tapered-blade geometry now
      // carries (shared/taperedBlade.ts).
      vertexColors: true,
    })
    applyWindDisplacement(mat, wind, WIND_STRENGTH_MULTIPLIER)
    return mat
  }, [wind])

  useWindAnimation([material])

  // Two separate effects, each keyed to only the resource it owns — see
  // Grass.tsx's own copy of this comment (and InstancedGroup.tsx's) for
  // why a single effect disposing both on `[groups, material]` together is
  // wrong: `material` rebuilds whenever `wind` changes identity, which
  // happens on every Leva tweak anywhere in the app, far more often than
  // `groups` itself changes.
  useEffect(() => {
    return () => {
      groups.forEach((group) => group.geometry.dispose())
    }
  }, [groups])

  useEffect(() => {
    return () => material.dispose()
  }, [material])

  return (
    <>
      {groups.map((group, index) => (
        <InstancedGroup key={index} geometry={group.geometry} material={material} instances={group.instances} />
      ))}
    </>
  )
}
