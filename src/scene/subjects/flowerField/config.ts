import { MEADOW_DEPTH_FAR, MEADOW_DEPTH_NEAR } from '../../shared/frustum'
import type { PetalArchetype } from './petalGeometry'

export interface DepthBand {
  name: string
  /** z bounds, world units. zMin is the far (more negative) edge, zMax the near edge — zMin < zMax always. */
  zMin: number
  zMax: number
  /**
   * Flowers per unit of the band's on-screen ground area, relative to the
   * other bands — NOT a share of flowerCount. A near band covers far less
   * area than a far one at the same flower count, so a fixed fraction wildly
   * over-packs it; this instead keeps occupancy comparable across bands
   * (scaled by intent — sparse hero blooms up close, hazy texture far away)
   * regardless of how the perspective width/y-spread constants are tuned.
   */
  densityMultiplier: number
  scaleRange: readonly [number, number]
  petalCountRange: readonly [number, number]
  /**
   * Stem height above the ground, as a multiple of the flower's own scale
   * (so bigger blooms sit on proportionally taller stems) — this is what
   * lifts flowers off the terrain instead of centering them on it.
   */
  stemHeightFactorRange: readonly [number, number]
}

function zAtDepthFraction(fraction: number): number {
  return MEADOW_DEPTH_NEAR + fraction * (MEADOW_DEPTH_FAR - MEADOW_DEPTH_NEAR)
}

/**
 * Central tuning knobs — no GUI yet, but every future control should read
 * from here. `seed` isn't here — it comes from the active render's
 * generative state (see shared/generative.ts) instead of a fixed value.
 */
export const FLOWER_FIELD_CONFIG = {
  flowerCount: 4600,
  variantsPerArchetype: 4,

  petalScaleJitterRange: [0.85, 1.2] as const,
  petalInsetRange: [0.05, 0.12] as const,
  cupAngleRange: [-0.35, 0.55] as const,
  petalDroopJitter: 0.14,
  maxFlowerTilt: 0.6,

  centerRadiusRange: [0.16, 0.26] as const,
  centerVariantCount: 4,
  /**
   * Which center shapes (see geometryVariants.ts's `buildCenterGeometryVariants`
   * — 0 domed, 1 granular/pollen, 2 spiky, 3 cupped/hollow) a given petal
   * archetype prefers, so "species" means a consistent shape+center combo
   * instead of two independently-random picks. Index matches
   * `PETAL_ARCHETYPES` below.
   */
  archetypePreferredCenters: [
    [0, 1],
    [1, 3],
    [2, 2],
    [3, 0],
    [1, 0],
    [2, 3],
  ] as const,
  /** Odds a flower's center ignores its archetype's preference and picks fully at random — keeps the correlation from reading as a mechanical lookup table. */
  centerPreferenceStrength: 0.7,

  /**
   * Soft base-to-tip vertex-color gradient baked into every petal — deeper/
   * richer near the attachment point (more tissue for pigment to sit in),
   * paler towards the thin tip (less tissue for light to pass through, the
   * "soft colour bleeding" that makes it feel like one continuous, unevenly
   * pigmented surface rather than a flat-tinted cutout). `jitter`
   * randomizes where the transition falls per vertex so it reads as an
   * organic bleed, not a printed gradient line.
   */
  petalColorGradient: {
    innerColor: '#cabcc2',
    outerColor: '#fffcfb',
    jitter: 0.2,
  },

  /** Roughness variance applied on top of each archetype's base roughness, per geometry variant. */
  roughnessJitter: 0.12,

  /**
   * A thin stem from the terrain up to each flower's head — without this,
   * `stemHeightFactorRange` above was only ever an invisible position
   * offset, which is what made flowers read as floating rather than
   * growing out of the ground. Kept deliberately plain (no colour
   * gradient, no petal-style translucency): a stem is meant to disappear
   * into the grass around it, not draw attention to itself.
   */
  stem: {
    variantCount: 3,
    /** Relative to the geometry's own local unit height — width itself then scales with each flower's `flowerScale` at the instance level. */
    widthScaleRange: [0.045, 0.075] as const,
    curlRange: [0.08, 0.25] as const,
    jitterAmount: 0.3,
    /** Small random lean, same idea as generateGrass.ts's — a stem standing perfectly vertical reads as artificial. */
    maxLean: 0.18,
    /** Odds a stem is a flopped-over outlier instead of the small-lean norm above — see generateFlowerField.ts. Real fields always have a few. */
    flopProbability: 0.05,
    /** How far a flopped stem leans, radians — well past `maxLean`, closer to horizontal. */
    flopLeanRange: [0.7, 1.3] as const,
  },

  /**
   * Rare per-flower "wrongness" — wilting, missing petals — so the field
   * doesn't read as every instance being a small jitter around one perfect
   * template. Real meadows are mostly uniform specifically because a few
   * genuinely off blooms exist to contrast against; their total absence is
   * itself a "generated" tell.
   */
  outliers: {
    wiltProbability: 0.04,
    wiltColor: '#6b5636',
    /** How far a wilted flower's petals lerp towards `wiltColor`, [min, max) — never total, so it still reads as "this flower" gone brown, not a different object. */
    wiltAmountRange: [0.45, 0.85] as const,
    /** Odds a flower drops a petal (or two) from its usual count — asymmetric, missing-a-petal irregularity instead of always-even spacing. */
    dropPetalProbability: 0.1,
    dropPetalCountRange: [1, 2] as const,
  },

  /**
   * Which *structure* a plant grows into, not just which petal shape it
   * wears — varying archetype/colour alone still reads as one template
   * ("a flower") recombined. These three read as genuinely different kinds
   * of plants at a glance:
   * - `bloom`: the classic single flower head — what every plant used to
   *   be, a ring of petalCountRange petals around one center.
   * - `umbel`: many tiny florets clustered into a dome atop the stem (like
   *   yarrow or Queen Anne's lace) — no single "flower," a haze of small
   *   ones.
   * - `spike`: several small blooms stacked up the stem's own upper length
   *   (like lupine or foxglove) instead of one head at the tip.
   */
  species: {
    weights: { bloom: 0.55, umbel: 0.25, spike: 0.2 },
    umbel: {
      floretCountRange: [14, 26] as const,
      /** Dome radius the florets scatter across, relative to the plant's own `flowerScale`. */
      domeRadiusFactor: 0.34,
      /** Each floret's own scale, relative to `flowerScale`. */
      floretScaleFactor: 0.16,
      floretPetalCountRange: [3, 5] as const,
    },
    spike: {
      bloomCountRange: [4, 8] as const,
      /** Each mini-bloom's own scale, relative to `flowerScale`. */
      bloomScaleFactor: 0.42,
      bloomPetalCountRange: [4, 6] as const,
      /** Fraction of the stem's height (from its base) where mini-blooms start appearing — the lower stem stays bare. */
      startHeightFraction: 0.5,
    },
  },

  // The field spans the meadow depth (see shared/frustum.ts) in front of the
  // camera. Sampled positions are clamped against `minCameraDistance` so
  // nothing ends up on top of the lens.
  minCameraDistance: 5,

  /**
   * Foreground/midground/background read: a few large near flowers, a busy
   * mid-body, and a much smaller/simpler haze of far ones — the depth cue a
   * macro shot relies on, and exactly what the depth-of-field pass keys off
   * of. Every band plants flowers on the shared terrain height (see
   * generateFlowerField.ts) rather than at an independent random altitude.
   *
   * `stemHeightFactorRange`'s lower bounds were raised (was 0.5/0.4/0.3) —
   * grass grows 0.35-0.8 world units tall (see environment/config.ts), and
   * a stem shorter than that (which the old ranges' low end regularly
   * produced, especially combined with a small `scaleRange` roll) means the
   * bloom sits *below* the surrounding grass tops, not above it, so grass
   * legitimately — not as a depth-sort bug — grows in front of the flower
   * it should be framing. Raised enough that most blooms now clear typical
   * grass height instead of most sitting below it.
   */
  depthBands: [
    {
      name: 'foreground',
      zMax: zAtDepthFraction(0),
      zMin: zAtDepthFraction(0.13),
      densityMultiplier: 0.22,
      scaleRange: [0.55, 1.05] as const,
      petalCountRange: [6, 13] as const,
      stemHeightFactorRange: [0.85, 1.35] as const,
    },
    {
      name: 'midground',
      zMax: zAtDepthFraction(0.13),
      zMin: zAtDepthFraction(0.55),
      densityMultiplier: 1,
      scaleRange: [0.3, 0.75] as const,
      petalCountRange: [5, 12] as const,
      stemHeightFactorRange: [0.75, 1.25] as const,
    },
    {
      name: 'background',
      zMax: zAtDepthFraction(0.55),
      zMin: zAtDepthFraction(1),
      densityMultiplier: 1.5,
      scaleRange: [0.12, 0.35] as const,
      petalCountRange: [4, 8] as const,
      stemHeightFactorRange: [0.5, 0.9] as const,
    },
  ] satisfies readonly DepthBand[],

  /** Rejection-sampling safety valve — see generateFlowerField.ts. */
  maxSampleAttemptsPerFlower: 40,
}

/**
 * Six distinct silhouettes, not two — with only "rounded" and "elongated"
 * every flower in the field read as the same daisy template wearing
 * different colours (see the art-direction review this responds to). Each
 * of these pushes the tapered-blade params (petalGeometry.ts) somewhere
 * the original two never went, so the field reads as several species
 * instead of one shape recombined:
 */
export const PETAL_ARCHETYPES: readonly PetalArchetype[] = [
  { tipSharpness: 0.75, curl: 0.3, twist: 0.1, widthScale: 0.68 }, // rounded
  { tipSharpness: 1.15, curl: 0.45, twist: 0.22, widthScale: 0.5 }, // elongated
  { tipSharpness: 2.4, curl: 0.15, twist: 0.05, widthScale: 0.3 }, // spiky aster — thin, sharp, barely curled
  { tipSharpness: 0.9, curl: 0.8, twist: 0, widthScale: 0.88 }, // bell — wide, cupped hard forward
  { tipSharpness: 0.5, curl: 0.6, twist: 0.15, widthScale: 1.15 }, // poppy — one or two huge rounded petals
  { tipSharpness: 1.4, curl: 0.25, twist: 0.4, widthScale: 0.55 }, // ruffled — high twist reads as a crinkled edge
]

/**
 * Which archetype a poppy-accent-coloured flower (see palette.ts's
 * `POPPY_ANCHOR`) is built from — a real poppy has a very specific
 * few-huge-rounded-petals silhouette, not an arbitrary one, so the colour
 * override and the shape it wears are no longer independent coin flips.
 */
export const POPPY_ARCHETYPE_INDEX = 4
