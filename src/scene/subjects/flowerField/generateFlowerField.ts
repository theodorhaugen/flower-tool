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

/** ~137.5°, the classic phyllotaxis spiral angle — used to spread spike blooms around the stem the way real florets on a raceme actually spiral, not a mechanical even split. */
const GOLDEN_ANGLE = 2.39996

/**
 * How much shallower a flower centre sits than it is wide, relative to
 * `centerRadius` — every centre geometry variant (geometryVariants.ts's
 * `buildCenterGeometryVariants`) is built from a roughly-spherical base
 * (an icosahedron or partial sphere), and scaling that uniformly by
 * `centerRadius` on all three axes made the centre stick as far *out*
 * towards the camera as it spans side-to-side — a true ball sitting on
 * the petal face, not a disc-like cluster of stamens/florets. Only the
 * `worldFace` axis (the centre's depth/protrusion direction — see
 * `centerMatrix.makeBasis` below) gets this reduction; the radial
 * footprint (how much of the petal ring the centre visually covers)
 * stays at the full `centerRadius`.
 *
 * Raised from an initial 0.55 — checked directly against a sharp (motion
 * blur and DOF bokeh both minimised) render and 0.55 still read as a
 * distinctly round ball with a clear circular specular highlight, not a
 * flatter disc; 0.35 is enough of a cut to actually change the silhouette
 * from most viewing angles, not just soften it.
 */
const CENTER_DEPTH_SCALE = 0.35

type Species = 'bloom' | 'umbel' | 'spike'

/** Weighted pick among the three plant structures — see config.ts's `species.weights`. */
function pickSpecies(rng: () => number, weights: Record<Species, number>): Species {
  const entries = Object.entries(weights) as [Species, number][]
  const total = entries.reduce((sum, [, w]) => sum + w, 0)
  let roll = rng() * total
  for (const [species, weight] of entries) {
    roll -= weight
    if (roll <= 0) return species
  }
  return entries[0][0] // unreachable — weights sum to total — but keeps TS happy
}

/** A quaternion whose local +Z (FACE_AXIS) points along `facing`, spun around that axis by `spin` first — the general-purpose version of the cone-tilt math the classic single-bloom case uses, for heads whose facing direction is computed directly in world space (umbel florets, spike blooms) instead of via a tilt cone. */
function quaternionFacing(facing: THREE.Vector3, spin: number): THREE.Quaternion {
  const reorient = new THREE.Quaternion().setFromUnitVectors(FACE_AXIS, facing)
  const localSpin = new THREE.Quaternion().setFromAxisAngle(FACE_AXIS, spin)
  return reorient.multiply(localSpin)
}

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

/**
 * Guaranteed minimum flowers in any one band, regardless of how thin its
 * area×densityMultiplier weight comes out — the foreground band's own small
 * on-screen area combined with its deliberately low 0.22 multiplier (a few
 * large hero blooms, not a dense carpet) already gives it well under 1% of
 * total weight; at Leva's Flowers > Density floor (0.2, flowerCount≈920)
 * that rounded down to roughly 5 flowers scattered across the whole
 * foreground width/depth — no longer "a few intentional hero blooms," just
 * a broken-looking near-empty band the depth-of-field composition relies on
 * having *something* in.
 */
const MIN_BAND_COUNT = 15

/** Splits flowerCount across bands proportionally to area × densityMultiplier, not a fixed share — then backfills any band that rounded below MIN_BAND_COUNT out of whichever band currently has the most, so a thin band's floor doesn't also thin out its neighbours. */
function allocateBandCounts(depthBands: readonly DepthBand[], flowerCount: number): number[] {
  const weights = depthBands.map((band) => approximateBandArea(band) * band.densityMultiplier)
  const totalWeight = weights.reduce((sum, w) => sum + w, 0)

  const counts = weights.map((weight) => Math.round((flowerCount * weight) / totalWeight))
  const shortfall = flowerCount - counts.reduce((sum, c) => sum + c, 0)
  counts[counts.length - 1] += shortfall // absorb rounding drift in the last (background) band

  const floor = Math.min(MIN_BAND_COUNT, Math.floor(flowerCount / depthBands.length))
  for (let i = 0; i < counts.length; i++) {
    if (counts[i] >= floor) continue
    const deficit = floor - counts[i]
    const donorIndex = counts.reduce((maxIdx, c, idx) => (c > counts[maxIdx] ? idx : maxIdx), 0)
    if (donorIndex === i) continue
    counts[donorIndex] -= deficit
    counts[i] = floor
  }

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
 * generative seed; `stemColorPalette` from environment/paletteColors.ts
 * (derived from the active palette's own `stem` role, its own green-family
 * tint distinct from the grass around it); `options` from the same state's
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
    species: speciesConfig,
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

  /**
   * Emits one flower head — a ring of `petalCount` petals plus one center —
   * at an arbitrary world position/orientation/scale. The classic single-
   * bloom species calls this exactly once per plant; `umbel`/`spike` call
   * it many times (once per tiny floret / per mini-bloom along the stem),
   * which is the whole mechanism behind those reading as a structurally
   * different *kind* of plant rather than just a differently-shaped single
   * flower. `activePetalGroups` is passed per call (not closed over) since
   * it depends on the *plant's* depth band, decided once by the caller.
   */
  function emitHead(
    activePetalGroups: PetalVariantGroup[],
    headPosition: THREE.Vector3,
    headQuat: THREE.Quaternion,
    headScale: number,
    petalCount: number,
    archetypeIndex: number,
    petalColor: THREE.Color,
  ): void {
    const cupAngle = range(rng, cupAngleRange[0], cupAngleRange[1])
    const worldFace = FACE_AXIS.clone().applyQuaternion(headQuat)
    const rightWorld = new THREE.Vector3(1, 0, 0).applyQuaternion(headQuat)
    const upWorld = new THREE.Vector3(0, 1, 0).applyQuaternion(headQuat)

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

      const growthWorld = growthLocal.clone().applyQuaternion(headQuat)
      const tangentWorld = tangentLocal.clone().applyQuaternion(headQuat)
      const normalWorld = normalLocal.clone().applyQuaternion(headQuat)

      const petalScale = headScale * range(rng, petalScaleJitterRange[0], petalScaleJitterRange[1])
      const inset = range(rng, petalInsetRange[0], petalInsetRange[1]) * headScale
      const petalPosition = headPosition.clone().addScaledVector(growthWorld, inset)

      petalMatrix.makeBasis(tangentWorld, growthWorld, normalWorld)
      petalMatrix.scale(new THREE.Vector3(petalScale, petalScale, petalScale))
      petalMatrix.setPosition(petalPosition)

      const variantIndex = intRange(rng, 0, variantsPerArchetype - 1)
      const group = activePetalGroups[archetypeIndex * variantsPerArchetype + variantIndex]
      group.instances.push({ matrix: petalMatrix.clone(), color: jitterColor(rng, petalColor, 0.05) })
    }

    // Guards against ever emitting a centre with nothing around it — no
    // current config path actually lets `petalCount` reach 0 (every
    // depth-band/species/outlier range bottoms out at 3+), but nothing
    // structurally tied the two together either, so a future range change
    // could silently reproduce a "centre with no petals" flower with no
    // warning. Cheap enough to guard unconditionally.
    if (petalCount <= 0) return

    const centerRadius = range(rng, centerRadiusRange[0], centerRadiusRange[1]) * headScale
    // Tracks the *same* forward/backward lean `cupAngle` gives the petals
    // themselves (the loop above: `growthLocal`'s FACE_AXIS component is
    // `sin(cup)`) — using `petalInsetRange`'s own midpoint as the matching
    // radius, so the centre moves with the petal cluster's average
    // position instead of always sitting pinned in front of the head along
    // `worldFace` regardless of cup direction. That fixed offset was still
    // "centre detached from petals" for any flower with a negative
    // `cupAngle` (petals curling backward, away from `worldFace`) even
    // after materials.ts's depth/opacity fix — that fix stopped the centre
    // from *occluding* backward-curled petals, but did nothing about the
    // centre visually floating in front of a petal cluster that had itself
    // moved the other way. `0.15` is a small fixed forward epsilon on top —
    // enough to keep the centre disc off the petals' own attachment plane
    // (avoiding z-fighting) without being large enough to reintroduce the
    // mismatch by itself.
    const petalInsetMid = ((petalInsetRange[0] + petalInsetRange[1]) / 2) * headScale
    const centerForward = centerRadius * 0.15 + petalInsetMid * Math.sin(cupAngle)
    const centerPosition = headPosition.clone().addScaledVector(worldFace, centerForward)

    centerMatrix.makeBasis(rightWorld, upWorld, worldFace)
    centerMatrix.scale(new THREE.Vector3(centerRadius, centerRadius, centerRadius * CENTER_DEPTH_SCALE))
    centerMatrix.setPosition(centerPosition)

    // Correlated with the petal archetype (config.ts's
    // archetypePreferredCenters), not an independent roll — this is what
    // makes a "species" a consistent shape+center combo instead of two
    // unrelated random picks that happen to sit next to each other.
    const preferredCenters = archetypePreferredCenters[archetypeIndex]
    const centerVariantIndex =
      rng() < centerPreferenceStrength ? preferredCenters[intRange(rng, 0, preferredCenters.length - 1)] : intRange(rng, 0, centerVariantCount - 1)

    centerGroups[centerVariantIndex].instances.push({ matrix: centerMatrix.clone(), color: sampleCenterColor(rng, palette) })
  }

  const bandCounts = allocateBandCounts(depthBands, flowerCount)
  depthBands.forEach((band, bandIndex) => {
    const bandCount = bandCounts[bandIndex]
    const isForeground = band.name === 'foreground'
    const activePetalGroups = isForeground ? foregroundPetalGroups : petalGroups

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

      // Which *structure* this plant grows into — not just which petal
      // shape/colour it wears. See config.ts's `species` docstring.
      const species = isPoppy ? 'bloom' : pickSpecies(rng, speciesConfig.weights)

      if (species === 'umbel') {
        const { floretCountRange, domeRadiusFactor, floretScaleFactor, floretPetalCountRange } = speciesConfig.umbel
        const floretCount = intRange(rng, floretCountRange[0], floretCountRange[1])
        const domeRadius = flowerScale * domeRadiusFactor

        for (let f = 0; f < floretCount; f++) {
          const azimuth = range(rng, 0, Math.PI * 2)
          const elevation = THREE.MathUtils.degToRad(range(rng, 10, 75))
          const direction = new THREE.Vector3(Math.cos(azimuth) * Math.cos(elevation), Math.sin(elevation), Math.sin(azimuth) * Math.cos(elevation))

          const floretPosition = flowerPosition.clone().addScaledVector(direction, domeRadius * range(rng, 0.7, 1))
          const floretQuat = quaternionFacing(direction, range(rng, 0, Math.PI * 2))
          const floretScale = flowerScale * floretScaleFactor * range(rng, 0.75, 1.25)
          const floretPetalCount = intRange(rng, floretPetalCountRange[0], floretPetalCountRange[1])

          emitHead(activePetalGroups, floretPosition, floretQuat, floretScale, floretPetalCount, archetypeIndex, petalBaseColor)
        }
      } else if (species === 'spike') {
        const { bloomCountRange, bloomScaleFactor, bloomPetalCountRange, startHeightFraction } = speciesConfig.spike
        const bloomCount = intRange(rng, bloomCountRange[0], bloomCountRange[1])
        const stemBase = new THREE.Vector3(flowerPosition.x, groundY, flowerPosition.z)
        const stemUpWorld = UP.clone().applyQuaternion(stemQuat)

        // An arbitrary stable pair of axes perpendicular to the stem, so
        // each mini-bloom's outward direction can spiral around it —
        // FACE_AXIS degenerates as a cross-product reference when the stem
        // itself points near-straight along FACE_AXIS (rare, but a stem
        // is never far from world-up so this is just a safety fallback).
        const reference = Math.abs(stemUpWorld.dot(FACE_AXIS)) > 0.9 ? new THREE.Vector3(1, 0, 0) : FACE_AXIS
        const stemRight = new THREE.Vector3().crossVectors(stemUpWorld, reference).normalize()
        const stemForward = new THREE.Vector3().crossVectors(stemRight, stemUpWorld).normalize()
        const spiralStart = range(rng, 0, Math.PI * 2)

        for (let b = 0; b < bloomCount; b++) {
          const tBase = bloomCount > 1 ? b / (bloomCount - 1) : 1
          const t = THREE.MathUtils.clamp(startHeightFraction + (1 - startHeightFraction) * tBase + range(rng, -0.04, 0.04), 0, 1)
          const bloomPosition = stemBase.clone().addScaledVector(stemUpWorld, t * stemHeight)

          const spiralAngle = spiralStart + b * GOLDEN_ANGLE
          const outward = stemRight.clone().multiplyScalar(Math.cos(spiralAngle)).addScaledVector(stemForward, Math.sin(spiralAngle)).normalize()

          const bloomQuat = quaternionFacing(outward, range(rng, 0, Math.PI * 2))
          const bloomScale = flowerScale * bloomScaleFactor * range(rng, 0.8, 1.2)
          const bloomPetalCount = intRange(rng, bloomPetalCountRange[0], bloomPetalCountRange[1])

          emitHead(activePetalGroups, bloomPosition, bloomQuat, bloomScale, bloomPetalCount, archetypeIndex, petalBaseColor)
        }
      } else {
        let petalCount = intRange(rng, band.petalCountRange[0], band.petalCountRange[1])
        if (rng() < outliers.dropPetalProbability) {
          petalCount = Math.max(3, petalCount - intRange(rng, outliers.dropPetalCountRange[0], outliers.dropPetalCountRange[1]))
        }

        // A small cone around FACE_AXIS, not a full random tumble — most
        // flowers stay roughly lens-facing, matching how a real macro shot
        // would frame them, while still varying per instance.
        const tiltAxisAngle = range(rng, 0, Math.PI * 2)
        const tiltAxis = new THREE.Vector3(Math.cos(tiltAxisAngle), Math.sin(tiltAxisAngle), 0)
        const tiltQuat = new THREE.Quaternion().setFromAxisAngle(tiltAxis, range(rng, 0, maxFlowerTilt))
        const spinQuat = new THREE.Quaternion().setFromAxisAngle(FACE_AXIS, range(rng, 0, Math.PI * 2))
        const flowerQuat = spinQuat.multiply(tiltQuat)

        emitHead(activePetalGroups, flowerPosition, flowerQuat, flowerScale, petalCount, archetypeIndex, petalBaseColor)
      }
    }
  })

  return { petalGroups, foregroundPetalGroups, centerGroups, stemGroups }
}
