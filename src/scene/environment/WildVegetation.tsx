import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { InstancedGroup } from '../shared/InstancedGroup'
import { generateWildVegetation } from './generateWildVegetation'
import { useEnvironmentPaletteColors } from './paletteColors'

/** Small sparse weed/leaf clumps scattered through the grass. */
export function WildVegetation() {
  const { wildVegetationColorPalette } = useEnvironmentPaletteColors()
  const groups = useMemo(() => generateWildVegetation(wildVegetationColorPalette), [wildVegetationColorPalette])
  const material = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: new THREE.Color('#ffffff'),
        roughness: 0.85,
        side: THREE.DoubleSide,
      }),
    [],
  )

  useEffect(() => {
    return () => {
      groups.forEach((group) => group.geometry.dispose())
      material.dispose()
    }
  }, [groups, material])

  return (
    <>
      {groups.map((group, index) => (
        <InstancedGroup key={index} geometry={group.geometry} material={material} instances={group.instances} />
      ))}
    </>
  )
}
