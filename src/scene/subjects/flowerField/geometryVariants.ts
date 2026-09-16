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

/** Deterministic 3D hash for per-vertex displacement — same family as shared/noise.ts's hash2D, one axis wider. */
function hashVertex(x: number, y: number, z: number, seed: number): number {
  let h = Math.round(x * 1000) * 374761393 + Math.round(y * 1000) * 668265263 + Math.round(z * 1000) * 2147483647 + seed * 1274126177
  h = (h ^ (h >>> 13)) * 1274126177
  h = h ^ (h >>> 16)
  return (h >>> 0) / 4294967295
}

/** Pushes each vertex outward/inward along its own normal by a per-vertex hashed amount — breaks a perfect sphere into a bumpy/granular/spiky cluster without needing a texture. */
function displaceRadially(geometry: THREE.BufferGeometry, seed: number, amountRange: readonly [number, number]): THREE.BufferGeometry {
  const position = geometry.attributes.position as THREE.BufferAttribute
  const v = new THREE.Vector3()

  for (let i = 0; i < position.count; i++) {
    v.fromBufferAttribute(position, i)
    const h = hashVertex(v.x, v.y, v.z, seed)
    const amount = amountRange[0] + h * (amountRange[1] - amountRange[0])
    v.multiplyScalar(1 + amount)
    position.setXYZ(i, v.x, v.y, v.z)
  }

  geometry.computeVertexNormals()
  return geometry
}

/**
 * Bakes a simple directional AO into vertex colour: the hemisphere facing
 * away from `+axis` (the flower's own interior, where the center tucks
 * against the petal ring) darkens towards `minFactor`, fading back to full
 * brightness on the side facing `+axis` (outward, towards the petals/
 * camera). Same reasoning as taperedBlade.ts's base-darkening AO, just
 * radial instead of linear since a center isn't a blade with one growth
 * axis — without this every center was a uniformly, flatly lit ball
 * regardless of shape.
 */
function applyHemisphericalAO(geometry: THREE.BufferGeometry, axis: THREE.Vector3, minFactor: number): THREE.BufferGeometry {
  const position = geometry.attributes.position as THREE.BufferAttribute
  const colors = new Float32Array(position.count * 3)
  const v = new THREE.Vector3()

  for (let i = 0; i < position.count; i++) {
    v.fromBufferAttribute(position, i).normalize()
    const facing = (v.dot(axis) + 1) / 2 // 0 = fully away from axis, 1 = fully towards it
    const factor = minFactor + (1 - minFactor) * facing
    colors[i * 3] = factor
    colors[i * 3 + 1] = factor
    colors[i * 3 + 2] = factor
  }

  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  return geometry
}

const CENTER_AO_AXIS = new THREE.Vector3(0, 0, 1)

/**
 * Four center shapes instead of one shared perfect sphere — a real flower's
 * middle is a cluster of stamens/disc-florets, not a smooth ball, and every
 * flower in the field wearing the *exact* same icosahedron (identically lit,
 * identically bloomed) is what reads as a repeated sprite/decal rather than
 * a stamen cluster. `seed` is `flowerFieldSeed` — same reproducibility
 * contract as every other generator here. Index order matches
 * `FLOWER_FIELD_CONFIG.archetypePreferredCenters`' entries and
 * `buildCenterMaterialVariants` — geometry/material stay paired.
 */
export function buildCenterGeometryVariants(seed: number): THREE.BufferGeometry[] {
  const domed = new THREE.IcosahedronGeometry(1, 1)
  domed.scale(1, 0.82, 1)

  const granular = displaceRadially(new THREE.IcosahedronGeometry(1, 2), seed + 4100, [-0.08, 0.14])

  const spiky = displaceRadially(new THREE.IcosahedronGeometry(1, 1), seed + 4200, [-0.05, 0.34])

  // A shallow bowl (partial sphere, capped at the pole) rather than a full
  // sphere — an open cluster of florets rather than a solid ball. Rotated so
  // the open cap faces local +Z, the same "worldFace" axis
  // generateFlowerField.ts's centerMatrix.makeBasis orients outward/towards
  // the petals.
  const cupped = new THREE.SphereGeometry(1, 10, 6, 0, Math.PI * 2, 0, Math.PI * 0.55)
  cupped.rotateX(Math.PI / 2)

  return [domed, granular, spiky, cupped].map((geometry) => applyHemisphericalAO(geometry, CENTER_AO_AXIS, 0.55))
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
