import * as THREE from 'three'
import { FLOWER_FIELD_CONFIG, PETAL_ARCHETYPES } from './config'
import { createPetalGeometry } from './petalGeometry'
import { createRng } from '../../shared/random'

/**
 * A handful of unique petal geometries per archetype, each with its own
 * baked-in jitter. Instances are assigned a variant at random, which hides
 * the underlying reuse — thousands of petals never look copy-pasted, but we
 * still only pay for a few dozen unique meshes.
 *
 * Index = archetypeIndex * variantsPerArchetype + variantIndex, matching
 * generateFlowerField's petalGroups ordering.
 */
export function buildPetalGeometryVariants(seed: number): THREE.BufferGeometry[] {
  const rng = createRng(seed)
  const geometries: THREE.BufferGeometry[] = []

  for (const archetype of PETAL_ARCHETYPES) {
    for (let v = 0; v < FLOWER_FIELD_CONFIG.variantsPerArchetype; v++) {
      geometries.push(createPetalGeometry(rng, archetype))
    }
  }

  return geometries
}

export function buildCenterGeometry(): THREE.BufferGeometry {
  return new THREE.IcosahedronGeometry(1, 1)
}
