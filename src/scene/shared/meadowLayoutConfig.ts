import type { MeadowLayoutConfig } from './meadowLayout'

/**
 * The one meadow layout both the flower field and the environment sample —
 * this is what makes the dirt path visible in the ground colour/grass
 * coverage line up with the clearing in the flowers, instead of two
 * independently-random systems that happen to occupy the same scene.
 */
export const MEADOW_LAYOUT: MeadowLayoutConfig = {
  seed: 1337,
  noise: {
    clusterFrequency: 0.05,
    detailFrequency: 0.22,
    densityContrast: 2.2,
    densityFloor: 0.03,
  },
  paths: [
    { frequency: 0.035, amplitudeFactor: 0.55, baseWidth: 2.2, widthVariance: 0.6, seedOffset: 500, minDensity: 0.08 },
    { frequency: 0.07, amplitudeFactor: 0.32, baseWidth: 1.3, widthVariance: 0.5, seedOffset: 900, minDensity: 0.14 },
  ],
}
