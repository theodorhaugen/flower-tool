import * as THREE from 'three'
import { createRng, range } from '../../shared/random'
import { createTaperedBladeGeometry } from '../../shared/taperedBlade'
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

/**
 * A handful of thin, gently-curled stem variants, reusing the same tapered
 * plane deformation grass blades are built from (shared/taperedBlade.ts) —
 * a stem is really just a much skinnier, straighter, unpigmented version of
 * the same shape. Local Y still runs 0 (base, planted on the terrain) to 1
 * (tip, where the flower head sits) — see generateFlowerField.ts for how
 * that's scaled/positioned per instance.
 */
export function buildStemGeometryVariants(seed: number): THREE.BufferGeometry[] {
  const rng = createRng(seed + 9000)
  const { variantCount, widthScaleRange, curlRange, jitterAmount } = FLOWER_FIELD_CONFIG.stem
  const geometries: THREE.BufferGeometry[] = []

  for (let v = 0; v < variantCount; v++) {
    geometries.push(
      createTaperedBladeGeometry(rng, {
        tipSharpness: 1,
        curl: range(rng, curlRange[0], curlRange[1]),
        twist: 0,
        widthScale: range(rng, widthScaleRange[0], widthScaleRange[1]),
        widthSegments: 1,
        heightSegments: 3,
        jitterAmount,
      }),
    )
  }

  return geometries
}
