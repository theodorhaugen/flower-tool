import * as THREE from 'three'
import { CAMERA_Z, frustumWidthHalfAt } from '../../shared/frustum'
import { sampleMeadowDensity } from '../../shared/meadowLayout'
import { MEADOW_LAYOUT } from '../../shared/meadowLayoutConfig'
import { createRng, gaussianish, intRange, range } from '../../shared/random'
import { sampleTerrainHeight } from '../../shared/terrainHeight'
import { TERRAIN_SHAPE } from '../../shared/terrainShapeConfig'
import { FLOWER_FIELD_CONFIG, PETAL_ARCHETYPES } from './config'
import type { DepthBand } from './config'
import { jitterColor, sampleCenterColor, samplePetalBaseColor } from './palette'
import type { FlowerFieldData, InstanceDatum, PetalVariantGroup } from './types'

// Flowers default to facing the camera (the field is composed for a
// horizontally-aimed lens, not a top-down view) — tilt/spin are applied
// relative to this axis so "randomized rotation" still reads as flowers,
// not an edge-on tumble of disks.
const FACE_AXIS = new THREE.Vector3(0, 0, 1)

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
function sampleBandPosition(rng: () => number, band: DepthBand): THREE.Vector3 {
  const { minCameraDistance, maxSampleAttemptsPerFlower } = FLOWER_FIELD_CONFIG
  const nearestZ = CAMERA_Z - minCameraDistance

  for (let attempt = 0; attempt < maxSampleAttemptsPerFlower; attempt++) {
    const z = Math.min(range(rng, band.zMin, band.zMax), nearestZ)
    const widthHalf = frustumWidthHalfAt(z)
    const x = range(rng, -widthHalf, widthHalf)

    const density = sampleMeadowDensity(x, z, widthHalf, MEADOW_LAYOUT)
    if (rng() < density || attempt === maxSampleAttemptsPerFlower - 1) {
      return new THREE.Vector3(x, 0, z)
    }
  }

  // Unreachable — the loop always returns on its last attempt — but keeps TS happy.
  return new THREE.Vector3(0, 0, band.zMax)
}

/**
 * Generates a full flower field as instance-ready transforms/colors, grouped
 * by petal geometry variant so each group can back its own InstancedMesh.
 * Pure function of `seed` — same seed always reproduces the same field.
 */
export function generateFlowerField(seed: number = FLOWER_FIELD_CONFIG.seed): FlowerFieldData {
  const rng = createRng(seed)
  const {
    flowerCount,
    depthBands,
    variantsPerArchetype,
    petalScaleJitterRange,
    petalInsetRange,
    cupAngleRange,
    petalDroopJitter,
    maxFlowerTilt,
    centerRadiusRange,
  } = FLOWER_FIELD_CONFIG

  const petalGroups: PetalVariantGroup[] = []
  for (let archetypeIndex = 0; archetypeIndex < PETAL_ARCHETYPES.length; archetypeIndex++) {
    for (let variantIndex = 0; variantIndex < variantsPerArchetype; variantIndex++) {
      petalGroups.push({ archetypeIndex, variantIndex, instances: [] })
    }
  }
  const centers: InstanceDatum[] = []

  const petalMatrix = new THREE.Matrix4()
  const centerMatrix = new THREE.Matrix4()

  const bandCounts = allocateBandCounts(depthBands, flowerCount)
  depthBands.forEach((band, bandIndex) => {
    const bandCount = bandCounts[bandIndex]

    for (let i = 0; i < bandCount; i++) {
      const flowerPosition = sampleBandPosition(rng, band)

      const flowerScale = range(rng, band.scaleRange[0], band.scaleRange[1])
      const stemHeight = flowerScale * range(rng, band.stemHeightFactorRange[0], band.stemHeightFactorRange[1])
      flowerPosition.y = sampleTerrainHeight(flowerPosition.x, flowerPosition.z, TERRAIN_SHAPE) + stemHeight

      const petalCount = intRange(rng, band.petalCountRange[0], band.petalCountRange[1])
      const cupAngle = range(rng, cupAngleRange[0], cupAngleRange[1])
      const baseColor = samplePetalBaseColor(rng)
      const archetypeIndex = rng() < 0.5 ? 0 : 1

      // A small cone around FACE_AXIS, not a full random tumble — most
      // flowers stay roughly lens-facing, matching how a real macro shot
      // would frame them, while still varying per instance.
      const tiltAxisAngle = range(rng, 0, Math.PI * 2)
      const tiltAxis = new THREE.Vector3(Math.cos(tiltAxisAngle), Math.sin(tiltAxisAngle), 0)
      const tiltQuat = new THREE.Quaternion().setFromAxisAngle(tiltAxis, range(rng, 0, maxFlowerTilt))
      const spinQuat = new THREE.Quaternion().setFromAxisAngle(FACE_AXIS, range(rng, 0, Math.PI * 2))
      const flowerQuat = spinQuat.multiply(tiltQuat)

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
        const group = petalGroups[archetypeIndex * variantsPerArchetype + variantIndex]
        group.instances.push({ matrix: petalMatrix.clone(), color: jitterColor(rng, baseColor, 0.05) })
      }

      const worldFace = FACE_AXIS.clone().applyQuaternion(flowerQuat)
      const rightWorld = new THREE.Vector3(1, 0, 0).applyQuaternion(flowerQuat)
      const upWorld = new THREE.Vector3(0, 1, 0).applyQuaternion(flowerQuat)

      const centerRadius = range(rng, centerRadiusRange[0], centerRadiusRange[1]) * flowerScale
      const centerPosition = flowerPosition.clone().addScaledVector(worldFace, centerRadius * 0.3)

      centerMatrix.makeBasis(rightWorld, upWorld, worldFace)
      centerMatrix.scale(new THREE.Vector3(centerRadius, centerRadius, centerRadius))
      centerMatrix.setPosition(centerPosition)

      centers.push({ matrix: centerMatrix.clone(), color: sampleCenterColor(rng) })
    }
  })

  return { petalGroups, centers }
}
