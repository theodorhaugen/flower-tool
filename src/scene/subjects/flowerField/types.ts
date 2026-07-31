import type * as THREE from 'three'

export interface InstanceDatum {
  matrix: THREE.Matrix4
  color: THREE.Color
}

export interface PetalVariantGroup {
  archetypeIndex: number
  variantIndex: number
  instances: InstanceDatum[]
}

export interface FlowerFieldData {
  petalGroups: PetalVariantGroup[]
  centers: InstanceDatum[]
}
