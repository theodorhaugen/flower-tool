import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { InstancedGroup } from '../../shared/InstancedGroup'
import { FLOWER_FIELD_CONFIG } from './config'
import { generateFlowerField } from './generateFlowerField'
import { buildCenterGeometry, buildPetalGeometryVariants } from './geometryVariants'
import { CENTER_MATERIAL_PROPS, buildPetalMaterialVariants } from './materials'

interface FlowerFieldProps {
  seed?: number
}

/**
 * Thousands of non-botanical "flowers" — clusters of translucent petals
 * around a small center — scattered through a depth-biased volume in front
 * of the camera. Everything is instanced: a handful of unique petal/center
 * geometries and materials, each backing one InstancedMesh with thousands
 * of per-instance transforms/colors.
 */
export function FlowerField({ seed = FLOWER_FIELD_CONFIG.seed }: FlowerFieldProps) {
  const petalGeometries = useMemo(() => buildPetalGeometryVariants(seed), [seed])
  const centerGeometry = useMemo(() => buildCenterGeometry(), [])

  const petalMaterials = useMemo(() => buildPetalMaterialVariants(seed), [seed])
  const centerMaterial = useMemo(() => new THREE.MeshStandardMaterial(CENTER_MATERIAL_PROPS), [])

  const field = useMemo(() => generateFlowerField(seed), [seed])

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
