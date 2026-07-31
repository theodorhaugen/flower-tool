import * as THREE from 'three'
import type { ColorPalette } from '../../shared/palette'
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
 *
 * `clearcoat` is the other physically-cheap addition: a thin, glossy
 * top layer (also built into MeshPhysicalMaterial) standing in for the
 * waxy cuticle real petals have — it's what actually produces a small,
 * bright specular highlight where the key light catches a petal edge, the
 * way the poppy reference photo's petals show one. Without it the surface
 * only has the diffuse+sheen response above, which never forms a genuine
 * bright point no matter how strong the light is — that missing highlight
 * was a real part of the "flat/muddy" read.
 */
const sharedPetalProps = {
  color: new THREE.Color('#ffffff'),
  transparent: true,
  depthWrite: false,
  side: THREE.DoubleSide,
  metalness: 0,
  vertexColors: true,
  sheenRoughness: 0.7,
  clearcoat: 0.28,
  clearcoatRoughness: 0.32,
} as const

interface PetalArchetypeMaterialBase {
  roughness: number
  opacity: number
  emissiveIntensity: number
  sheen: number
}

/** Non-colour tuning per archetype — emissive/sheen *colour* is derived from the palette below instead, so it stays cohesive with whichever family of dominantHues is active. */
const PETAL_ARCHETYPE_MATERIAL_BASE: readonly PetalArchetypeMaterialBase[] = [
  {
    roughness: 0.55,
    opacity: 0.78,
    // Slightly brighter than the diffuse light alone would produce — reads
    // as light glowing through translucent tissue rather than just
    // reflecting off it, the way real backlit/sidelit petals do.
    emissiveIntensity: 0.16,
    sheen: 0.4,
  },
  {
    roughness: 0.68,
    opacity: 0.72,
    emissiveIntensity: 0.13,
    sheen: 0.35,
  },
]

/**
 * The emissive/sheen "glow" colour per archetype — near-white so it reads
 * as light passing through tissue rather than a second layer of pigment,
 * but tinted by the palette's `highlight` (the colour of light itself)
 * rather than a fixed pink/lavender, so translucency reads as this
 * render's light instead of always the same two hues regardless of
 * palette. The two archetypes lean towards different dominant hues so
 * they still read as two distinct "families" of petal, not one uniform
 * glow.
 */
function archetypeGlowColors(palette: ColorPalette): { emissive: THREE.Color; sheenColor: THREE.Color }[] {
  const highlight = new THREE.Color(palette.highlight)
  const white = new THREE.Color('#ffffff')
  const hueA = new THREE.Color(palette.dominantHues[0])
  const hueB = new THREE.Color(palette.dominantHues[1] ?? palette.dominantHues[0])

  return [
    {
      emissive: highlight.clone().lerp(hueA, 0.35).lerp(white, 0.55),
      sheenColor: highlight.clone().lerp(hueA, 0.2).lerp(white, 0.75),
    },
    {
      emissive: highlight.clone().lerp(hueB, 0.35).lerp(white, 0.55),
      sheenColor: highlight.clone().lerp(hueB, 0.2).lerp(white, 0.75),
    },
  ]
}

/**
 * One physical material per petal *geometry variant*, not just per
 * archetype, so roughness varies subtly group to group instead of being
 * identical across thousands of petals sharing an archetype — real petals
 * aren't uniformly glossy. Index/order matches `buildPetalGeometryVariants`.
 */
export function buildPetalMaterialVariants(seed: number, palette: ColorPalette): THREE.MeshPhysicalMaterial[] {
  const rng = createRng(seed + 5000)
  const materials: THREE.MeshPhysicalMaterial[] = []
  const glowColors = archetypeGlowColors(palette)

  PETAL_ARCHETYPE_MATERIAL_BASE.forEach((base, archetypeIndex) => {
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
          emissive: glowColors[archetypeIndex].emissive,
          emissiveIntensity: base.emissiveIntensity,
          sheenColor: glowColors[archetypeIndex].sheenColor,
          sheen: base.sheen,
        }),
      )
    }
  })

  return materials
}

/** Flower-centre material — emissive warmth mixed from a fixed pollen-amber anchor and the palette's `highlight`, so centres stay believably warm even under a cool palette while still picking up its mood. */
export function buildCenterMaterialProps(palette: ColorPalette): THREE.MeshStandardMaterialParameters {
  const pollenAmber = new THREE.Color('#7a5a2a')
  const highlight = new THREE.Color(palette.highlight)

  return {
    color: new THREE.Color('#ffffff'),
    roughness: 0.6,
    metalness: 0.05,
    emissive: pollenAmber.clone().lerp(highlight, 0.4),
    emissiveIntensity: 0.12,
  }
}
