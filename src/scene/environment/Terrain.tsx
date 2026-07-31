import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { buildTerrainGeometry } from './buildTerrainGeometry'
import { createGroundColorSampler } from './groundColor'
import { useEnvironmentPaletteColors } from './paletteColors'

/** Undulating, vertex-coloured ground plane beneath the flower field. */
export function Terrain() {
  const { groundColors } = useEnvironmentPaletteColors()
  const geometry = useMemo(
    () => buildTerrainGeometry(createGroundColorSampler(groundColors)),
    [groundColors],
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
