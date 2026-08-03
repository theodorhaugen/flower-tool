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

/**
 * Non-colour tuning per archetype — emissive/sheen *colour* is derived from
 * the palette below instead, so it stays cohesive with whichever petal
 * family is active. One entry per PETAL_ARCHETYPES entry (config.ts) —
 * rounded/elongated/spiky/bell/poppy/ruffled, in that order. The spread here
 * (glossier+brighter bell and poppy, matte+duller spiky aster) is itself
 * part of making the six archetypes read as different species rather than
 * the same material wearing six shapes.
 */
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
  {
    // Spiky aster — thin, matte, barely translucent; a sharp petal doesn't
    // hold enough tissue depth to glow the way a broad one does.
    roughness: 0.72,
    opacity: 0.7,
    emissiveIntensity: 0.09,
    sheen: 0.5,
  },
  {
    // Bell — the widest, most cupped petal, catches the most light.
    roughness: 0.45,
    opacity: 0.82,
    emissiveIntensity: 0.2,
    sheen: 0.45,
  },
  {
    // Poppy — a real poppy petal is famously silky/glossy with strong
    // backlit glow.
    roughness: 0.4,
    opacity: 0.85,
    emissiveIntensity: 0.22,
    sheen: 0.55,
  },
  {
    roughness: 0.6,
    opacity: 0.75,
    emissiveIntensity: 0.15,
    sheen: 0.38,
  },
]

/**
 * The emissive/sheen "glow" colour per archetype — near-white so it reads
 * as light passing through tissue rather than a second layer of pigment,
 * but tinted by the palette's `glow` (the colour of light itself) rather
 * than a fixed pink/lavender, so translucency reads as this render's light
 * instead of always the same hues regardless of palette. Cycles through
 * `petalPrimary`/`petalSecondary`/`petalTertiary` by archetype index — with
 * 6 archetypes and 3 hues, archetypes 3 places apart (0&3, 1&4, 2&5) share
 * an identical glow tint, so only 3 of the 6 shapes are distinguishable by
 * glow alone; the archetypes' own distinct base geometry/roughness/sheen
 * tuning (`PETAL_ARCHETYPE_MATERIAL_BASE` above) is what keeps every one
 * of the 6 still reading as its own "species".
 */
function archetypeGlowColors(palette: ColorPalette, archetypeCount: number): { emissive: THREE.Color; sheenColor: THREE.Color }[] {
  const glow = new THREE.Color(palette.glow)
  const white = new THREE.Color('#ffffff')
  const petalHues = [palette.petalPrimary, palette.petalSecondary, palette.petalTertiary]

  return Array.from({ length: archetypeCount }, (_, i) => {
    const hue = new THREE.Color(petalHues[i % petalHues.length])
    return {
      emissive: glow.clone().lerp(hue, 0.35).lerp(white, 0.55),
      sheenColor: glow.clone().lerp(hue, 0.2).lerp(white, 0.75),
    }
  })
}

/**
 * One physical material per petal *geometry variant*, not just per
 * archetype, so roughness varies subtly group to group instead of being
 * identical across thousands of petals sharing an archetype — real petals
 * aren't uniformly glossy. Index/order matches `buildPetalGeometryVariants`.
 *
 * `transmission` swaps the cheap sheen/clearcoat translucency fake for real
 * physical transmission — only worth the extra cost for the small foreground
 * band (see FlowerField.tsx), where the hero blooms are sharp enough for the
 * difference to actually show; everywhere else DoF already hides it.
 */
export function buildPetalMaterialVariants(
  seed: number,
  palette: ColorPalette,
  { transmission = false }: { transmission?: boolean } = {},
): THREE.MeshPhysicalMaterial[] {
  const rng = createRng(seed + 5000)
  const materials: THREE.MeshPhysicalMaterial[] = []
  const glowColors = archetypeGlowColors(palette, PETAL_ARCHETYPE_MATERIAL_BASE.length)

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
          // Real transmission needs `transparent`/`opacity` out of the way —
          // thickness lets light travelling through actually pick up the
          // material's own colour instead of just refracting it clear.
          ...(transmission
            ? { transmission: 0.55, thickness: 0.4, opacity: 1, transparent: false, ior: 1.3 }
            : {}),
        }),
      )
    }
  })

  return materials
}

/**
 * Flower-centre material — emissive warmth mixed from a fixed pollen-amber
 * anchor and the palette's `accent` (the small, sparing detail-highlight
 * role), so centres stay believably warm even under a cool palette while
 * still picking up its mood.
 *
 * `clearcoat` added for the same reason petals have one (see
 * `sharedPetalProps` above) — centres previously had no specular mechanism
 * beyond plain roughness-based PBR response, which never forms the small,
 * bright catchlight real pollen/stamen clusters show under direct light
 * (they're often slightly waxy/dewy, same as a petal's cuticle). Modest
 * next to petals' 0.28, since a granular pollen cluster shouldn't read as
 * uniformly glossy the way a smooth petal surface does — see the per-variant
 * scale below for why it varies by shape.
 */
export function buildCenterMaterialProps(palette: ColorPalette): THREE.MeshPhysicalMaterialParameters {
  const pollenAmber = new THREE.Color('#7a5a2a')
  const accent = new THREE.Color(palette.accent)

  return {
    color: new THREE.Color('#ffffff'),
    roughness: 0.6,
    metalness: 0.05,
    clearcoat: 0.22,
    clearcoatRoughness: 0.3,
    emissive: pollenAmber.clone().lerp(accent, 0.4),
    emissiveIntensity: 0.12,
    vertexColors: true,
  }
}

interface CenterVariantMaterialBase {
  roughness: number
  metalness: number
  /** Multiplies buildCenterMaterialProps' base emissiveIntensity — breaks the "every center blooms identically" uniformity the highlight-bloom pass otherwise produces on a single shared material. */
  emissiveIntensityScale: number
  /**
   * Multiplies buildCenterMaterialProps' base clearcoat — a smooth domed
   * centre can plausibly show a small unified specular highlight the way a
   * petal does; a granular pollen cluster or a deeply cupped/hollow centre
   * is too broken-up/self-shadowing a surface for one to read as believable,
   * so those get scaled down rather than sharing one flat value.
   */
  clearcoatScale: number
}

/** One entry per buildCenterGeometryVariants shape — domed/granular/spiky/cupped. */
const CENTER_VARIANT_MATERIAL_BASE: readonly CenterVariantMaterialBase[] = [
  { roughness: 0.6, metalness: 0.05, emissiveIntensityScale: 1, clearcoatScale: 1.2 },
  { roughness: 0.8, metalness: 0.02, emissiveIntensityScale: 1.4, clearcoatScale: 0.4 },
  { roughness: 0.5, metalness: 0.1, emissiveIntensityScale: 0.85, clearcoatScale: 0.9 },
  { roughness: 0.88, metalness: 0, emissiveIntensityScale: 0.55, clearcoatScale: 0.3 },
]

/** One material per center geometry variant — mirrors buildPetalMaterialVariants' reasoning, applied to the center cluster instead of the petals. */
export function buildCenterMaterialVariants(palette: ColorPalette): THREE.MeshPhysicalMaterial[] {
  const base = buildCenterMaterialProps(palette)
  const baseEmissiveIntensity = base.emissiveIntensity ?? 0.12
  const baseClearcoat = base.clearcoat ?? 0.22

  return CENTER_VARIANT_MATERIAL_BASE.map(
    (variant) =>
      new THREE.MeshPhysicalMaterial({
        ...base,
        roughness: variant.roughness,
        metalness: variant.metalness,
        emissiveIntensity: baseEmissiveIntensity * variant.emissiveIntensityScale,
        clearcoat: baseClearcoat * variant.clearcoatScale,
      }),
  )
}
