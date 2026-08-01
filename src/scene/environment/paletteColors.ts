import * as THREE from 'three'
import { useMemo } from 'react'
import type { ColorPalette } from '../shared/palette'
import { foliageShadowTint } from '../shared/palette'
import { usePalette } from '../shared/generativeContext'
import type { GroundColors } from './groundColor'

/** Fixed vegetation/soil anchors — grass stays believably green and dirt stays believably brown across every palette; only the light hitting them changes. */
const BASE_GREEN_LUSH = '#5c6e4c'
const BASE_GREEN_SPARSE = '#8c9370'
const BASE_DIRT = '#a3946f'

function mix(a: string, b: string, t: number): string {
  return `#${new THREE.Color(a).lerp(new THREE.Color(b), t).getHexString()}`
}

export interface EnvironmentPaletteColors {
  groundColors: GroundColors
  grassColorPalette: readonly string[]
  wildVegetationColorPalette: readonly string[]
  stemColorPalette: readonly string[]
  fogColor: string
  horizon: {
    skyColor: string
    horizonColor: string
    groundColor: string
  }
}

/**
 * Derives every environment colour (ground, grass, wild vegetation, stems,
 * fog, horizon) from the active render's palette — this is what keeps the
 * meadow's colours cohesive with the flowers growing in it instead of the
 * two systems each picking their own.
 *
 * Grass/ground stay anchored to fixed green/brown base tones rather than
 * becoming literally lavender or amber under every palette — real grass
 * doesn't change species with the weather — but those anchors get tinted
 * by `glow` (sunlit) and a lightness-capped `foliagePrimary` (shaded — see
 * shared/palette.ts's `foliageShadowTint`), the way real grass really does
 * look different in different light. Stems get their own tint
 * family from `stem` instead of reusing the grass array, so a render can
 * give stems a colour identity distinct from the grass around them. Fog/
 * horizon read `background`/`backgroundSecondary` — the palette's own sky
 * gradient — since that's the palette's "colour of the air" by definition.
 */
export function deriveEnvironmentColors(palette: ColorPalette): EnvironmentPaletteColors {
  // Lightness-capped, not the raw palette value — see foliageShadowTint's
  // docstring: a palette whose `foliagePrimary` runs light (Sunlit pastel's
  // mint) would otherwise make "shaded" ground read *lighter* than lit
  // ground below.
  const shadowTint = foliageShadowTint(palette)

  const groundColors: GroundColors = {
    dry: mix(BASE_DIRT, palette.glow, 0.25),
    sparse: mix(BASE_GREEN_SPARSE, palette.glow, 0.18),
    lush: mix(BASE_GREEN_LUSH, shadowTint, 0.2),
    shadow: mix(BASE_GREEN_LUSH, shadowTint, 0.5),
  }

  const grassColorPalette = [
    mix(BASE_GREEN_LUSH, shadowTint, 0.35),
    mix(BASE_GREEN_SPARSE, palette.glow, 0.25),
    mix(BASE_GREEN_LUSH, palette.glow, 0.12),
    mix(BASE_GREEN_SPARSE, shadowTint, 0.3),
    mix(BASE_GREEN_LUSH, palette.foliageSecondary, 0.1),
  ]

  const wildVegetationColorPalette = [
    mix(BASE_GREEN_LUSH, shadowTint, 0.25),
    mix(BASE_GREEN_SPARSE, palette.glow, 0.2),
    mix(BASE_GREEN_LUSH, palette.foliageSecondary, 0.12),
    mix(BASE_GREEN_SPARSE, palette.foliageSecondary, 0.15),
  ]

  const stemColorPalette = [
    mix(BASE_GREEN_LUSH, palette.stem, 0.45),
    mix(BASE_GREEN_SPARSE, palette.stem, 0.3),
    mix(BASE_GREEN_LUSH, palette.stem, 0.65),
  ]

  const fogColor = mix(palette.backgroundSecondary, '#ffffff', 0.05)

  const horizon = {
    skyColor: mix(palette.background, '#ffffff', 0.3),
    horizonColor: fogColor,
    groundColor: mix(BASE_DIRT, palette.backgroundSecondary, 0.25),
  }

  return { groundColors, grassColorPalette, wildVegetationColorPalette, stemColorPalette, fogColor, horizon }
}

export function useEnvironmentPaletteColors(): EnvironmentPaletteColors {
  const palette = usePalette()
  return useMemo(() => deriveEnvironmentColors(palette), [palette])
}
