import * as THREE from 'three'
import { createRng } from '../../shared/random'
import { FLOWER_FIELD_CONFIG, PETAL_ARCHETYPES } from './config'
import { createPetalGeometry } from './petalGeometry'

/**
 * A handful of unique petal geometries per archetype, each with its own
 * baked-in jitter (and colour-bleed gradient). Instances are assigned a
 * variant at random, which hides the underlying reuse — thousands of petals
 * never look copy-pasted, but we still only pay for a few dozen unique
 * meshes.
 *
 * Index = archetypeIndex * variantsPerArchetype + variantIndex, matching
 * generateFlowerField's petalGroups ordering (and buildPetalMaterialVariants'
 * — geometry and material variants stay paired one-to-one).
 */
export function buildPetalGeometryVariants(seed: number): THREE.BufferGeometry[] {
  const rng = createRng(seed)
  const geometries: THREE.BufferGeometry[] = []

  const { innerColor, outerColor, jitter } = FLOWER_FIELD_CONFIG.petalColorGradient
  const colorGradient = {
    innerColor: new THREE.Color(innerColor),
    outerColor: new THREE.Color(outerColor),
    jitter,
  }

  for (const archetype of PETAL_ARCHETYPES) {
    for (let v = 0; v < FLOWER_FIELD_CONFIG.variantsPerArchetype; v++) {
      geometries.push(createPetalGeometry(rng, archetype, colorGradient))
    }
  }

  return geometries
}

export function buildCenterGeometry(): THREE.BufferGeometry {
  return new THREE.IcosahedronGeometry(1, 1)
}
