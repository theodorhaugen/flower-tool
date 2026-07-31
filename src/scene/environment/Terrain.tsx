import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { buildTerrainGeometry } from './buildTerrainGeometry'

/** Undulating, vertex-coloured ground plane beneath the flower field. */
export function Terrain() {
  const geometry = useMemo(() => buildTerrainGeometry(), [])
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
