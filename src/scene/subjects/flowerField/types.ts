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

export interface CenterVariantGroup {
  variantIndex: number
  instances: InstanceDatum[]
}

export interface FlowerFieldData {
  /** Midground/background petals — the cheap sheen/clearcoat translucency fake (materials.ts), since DoF already hides the difference from real transmission out here. */
  petalGroups: PetalVariantGroup[]
  /** Foreground-band petals only, same variant indexing as `petalGroups` — rendered with a separate, real-`transmission` material variant (FlowerField.tsx) since these are the few hero blooms sharp enough for it to actually show. */
  foregroundPetalGroups: PetalVariantGroup[]
  centerGroups: CenterVariantGroup[]
  stemGroups: StemVariantGroup[]
}
