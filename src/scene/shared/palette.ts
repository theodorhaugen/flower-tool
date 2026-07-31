/**
 * A named, cohesive colour family for one whole render — the single source
 * every colourful thing in the scene (flowers, grass/vegetation, sky/haze,
 * lighting, bloom) draws from, instead of each system inventing its own
 * hardcoded hex values independently. That's what "cohesive" actually
 * means here: swap the palette and the *entire* image's mood changes
 * together, because everything is derived from the same five values rather
 * than five unrelated tuning knobs that happen to look okay side by side.
 *
 * Which palette a render belongs to is picked in shared/generative.ts, as
 * one of many things derived from that render's single generative seed —
 * this file only defines what a palette *is* and the registry to pick
 * from.
 *
 * - `dominantHues`: the flower "family" this render draws from — petal and
 *   centre colours are sampled from these (see subjects/flowerField/palette.ts).
 * - `highlight`: the colour of light hitting something — sunlit grass
 *   tips, the key light, the sky's brightness (see environment/paletteColors.ts,
 *   lighting/SceneLighting.tsx).
 * - `shadow`: the colour of the absence of that light — shadowed grass,
 *   the fill light, ground bounce.
 * - `bloomTint`: the literal colour of the post-processing bloom glow
 *   (see effects/PaletteGradePass.ts) — light doesn't just get brighter
 *   when it blooms, real bloom/glare picks up a colour.
 * - `hazeTint`: the colour of the air itself — scene fog, the horizon, and
 *   the screen-space atmospheric haze (see effects/AtmosphericHazeEffect.ts).
 */
export interface ColorPalette {
  name: string
  /** Hex anchors flower petals/centres are sampled from — a handful, not one, so the "family" has variety. */
  dominantHues: readonly string[]
  highlight: string
  shadow: string
  bloomTint: string
  hazeTint: string
}

export const PALETTES: readonly ColorPalette[] = [
  {
    name: 'Spring Meadow',
    dominantHues: ['#f4b9c9', '#f7e08a', '#cfe6ab', '#eaf2df', '#eec4e2'],
    highlight: '#fff6d8',
    shadow: '#48624a',
    bloomTint: '#fff2c2',
    hazeTint: '#eef3e4',
  },
  {
    name: 'Early Morning',
    dominantHues: ['#e7d8ea', '#f6e3d0', '#d7e6ea', '#f0eadf', '#e3d1d9'],
    highlight: '#ffe3b0',
    shadow: '#546575',
    bloomTint: '#ffdca0',
    hazeTint: '#dfe6ea',
  },
  {
    name: 'Golden Hour',
    dominantHues: ['#f0a868', '#e8836a', '#f4c869', '#d97a8c', '#f7dca0'],
    highlight: '#ffce7a',
    shadow: '#5a3a3f',
    bloomTint: '#ffb066',
    hazeTint: '#f0cfa0',
  },
  {
    name: 'Lavender Field',
    dominantHues: ['#b79fd1', '#9a86c2', '#d8c8e8', '#7d6fa3', '#e6dcf0'],
    highlight: '#e8ddf5',
    shadow: '#3f3660',
    bloomTint: '#c9b6ea',
    hazeTint: '#ded3ea',
  },
  {
    name: 'Summer Sky',
    dominantHues: ['#f4f1e3', '#dce8f0', '#f0dd7a', '#a9c9dd', '#eef4e0'],
    highlight: '#fff8dc',
    shadow: '#3d5a70',
    bloomTint: '#e8f0c0',
    hazeTint: '#d7e5ee',
  },
  {
    name: 'Autumn Wildflowers',
    dominantHues: ['#c9762f', '#a94430', '#d9a441', '#8a5a3c', '#c88a5a'],
    highlight: '#e8a850',
    shadow: '#4a2f22',
    bloomTint: '#d9793a',
    hazeTint: '#c9ab7e',
  },
  {
    name: 'Mist',
    dominantHues: ['#d8d8d4', '#c9d0cf', '#e0dcd8', '#b8c0c2', '#cfd6d2'],
    highlight: '#eceae5',
    shadow: '#5c6360',
    bloomTint: '#e6e6e2',
    hazeTint: '#dcdad4',
  },
]

/** Exact-name lookup, used by shared/generative.ts to let a `?palette=` override win over the seed-picked one. */
export function findPaletteByName(name: string): ColorPalette | undefined {
  return PALETTES.find((p) => p.name === name)
}
