import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { useGenerative } from '../shared/generativeContext'
import { useMeadowLayout } from '../shared/meadowLayoutConfig'
import { useTerrainShape } from '../shared/terrainShapeConfig'
import { buildTerrainGeometry } from './buildTerrainGeometry'
import { createGroundColorSampler } from './groundColor'
import { useEnvironmentPaletteColors } from './paletteColors'

/** Undulating, vertex-coloured ground plane beneath the flower field. */
export function Terrain() {
  const { meadowLayoutSeed, terrainShapeSeed, environmentSeed } = useGenerative()
  const { groundColors } = useEnvironmentPaletteColors()
  const meadowLayout = useMeadowLayout(meadowLayoutSeed)
  const terrainShape = useTerrainShape(terrainShapeSeed)

  const geometry = useMemo(
    () => buildTerrainGeometry(createGroundColorSampler(groundColors, meadowLayout, environmentSeed), terrainShape),
    [groundColors, meadowLayout, environmentSeed, terrainShape],
  )
  const material = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        vertexColors: true,
        roughness: 0.95,
        metalness: 0,
      }),
    [],
  )

  useEffect(() => {
    return () => {
      geometry.dispose()
      material.dispose()
    }
  }, [geometry, material])

  return <mesh geometry={geometry} material={material} receiveShadow={false} />
}
