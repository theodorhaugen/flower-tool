import * as THREE from 'three'
import { useMemo } from 'react'
import type { ColorPalette } from '../shared/palette'
import { usePalette } from '../shared/paletteContext'
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
  fogColor: string
  horizon: {
    skyColor: string
    horizonColor: string
    groundColor: string
  }
}

/**
 * Derives every environment colour (ground, grass, wild vegetation, fog,
 * horizon) from the active render's palette — this is what keeps the
 * meadow's colours cohesive with the flowers growing in it instead of the
 * two systems each picking their own.
 *
 * Grass/ground stay anchored to fixed green/brown base tones rather than
 * becoming literally lavender or amber under every palette — real grass
 * doesn't change species with the weather — but those anchors get tinted
 * by `highlight` (sunlit) and `shadow` (shaded), the way real grass really
 * does look different in different light. Fog/horizon read `hazeTint`
 * directly, since that's the palette's "colour of the air" by definition.
 */
export function deriveEnvironmentColors(palette: ColorPalette): EnvironmentPaletteColors {
  const groundColors: GroundColors = {
    dry: mix(BASE_DIRT, palette.highlight, 0.25),
    sparse: mix(BASE_GREEN_SPARSE, palette.highlight, 0.18),
    lush: mix(BASE_GREEN_LUSH, palette.shadow, 0.2),
    shadow: mix(BASE_GREEN_LUSH, palette.shadow, 0.5),
  }

  const grassColorPalette = [
    mix(BASE_GREEN_LUSH, palette.shadow, 0.35),
    mix(BASE_GREEN_SPARSE, palette.highlight, 0.25),
    mix(BASE_GREEN_LUSH, palette.highlight, 0.12),
    mix(BASE_GREEN_SPARSE, palette.shadow, 0.3),
    mix(BASE_GREEN_LUSH, palette.dominantHues[0], 0.08),
  ]

  const wildVegetationColorPalette = [
    mix(BASE_GREEN_LUSH, palette.shadow, 0.25),
    mix(BASE_GREEN_SPARSE, palette.highlight, 0.2),
    mix(BASE_GREEN_LUSH, palette.dominantHues[0], 0.12),
    mix(BASE_GREEN_SPARSE, palette.dominantHues[1] ?? palette.highlight, 0.1),
  ]

  const fogColor = mix(palette.hazeTint, '#ffffff', 0.05)

  const horizon = {
    skyColor: mix(palette.hazeTint, '#ffffff', 0.3),
    horizonColor: fogColor,
    groundColor: mix(BASE_DIRT, palette.hazeTint, 0.25),
  }

  return { groundColors, grassColorPalette, wildVegetationColorPalette, fogColor, horizon }
}

export function useEnvironmentPaletteColors(): EnvironmentPaletteColors {
  const palette = usePalette()
  return useMemo(() => deriveEnvironmentColors(palette), [palette])
}
