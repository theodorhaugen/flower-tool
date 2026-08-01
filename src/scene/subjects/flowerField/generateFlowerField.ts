import * as THREE from 'three'
import { samplePathDepression } from '../../environment/groundColor'
import { CAMERA_Z, frustumWidthHalfAt } from '../../shared/frustum'
import { sampleMeadowDensity } from '../../shared/meadowLayout'
import type { MeadowLayoutConfig } from '../../shared/meadowLayout'
import type { ColorPalette } from '../../shared/palette'
import { createRng, gaussianish, intRange, range } from '../../shared/random'
import { sampleTerrainHeight } from '../../shared/terrainHeight'
import type { TerrainShapeConfig } from '../../shared/terrainHeight'
import { FLOWER_FIELD_CONFIG, PETAL_ARCHETYPES, POPPY_ARCHETYPE_INDEX } from './config'
import type { DepthBand } from './config'
import { jitterColor, rollIsPoppy, sampleCenterColor, samplePetalBaseColor, samplePoppyColor } from './palette'
import type { CenterVariantGroup, FlowerFieldData, PetalVariantGroup, StemVariantGroup } from './types'

// Flowers default to facing the camera (the field is composed for a
// horizontally-aimed lens, not a top-down view) — tilt/spin are applied
// relative to this axis so "randomized rotation" still reads as flowers,
// not an edge-on tumble of disks.
const FACE_AXIS = new THREE.Vector3(0, 0, 1)
const UP = new THREE.Vector3(0, 1, 0)

/** Approximate on-screen ground area of a band (width × depth, integrated over its z range). */
function approximateBandArea(band: DepthBand, samples = 12): number {
  const stepZ = (band.zMax - band.zMin) / samples
  let area = 0
  for (let s = 0; s < samples; s++) {
    const z = band.zMin + stepZ * (s + 0.5)
    area += frustumWidthHalfAt(z) * 2 * stepZ
  }
  return Math.abs(area)
}

/** Splits flowerCount across bands proportionally to area × densityMultiplier, not a fixed share. */
function allocateBandCounts(depthBands: readonly DepthBand[], flowerCount: number): number[] {
  const weights = depthBands.map((band) => approximateBandArea(band) * band.densityMultiplier)
  const totalWeight = weights.reduce((sum, w) => sum + w, 0)

  const counts = weights.map((weight) => Math.round((flowerCount * weight) / totalWeight))
  const shortfall = flowerCount - counts.reduce((sum, c) => sum + c, 0)
  counts[counts.length - 1] += shortfall // absorb rounding drift in the last (background) band

  return counts
}

/**
 * Draws one ground-plane (x, z) position for a band via rejection sampling
 * against the meadow density field — candidates land more often inside
 * clusters and rarely (but not never) in clearings or paths. Falls back to
 * an unweighted pick after too many misses so generation always terminates
 * with the requested count, even if a band's slice of the field is mostly
 * clearings. Y is left at 0 — the caller sets it from the terrain height
 * once the flower's own scale (and thus stem height) is known.
 */
function sampleBandPosition(rng: () => number, band: DepthBand, meadowLayout: MeadowLayoutConfig): THREE.Vector3 {
  const { minCameraDistance, maxSampleAttemptsPerFlower } = FLOWER_FIELD_CONFIG
  const nearestZ = CAMERA_Z - minCameraDistance

  for (let attempt = 0; attempt < maxSampleAttemptsPerFlower; attempt++) {
    const z = Math.min(range(rng, band.zMin, band.zMax), nearestZ)
    const widthHalf = frustumWidthHalfAt(z)
    const x = range(rng, -widthHalf, widthHalf)

    const density = sampleMeadowDensity(x, z, widthHalf, meadowLayout)
    if (rng() < density || attempt === maxSampleAttemptsPerFlower - 1) {
      return new THREE.Vector3(x, 0, z)
    }
  }

  // Unreachable — the loop always returns on its last attempt — but keeps TS happy.
  return new THREE.Vector3(0, 0, band.zMax)
}

export interface FlowerFieldOptions {
  /** Leva's Flowers > Density — multiplies FLOWER_FIELD_CONFIG.flowerCount. 1 = as tuned. */
  densityMultiplier?: number
  /** Leva's Flowers > Scale — multiplies every band's flower-scale range. 1 = as tuned. */
  scaleMultiplier?: number
  /** Leva's Flowers > Poppy Accent — see palette.ts's samplePetalBaseColor. */
  poppyAccentProbability?: number
}

/**
 * Generates a full flower field as instance-ready transforms/colors, grouped
 * by petal geometry variant so each group can back its own InstancedMesh.
 * Pure function of its inputs — same seed/palette/stemColorPalette/
 * meadowLayout/terrainShape/options always reproduce the same field.
 * seed/palette/meadowLayout/terrainShape come from the active render's
 * generative seed; `stemColorPalette` from environment/paletteColors.ts (the
 * same green family Grass.tsx draws from, so stems read as part of the same
 * grass rather than a mismatched plant); `options` from the same state's
 * Leva-controlled creative overrides (see shared/generative.ts).
 */
export function generateFlowerField(
  seed: number,
  palette: ColorPalette,
  stemColorPalette: readonly string[],
  meadowLayout: MeadowLayoutConfig,
  terrainShape: TerrainShapeConfig,
  { densityMultiplier = 1, scaleMultiplier = 1, poppyAccentProbability = 0.15 }: FlowerFieldOptions = {},
): FlowerFieldData {
  const rng = createRng(seed)
  const {
    flowerCount: baseFlowerCount,
    depthBands,
    variantsPerArchetype,
    petalScaleJitterRange,
    petalInsetRange,
    cupAngleRange,
    petalDroopJitter,
    maxFlowerTilt,
    centerRadiusRange,
    centerVariantCount,
    archetypePreferredCenters,
    centerPreferenceStrength,
    stem: stemConfig,
    outliers,
  } = FLOWER_FIELD_CONFIG
  const flowerCount = Math.round(baseFlowerCount * densityMultiplier)
  const wiltColor = new THREE.Color(outliers.wiltColor)

  const makePetalGroups = (): PetalVariantGroup[] => {
    const groups: PetalVariantGroup[] = []
    for (let archetypeIndex = 0; archetypeIndex < PETAL_ARCHETYPES.length; archetypeIndex++) {
      for (let variantIndex = 0; variantIndex < variantsPerArchetype; variantIndex++) {
        groups.push({ archetypeIndex, variantIndex, instances: [] })
      }
    }
    return groups
  }
  // Split by depth band, not just variant — foreground gets its own set so
  // FlowerField.tsx can back it with a real-transmission material (see
  // materials.ts) without paying that cost for the thousands of mid/
  // background petals DoF already blurs past the point it would show.
  const petalGroups = makePetalGroups()
  const foregroundPetalGroups = makePetalGroups()

  const centerGroups: CenterVariantGroup[] = []
  for (let variantIndex = 0; variantIndex < centerVariantCount; variantIndex++) {
    centerGroups.push({ variantIndex, instances: [] })
  }
  const stemGroups: StemVariantGroup[] = []
  for (let variantIndex = 0; variantIndex < stemConfig.variantCount; variantIndex++) {
    stemGroups.push({ variantIndex, instances: [] })
  }

  const petalMatrix = new THREE.Matrix4()
  const centerMatrix = new THREE.Matrix4()
  const stemMatrix = new THREE.Matrix4()

  const bandCounts = allocateBandCounts(depthBands, flowerCount)
  depthBands.forEach((band, bandIndex) => {
    const bandCount = bandCounts[bandIndex]
    const isForeground = band.name === 'foreground'

    for (let i = 0; i < bandCount; i++) {
      const flowerPosition = sampleBandPosition(rng, band, meadowLayout)

      const flowerScale = range(rng, band.scaleRange[0], band.scaleRange[1]) * scaleMultiplier
      const stemHeight = flowerScale * range(rng, band.stemHeightFactorRange[0], band.stemHeightFactorRange[1])
      const groundY = sampleTerrainHeight(flowerPosition.x, flowerPosition.z, terrainShape) - samplePathDepression(flowerPosition.x, flowerPosition.z, meadowLayout)
      flowerPosition.y = groundY + stemHeight

      // Same small-random-lean idea as generateGrass.ts's blades — a stem
      // standing perfectly vertical reads as artificial. Spins around
      // world-up first so the lean direction is uniformly distributed, not
      // just tilting in the same plane repeatedly. A rare few flop right
      // over instead of just leaning — real stems do, from wind/weight/rot,
      // and a field where *nothing* ever does reads as every instance being
      // a small bounded jitter around one template.
      const isFlopped = rng() < stemConfig.flopProbability
      const leanAmount = isFlopped ? range(rng, stemConfig.flopLeanRange[0], stemConfig.flopLeanRange[1]) : range(rng, 0, stemConfig.maxLean)
      const stemLeanAxisAngle = range(rng, 0, Math.PI * 2)
      const stemLeanAxis = new THREE.Vector3(Math.cos(stemLeanAxisAngle + Math.PI / 2), 0, Math.sin(stemLeanAxisAngle + Math.PI / 2))
      const stemQuat = new THREE.Quaternion().setFromAxisAngle(UP, stemLeanAxisAngle)
      stemQuat.multiply(new THREE.Quaternion().setFromAxisAngle(stemLeanAxis, leanAmount))

      stemMatrix.makeRotationFromQuaternion(stemQuat)
      stemMatrix.scale(new THREE.Vector3(flowerScale, stemHeight, flowerScale))
      stemMatrix.setPosition(flowerPosition.x, groundY, flowerPosition.z)

      const stemBaseColor = new THREE.Color(stemColorPalette[Math.floor(rng() * stemColorPalette.length) % stemColorPalette.length])
      const stemVariantIndex = intRange(rng, 0, stemConfig.variantCount - 1)
      stemGroups[stemVariantIndex].instances.push({ matrix: stemMatrix.clone(), color: jitterColor(rng, stemBaseColor, 0.08) })

      // Colour and archetype are rolled together, not independently — a
      // poppy-accent flower gets the poppy *shape* too (see config.ts's
      // POPPY_ARCHETYPE_INDEX), and every other flower picks freely across
      // all six archetypes instead of the old rounded/elongated coin flip.
      const isPoppy = rollIsPoppy(rng, poppyAccentProbability)
      const baseColor = isPoppy ? samplePoppyColor(rng) : samplePetalBaseColor(rng, palette)
      const archetypeIndex = isPoppy ? POPPY_ARCHETYPE_INDEX : intRange(rng, 0, PETAL_ARCHETYPES.length - 1)

      const isWilted = rng() < outliers.wiltProbability
      const wiltAmount = isWilted ? range(rng, outliers.wiltAmountRange[0], outliers.wiltAmountRange[1]) : 0
      const petalBaseColor = isWilted ? baseColor.clone().lerp(wiltColor, wiltAmount) : baseColor

      let petalCount = intRange(rng, band.petalCountRange[0], band.petalCountRange[1])
      if (rng() < outliers.dropPetalProbability) {
        petalCount = Math.max(3, petalCount - intRange(rng, outliers.dropPetalCountRange[0], outliers.dropPetalCountRange[1]))
      }
      const cupAngle = range(rng, cupAngleRange[0], cupAngleRange[1])

      // A small cone around FACE_AXIS, not a full random tumble — most
      // flowers stay roughly lens-facing, matching how a real macro shot
      // would frame them, while still varying per instance.
      const tiltAxisAngle = range(rng, 0, Math.PI * 2)
      const tiltAxis = new THREE.Vector3(Math.cos(tiltAxisAngle), Math.sin(tiltAxisAngle), 0)
      const tiltQuat = new THREE.Quaternion().setFromAxisAngle(tiltAxis, range(rng, 0, maxFlowerTilt))
      const spinQuat = new THREE.Quaternion().setFromAxisAngle(FACE_AXIS, range(rng, 0, Math.PI * 2))
      const flowerQuat = spinQuat.multiply(tiltQuat)

      const activePetalGroups = isForeground ? foregroundPetalGroups : petalGroups

      for (let p = 0; p < petalCount; p++) {
        const angleBase = (p / petalCount) * Math.PI * 2
        const angleJitter = gaussianish(rng) * ((Math.PI / petalCount) * 0.5)
        const angle = angleBase + angleJitter

        const radialLocal = new THREE.Vector3(Math.cos(angle), Math.sin(angle), 0)
        const cup = cupAngle + gaussianish(rng) * petalDroopJitter
        const growthLocal = new THREE.Vector3()
          .addScaledVector(radialLocal, Math.cos(cup))
          .addScaledVector(FACE_AXIS, Math.sin(cup))
          .normalize()

        const tangentLocal = new THREE.Vector3().crossVectors(FACE_AXIS, radialLocal).normalize()
        const normalLocal = new THREE.Vector3().crossVectors(tangentLocal, growthLocal).normalize()

        const growthWorld = growthLocal.clone().applyQuaternion(flowerQuat)
        const tangentWorld = tangentLocal.clone().applyQuaternion(flowerQuat)
        const normalWorld = normalLocal.clone().applyQuaternion(flowerQuat)

        const petalScale = flowerScale * range(rng, petalScaleJitterRange[0], petalScaleJitterRange[1])
        const inset = range(rng, petalInsetRange[0], petalInsetRange[1]) * flowerScale
        const petalPosition = flowerPosition.clone().addScaledVector(growthWorld, inset)

        petalMatrix.makeBasis(tangentWorld, growthWorld, normalWorld)
        petalMatrix.scale(new THREE.Vector3(petalScale, petalScale, petalScale))
        petalMatrix.setPosition(petalPosition)

        const variantIndex = intRange(rng, 0, variantsPerArchetype - 1)
        const group = activePetalGroups[archetypeIndex * variantsPerArchetype + variantIndex]
        group.instances.push({ matrix: petalMatrix.clone(), color: jitterColor(rng, petalBaseColor, 0.05) })
      }

      const worldFace = FACE_AXIS.clone().applyQuaternion(flowerQuat)
      const rightWorld = new THREE.Vector3(1, 0, 0).applyQuaternion(flowerQuat)
      const upWorld = new THREE.Vector3(0, 1, 0).applyQuaternion(flowerQuat)

      const centerRadius = range(rng, centerRadiusRange[0], centerRadiusRange[1]) * flowerScale
      const centerPosition = flowerPosition.clone().addScaledVector(worldFace, centerRadius * 0.3)

      centerMatrix.makeBasis(rightWorld, upWorld, worldFace)
      centerMatrix.scale(new THREE.Vector3(centerRadius, centerRadius, centerRadius))
      centerMatrix.setPosition(centerPosition)

      // Correlated with the petal archetype (config.ts's
      // archetypePreferredCenters), not an independent roll — this is what
      // makes a "species" a consistent shape+center combo instead of two
      // unrelated random picks that happen to sit next to each other.
      const preferredCenters = archetypePreferredCenters[archetypeIndex]
      const centerVariantIndex =
        rng() < centerPreferenceStrength
          ? preferredCenters[intRange(rng, 0, preferredCenters.length - 1)]
          : intRange(rng, 0, centerVariantCount - 1)

      centerGroups[centerVariantIndex].instances.push({ matrix: centerMatrix.clone(), color: sampleCenterColor(rng, palette) })
    }
  })

  return { petalGroups, foregroundPetalGroups, centerGroups, stemGroups }
}
