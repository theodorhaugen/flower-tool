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

  // Ground darkened slightly (less `glow`/more `shadowTint` pull) and grass
  // lightened (less `shadowTint` pull) relative to their previous weights —
  // measuring rendered output across every palette found grass consistently
  // reading 2-4x darker than the ground it grows out of (25-70 lightness
  // points on a 0-255 scale, every single palette), enough that blades read
  // as dark debris scattered on a lighter surface rather than the same
  // material at different densities. Both sides moved together rather than
  // just one, since the gap was too large to close from either alone
  // without a large, single-direction hue/lightness swing.
  // `dry` also pulls towards `palette.background` — that role is documented
  // (and, per its `flowerpalettesfullrange.json` source, explicitly
  // contrast-tested) as "the dominant ground colour the flowers are
  // rendered against," but until this line it only ever reached the far
  // Horizon backdrop/fog (see Horizon.tsx/Fog.tsx below) rather than the
  // actual bare-dirt patches under the flowers in every camera framing
  // that's close enough to keep the horizon out of frame — measured
  // directly, that's most of them (this tool has no wide establishing
  // shots). Without this, `background` could go entirely unseen in a given
  // render despite being the palette's own most contrast-critical anchor.
  // `foliagePrimary`/`foliageSecondary` weight raised substantially below,
  // and — for `sparse`/`lush`/the grass/vegetation arrays, all of which
  // represent *lit* ground/foliage, not shade — sourced from the *raw*
  // `foliagePrimary` rather than the lightness-capped `shadowTint`. A
  // palette whose `foliagePrimary` sits far from green (e.g. Marigold
  // haze's sky-blue) was otherwise invisible in the actual rendered
  // grass/ground even after a first weight increase: BASE_GREEN's own
  // green hue plus the cap (meant only to stop shade reading lighter than
  // lit ground, see below) both fought the pull hard enough that the
  // result came out a muddy olive rather than recognisably blue. `shadow`
  // alone keeps the capped tint, since that term is genuinely meant to be
  // a dark variation, not the base fill. Every other palette's
  // `foliagePrimary` is already green, so this mostly just makes their
  // grass more distinctly *that palette's* green instead of a shared
  // generic default — the "cohesive" goal this file already states.
  const groundColors: GroundColors = {
    // `background` weight raised again (was 0.2) — worn-path patches (see
    // groundColor.ts's `1 - path` pull towards `dry`) turned out to
    // dominate far more of a typical close-up framing than `sparse`/`lush`
    // do, so `dry` staying mostly BASE_DIRT+`glow` left the *actual*
    // visible ground still reading as plain warm dirt regardless of the
    // `sparse`/`lush` fix above.
    dry: mix(mix(BASE_DIRT, palette.glow, 0.05), palette.background, 0.7),
    sparse: mix(BASE_GREEN_SPARSE, palette.foliagePrimary, 0.5),
    lush: mix(BASE_GREEN_LUSH, palette.foliagePrimary, 0.55),
    shadow: mix(BASE_GREEN_LUSH, shadowTint, 0.65),
  }

  const grassColorPalette = [
    mix(BASE_GREEN_LUSH, palette.foliagePrimary, 0.5),
    mix(mix(BASE_GREEN_SPARSE, palette.foliagePrimary, 0.4), palette.glow, 0.15),
    mix(mix(BASE_GREEN_LUSH, palette.foliagePrimary, 0.4), palette.glow, 0.12),
    mix(BASE_GREEN_SPARSE, palette.foliagePrimary, 0.45),
    mix(BASE_GREEN_LUSH, palette.foliageSecondary, 0.4),
  ]

  const wildVegetationColorPalette = [
    mix(BASE_GREEN_LUSH, palette.foliagePrimary, 0.45),
    mix(mix(BASE_GREEN_SPARSE, palette.foliagePrimary, 0.38), palette.glow, 0.12),
    mix(BASE_GREEN_LUSH, palette.foliageSecondary, 0.38),
    mix(BASE_GREEN_SPARSE, palette.foliageSecondary, 0.4),
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
