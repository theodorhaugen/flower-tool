import type { InstanceDatum } from '../../shared/instancing'

export type { InstanceDatum }

export interface PetalVariantGroup {
  archetypeIndex: number
  variantIndex: number
  instances: InstanceDatum[]
}

export interface StemVariantGroup {
  variantIndex: number
  instances: InstanceDatum[]
}

export interface FlowerFieldData {
  petalGroups: PetalVariantGroup[]
  centers: InstanceDatum[]
  stemGroups: StemVariantGroup[]
}
