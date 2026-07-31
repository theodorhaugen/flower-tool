import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { useGenerative } from '../shared/generativeContext'
import { InstancedGroup } from '../shared/InstancedGroup'
import { useMeadowLayout } from '../shared/meadowLayoutConfig'
import { useTerrainShape } from '../shared/terrainShapeConfig'
import { applyWindDisplacement, useWindAnimation } from '../shared/windMaterial'
import { generateGrass } from './generateGrass'
import { useEnvironmentPaletteColors } from './paletteColors'

/** Dense instanced grass blades covering the near/mid ground, swaying in the active render's generative wind. */
export function Grass() {
  const { environmentSeed, meadowLayoutSeed, terrainShapeSeed, wind, grassDensity, grassHeight, grassWidth } =
    useGenerative()
  const { grassColorPalette } = useEnvironmentPaletteColors()
  const meadowLayout = useMeadowLayout(meadowLayoutSeed)
  const terrainShape = useTerrainShape(terrainShapeSeed)

  const groups = useMemo(
    () =>
      generateGrass(grassColorPalette, environmentSeed, meadowLayout, terrainShape, {
        densityMultiplier: grassDensity,
        heightMultiplier: grassHeight,
        widthMultiplier: grassWidth,
      }),
    [grassColorPalette, environmentSeed, meadowLayout, terrainShape, grassDensity, grassHeight, grassWidth],
  )
  const material = useMemo(() => {
    const mat = new THREE.MeshStandardMaterial({
      color: new THREE.Color('#ffffff'),
      roughness: 0.85,
      side: THREE.DoubleSide,
    })
    applyWindDisplacement(mat, wind)
    return mat
  }, [wind])

  useWindAnimation([material])

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
