import * as THREE from 'three'
import { FLOWER_FIELD_CONFIG, PETAL_ARCHETYPES } from './config'
import { jitterColor, sampleCenterColor, samplePetalBaseColor } from './palette'
import { createRng, gaussianish, intRange, range } from './random'
import type { FlowerFieldData, InstanceDatum, PetalVariantGroup } from './types'

// Flowers default to facing the camera (the field is composed for a
// horizontally-aimed lens, not a top-down view) — tilt/spin are applied
// relative to this axis so "randomized rotation" still reads as flowers,
// not an edge-on tumble of disks.
const FACE_AXIS = new THREE.Vector3(0, 0, 1)
const CAMERA_Z = 6 // matches MainCamera's default position; only used to bias scatter extent by depth

interface Cluster {
  x: number
  y: number
  z: number
  radius: number
}

function distanceFromCamera(z: number): number {
  return Math.max(0, CAMERA_Z - z)
}

function createClusters(rng: () => number, count: number): Cluster[] {
  const { depthNear, depthFar, minCameraDistance, widthHalfBase, widthHalfPerDepth, yHalfBase, yHalfPerDepth, clusterRadiusRange } =
    FLOWER_FIELD_CONFIG
  const nearestZ = CAMERA_Z - minCameraDistance

  return Array.from({ length: count }, () => {
    const z = Math.min(range(rng, depthFar, depthNear), nearestZ)
    const dist = distanceFromCamera(z)
    const widthHalf = widthHalfBase + widthHalfPerDepth * dist
    const yHalf = yHalfBase + yHalfPerDepth * dist

    return {
      x: range(rng, -widthHalf, widthHalf),
      y: range(rng, -yHalf, yHalf),
      z,
      radius: range(rng, clusterRadiusRange[0], clusterRadiusRange[1]),
    }
  })
}

function scatterInCluster(rng: () => number, cluster: Cluster): THREE.Vector3 {
  const dx = gaussianish(rng) * cluster.radius
  const dy = gaussianish(rng) * cluster.radius
  const dz = gaussianish(rng) * cluster.radius * 0.6
  const nearestZ = CAMERA_Z - FLOWER_FIELD_CONFIG.minCameraDistance
  const z = Math.min(cluster.z + dz, nearestZ)
  return new THREE.Vector3(cluster.x + dx, cluster.y + dy, z)
}

/** Scattered independently of any cluster — sparse filler so gaps between patches don't read as empty voids. */
function scatterAmbient(rng: () => number): THREE.Vector3 {
  const { depthNear, depthFar, minCameraDistance, widthHalfBase, widthHalfPerDepth, yHalfBase, yHalfPerDepth } =
    FLOWER_FIELD_CONFIG
  const nearestZ = CAMERA_Z - minCameraDistance
  const z = Math.min(range(rng, depthFar, depthNear), nearestZ)
  const dist = distanceFromCamera(z)
  const widthHalf = widthHalfBase + widthHalfPerDepth * dist
  const yHalf = yHalfBase + yHalfPerDepth * dist
  return new THREE.Vector3(range(rng, -widthHalf, widthHalf), range(rng, -yHalf, yHalf), z)
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
    clusterCount,
    ambientFraction,
    variantsPerArchetype,
    petalCountRange,
    flowerScaleRange,
    petalScaleJitterRange,
    petalInsetRange,
    cupAngleRange,
    petalDroopJitter,
    maxFlowerTilt,
    centerRadiusRange,
  } = FLOWER_FIELD_CONFIG

  const clusters = createClusters(rng, clusterCount)

  const petalGroups: PetalVariantGroup[] = []
  for (let archetypeIndex = 0; archetypeIndex < PETAL_ARCHETYPES.length; archetypeIndex++) {
    for (let variantIndex = 0; variantIndex < variantsPerArchetype; variantIndex++) {
      petalGroups.push({ archetypeIndex, variantIndex, instances: [] })
    }
  }
  const centers: InstanceDatum[] = []

  const petalMatrix = new THREE.Matrix4()
  const centerMatrix = new THREE.Matrix4()

  for (let i = 0; i < flowerCount; i++) {
    const flowerPosition =
      rng() < ambientFraction ? scatterAmbient(rng) : scatterInCluster(rng, clusters[Math.floor(rng() * clusters.length)])

    const flowerScale = range(rng, flowerScaleRange[0], flowerScaleRange[1])
    const petalCount = intRange(rng, petalCountRange[0], petalCountRange[1])
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

  return { petalGroups, centers }
}
