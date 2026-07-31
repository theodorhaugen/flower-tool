import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { InstancedGroup } from '../shared/InstancedGroup'
import { generateGrass } from './generateGrass'
import { useEnvironmentPaletteColors } from './paletteColors'

/** Dense instanced grass blades covering the near/mid ground. */
export function Grass() {
  const { grassColorPalette } = useEnvironmentPaletteColors()
  const groups = useMemo(() => generateGrass(grassColorPalette), [grassColorPalette])
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
