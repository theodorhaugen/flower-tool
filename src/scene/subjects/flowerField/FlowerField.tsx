import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { useEnvironmentPaletteColors } from '../../environment/paletteColors'
import { useGenerative } from '../../shared/generativeContext'
import { InstancedGroup } from '../../shared/InstancedGroup'
import { useMeadowLayout } from '../../shared/meadowLayoutConfig'
import { useTerrainShape } from '../../shared/terrainShapeConfig'
import { applyWindDisplacement, useWindAnimation } from '../../shared/windMaterial'
import { FLOWER_FIELD_CONFIG } from './config'
import { generateFlowerField } from './generateFlowerField'
import { buildCenterGeometryVariants, buildPetalGeometryVariants, buildStemGeometryVariants } from './geometryVariants'
import { buildCenterMaterialVariants, buildPetalMaterialVariants } from './materials'

/** Stems are thin/stiff near the base, so they sway less than the taller, floppier grass around them. */
const STEM_WIND_STRENGTH_MULTIPLIER = 0.5

/**
 * Thousands of non-botanical "flowers" — a thin stem, clusters of
 * translucent petals, and a small center — scattered through a
 * depth-biased volume in front of the camera. Everything is instanced: a
 * handful of unique petal/center/stem geometries and materials, each
 * backing one InstancedMesh with thousands of per-instance
 * transforms/colors.
 *
 * Placement/species/colour all derive from the active render's generative
 * seed (see shared/generative.ts) rather than a fixed seed — `flowerFieldSeed`
 * drives this component's own per-flower choices, while `meadowLayoutSeed`/
 * `terrainShapeSeed` rebuild the *shared* layout/terrain fields (also used
 * by environment/) so flowers keep sitting in the same clusters/on the same
 * ground as the grass growing around them, just at a different seed. Stem
 * colour reads `grassColorPalette` (environment/paletteColors.ts) directly
 * — the same green family Grass.tsx draws from — rather than deriving its
 * own, so a stem visually connects its flower to the grass around it
 * instead of the two reading as unrelated plants.
 */
export function FlowerField() {
  const {
    palette,
    flowerFieldSeed,
    meadowLayoutSeed,
    terrainShapeSeed,
    flowerDensity,
    flowerScale,
    poppyAccentProbability,
    wind,
  } = useGenerative()
  const { grassColorPalette } = useEnvironmentPaletteColors()
  const meadowLayout = useMeadowLayout(meadowLayoutSeed)
  const terrainShape = useTerrainShape(terrainShapeSeed)

  const petalGeometries = useMemo(() => buildPetalGeometryVariants(flowerFieldSeed), [flowerFieldSeed])
  const centerGeometries = useMemo(() => buildCenterGeometryVariants(flowerFieldSeed), [flowerFieldSeed])
  const stemGeometries = useMemo(() => buildStemGeometryVariants(flowerFieldSeed), [flowerFieldSeed])

  const petalMaterials = useMemo(
    () => buildPetalMaterialVariants(flowerFieldSeed, palette),
    [flowerFieldSeed, palette],
  )
  // Same geometries, a real-transmission material instead of the cheap
  // sheen/clearcoat fake — only the small foreground band uses this (see
  // generateFlowerField.ts's `foregroundPetalGroups`), since those are the
  // few hero blooms sharp enough for real translucency to actually read.
  const foregroundPetalMaterials = useMemo(
    () => buildPetalMaterialVariants(flowerFieldSeed, palette, { transmission: true }),
    [flowerFieldSeed, palette],
  )
  const centerMaterials = useMemo(() => buildCenterMaterialVariants(palette), [palette])
  // Plain and green like Grass.tsx's material, deliberately not palette-tinted or
  // translucent like the petals — a stem is meant to disappear into the grass
  // around it, coloured per-instance from that same grassColorPalette below.
  const stemMaterial = useMemo(() => {
    const mat = new THREE.MeshStandardMaterial({
      color: new THREE.Color('#ffffff'),
      roughness: 0.85,
      side: THREE.DoubleSide,
      vertexColors: true,
    })
    applyWindDisplacement(mat, wind, STEM_WIND_STRENGTH_MULTIPLIER)
    return mat
  }, [wind])

  useWindAnimation([stemMaterial])

  const field = useMemo(
    () =>
      generateFlowerField(flowerFieldSeed, palette, grassColorPalette, meadowLayout, terrainShape, {
        densityMultiplier: flowerDensity,
        scaleMultiplier: flowerScale,
        poppyAccentProbability,
      }),
    [flowerFieldSeed, palette, grassColorPalette, meadowLayout, terrainShape, flowerDensity, flowerScale, poppyAccentProbability],
  )

  useEffect(() => {
    return () => {
      petalGeometries.forEach((geometry) => geometry.dispose())
      centerGeometries.forEach((geometry) => geometry.dispose())
      stemGeometries.forEach((geometry) => geometry.dispose())
      petalMaterials.forEach((material) => material.dispose())
      foregroundPetalMaterials.forEach((material) => material.dispose())
      centerMaterials.forEach((material) => material.dispose())
      stemMaterial.dispose()
    }
  }, [petalGeometries, centerGeometries, stemGeometries, petalMaterials, foregroundPetalMaterials, centerMaterials, stemMaterial])

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
      {field.foregroundPetalGroups.map((group) => {
        const geometryIndex = group.archetypeIndex * FLOWER_FIELD_CONFIG.variantsPerArchetype + group.variantIndex
        return (
          <InstancedGroup
            key={`petal-fg-${geometryIndex}`}
            geometry={petalGeometries[geometryIndex]}
            material={foregroundPetalMaterials[geometryIndex]}
            instances={group.instances}
          />
        )
      })}
      {field.centerGroups.map((group) => (
        <InstancedGroup
          key={`center-${group.variantIndex}`}
          geometry={centerGeometries[group.variantIndex]}
          material={centerMaterials[group.variantIndex]}
          instances={group.instances}
        />
      ))}
      {field.stemGroups.map((group) => (
        <InstancedGroup
          key={`stem-${group.variantIndex}`}
          geometry={stemGeometries[group.variantIndex]}
          material={stemMaterial}
          instances={group.instances}
        />
      ))}
    </group>
  )
}
