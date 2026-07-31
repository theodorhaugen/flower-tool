import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { useGenerative } from '../../shared/generativeContext'
import { InstancedGroup } from '../../shared/InstancedGroup'
import { useMeadowLayout } from '../../shared/meadowLayoutConfig'
import { useTerrainShape } from '../../shared/terrainShapeConfig'
import { FLOWER_FIELD_CONFIG } from './config'
import { generateFlowerField } from './generateFlowerField'
import { buildCenterGeometry, buildPetalGeometryVariants } from './geometryVariants'
import { buildCenterMaterialProps, buildPetalMaterialVariants } from './materials'

/**
 * Thousands of non-botanical "flowers" — clusters of translucent petals
 * around a small center — scattered through a depth-biased volume in front
 * of the camera. Everything is instanced: a handful of unique petal/center
 * geometries and materials, each backing one InstancedMesh with thousands
 * of per-instance transforms/colors.
 *
 * Placement/species/colour all derive from the active render's generative
 * seed (see shared/generative.ts) rather than a fixed seed — `flowerFieldSeed`
 * drives this component's own per-flower choices, while `meadowLayoutSeed`/
 * `terrainShapeSeed` rebuild the *shared* layout/terrain fields (also used
 * by environment/) so flowers keep sitting in the same clusters/on the same
 * ground as the grass growing around them, just at a different seed.
 */
export function FlowerField() {
  const { palette, flowerFieldSeed, meadowLayoutSeed, terrainShapeSeed } = useGenerative()
  const meadowLayout = useMeadowLayout(meadowLayoutSeed)
  const terrainShape = useTerrainShape(terrainShapeSeed)

  const petalGeometries = useMemo(() => buildPetalGeometryVariants(flowerFieldSeed), [flowerFieldSeed])
  const centerGeometry = useMemo(() => buildCenterGeometry(), [])

  const petalMaterials = useMemo(
    () => buildPetalMaterialVariants(flowerFieldSeed, palette),
    [flowerFieldSeed, palette],
  )
  const centerMaterial = useMemo(
    () => new THREE.MeshStandardMaterial(buildCenterMaterialProps(palette)),
    [palette],
  )

  const field = useMemo(
    () => generateFlowerField(flowerFieldSeed, palette, meadowLayout, terrainShape),
    [flowerFieldSeed, palette, meadowLayout, terrainShape],
  )

  useEffect(() => {
    return () => {
      petalGeometries.forEach((geometry) => geometry.dispose())
      centerGeometry.dispose()
      petalMaterials.forEach((material) => material.dispose())
      centerMaterial.dispose()
    }
  }, [petalGeometries, centerGeometry, petalMaterials, centerMaterial])

  return (
    <group>
      {field.petalGroups.map((group) => {
        const geometryIndex = group.archetypeIndex * FLOWER_FIELD_CONFIG.variantsPerArchetype + group.variantIndex
        return (
          <InstancedGroup
            key={`petal-${geometryIndex}`}
            geometry={petalGeometries[geometryIndex]}
            material={petalMaterials[geometryIndex]}
            instances={group.instances}
          />
        )
      })}
      <InstancedGroup geometry={centerGeometry} material={centerMaterial} instances={field.centers} />
    </group>
  )
}
