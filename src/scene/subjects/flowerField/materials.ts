import * as THREE from 'three'
import { createRng, range } from '../../shared/random'
import { FLOWER_FIELD_CONFIG } from './config'

/**
 * Translucency itself is still faked with plain alpha blending rather than
 * physical `transmission` — with tens of thousands of overlapping
 * instances, a real transmission pass (an extra background-sampling render,
 * then a refraction sample per fragment on top of the already-heavy
 * overdraw) would be needlessly expensive, and the eventual heavy
 * depth-of-field blur hides the difference anyway.
 *
 * What's new here is `sheen` — a soft, cheap rim-light term (built into
 * MeshPhysicalMaterial, not a custom shader) that catches light at grazing
 * angles the way a thin, slightly fibrous translucent edge does. Combined
 * with the vertex-colour gradient baked into the geometry (see
 * petalGeometry.ts) and the boosted emissive, it reads as subsurface
 * scattering — light entering the tissue and softly re-emerging — without
 * the cost of the real thing.
 */
const sharedPetalProps = {
  color: new THREE.Color('#ffffff'),
  transparent: true,
  depthWrite: false,
  side: THREE.DoubleSide,
  metalness: 0,
  vertexColors: true,
  sheenRoughness: 0.7,
} as const

interface PetalArchetypeMaterialBase {
  roughness: number
  opacity: number
  emissive: string
  emissiveIntensity: number
  sheenColor: string
  sheen: number
}

const PETAL_ARCHETYPE_MATERIAL_BASE: readonly PetalArchetypeMaterialBase[] = [
  {
    roughness: 0.55,
    opacity: 0.78,
    // Slightly brighter than the diffuse light alone would produce — reads
    // as light glowing through translucent tissue rather than just
    // reflecting off it, the way real backlit/sidelit petals do.
    emissive: '#fbdce6',
    emissiveIntensity: 0.16,
    sheenColor: '#fff1f5',
    sheen: 0.4,
  },
  {
    roughness: 0.68,
    opacity: 0.72,
    emissive: '#e6dcfb',
    emissiveIntensity: 0.13,
    sheenColor: '#f5f0ff',
    sheen: 0.35,
  },
]

/**
 * One physical material per petal *geometry variant*, not just per
 * archetype, so roughness varies subtly group to group instead of being
 * identical across thousands of petals sharing an archetype — real petals
 * aren't uniformly glossy. Index/order matches `buildPetalGeometryVariants`.
 */
export function buildPetalMaterialVariants(seed: number): THREE.MeshPhysicalMaterial[] {
  const rng = createRng(seed + 5000)
  const materials: THREE.MeshPhysicalMaterial[] = []

  for (const base of PETAL_ARCHETYPE_MATERIAL_BASE) {
    for (let v = 0; v < FLOWER_FIELD_CONFIG.variantsPerArchetype; v++) {
      const roughness = THREE.MathUtils.clamp(
        base.roughness + range(rng, -FLOWER_FIELD_CONFIG.roughnessJitter, FLOWER_FIELD_CONFIG.roughnessJitter),
        0.15,
        0.95,
      )

      materials.push(
        new THREE.MeshPhysicalMaterial({
          ...sharedPetalProps,
          roughness,
          opacity: base.opacity,
          emissive: new THREE.Color(base.emissive),
          emissiveIntensity: base.emissiveIntensity,
          sheenColor: new THREE.Color(base.sheenColor),
          sheen: base.sheen,
        }),
      )
    }
  }

  return materials
}

export const CENTER_MATERIAL_PROPS: THREE.MeshStandardMaterialParameters = {
  color: new THREE.Color('#ffffff'),
  roughness: 0.6,
  metalness: 0.05,
  emissive: new THREE.Color('#7a5a2a'),
  emissiveIntensity: 0.12,
}
