import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { useGenerative } from '../shared/generativeContext'
import { InstancedGroup } from '../shared/InstancedGroup'
import { useMeadowLayout } from '../shared/meadowLayoutConfig'
import { useTerrainShape } from '../shared/terrainShapeConfig'
import { generatePebbles } from './generatePebbles'

/** Loose stone scattered along the worn path — see generatePebbles.ts. */
export function Pebbles() {
  const { environmentSeed, meadowLayoutSeed, terrainShapeSeed } = useGenerative()
  const meadowLayout = useMeadowLayout(meadowLayoutSeed)
  const terrainShape = useTerrainShape(terrainShapeSeed)

  const groups = useMemo(
    () => generatePebbles(environmentSeed, meadowLayout, terrainShape),
    [environmentSeed, meadowLayout, terrainShape],
  )
  const material = useMemo(
    () =>
      // No `vertexColors` — the geometry itself carries no baked colour
      // attribute (unlike the tapered-blade shapes), so per-instance hue
      // comes entirely from `setColorAt` (InstancedGroup), which multiplies
      // this material's base colour regardless of the `vertexColors` flag.
      new THREE.MeshStandardMaterial({
        color: new THREE.Color('#ffffff'),
        roughness: 0.9,
        metalness: 0.02,
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
