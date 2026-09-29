import { useEffect, useMemo } from 'react'
import { useGenerative, usePalette } from '../shared/generativeContext'
import { POST_PROCESSING_CONFIG } from './config'
import { PaletteGradePass } from './PaletteGradePass'

/**
 * R3F wrapper — constructs PaletteGradePass from the active palette
 * (colours), effects/config.ts's `paletteGrade` block (base tuning), and
 * the generative state's manual tone controls (Leva's Colour fold —
 * Exposure/Brightness/Highlights/Shadows/Contrast/Vibrance, 1/0 = as
 * tuned), same pattern as LongExposureBlur.tsx. Exposure/Contrast/Vibrance
 * multiply a config base; Brightness/Highlights/Shadows have no base to
 * multiply (their neutral value is 0, and multiplying anything by 0 is
 * still 0) so their Leva value is passed straight through instead.
 */
export function PaletteGrade() {
  const palette = usePalette()
  const { exposureAmount, brightnessAmount, highlightsAmount, shadowsAmount, contrastAmount, vibranceAmount } = useGenerative()
  const { highlightStrength, shadowStrength, bloomBiasStrength, bloomBiasThreshold, exposure, contrast, vibrance, vignette } =
    POST_PROCESSING_CONFIG.paletteGrade

  const pass = useMemo(
    () =>
      new PaletteGradePass({
        // Dedicated near-white/dark anchors (shared/palette.ts), not
        // `glow`/`foliagePrimary` — neither of those is reliably near the
        // actual lightness extreme on every palette (glow reads as
        // colourful-and-light, not white, on 4 of 5; foliagePrimary needed
        // `foliageShadowTint`'s cap just to count as "dark" on one), so the
        // two-point grade below could never reach a genuinely wide
        // lightness range regardless of highlightStrength/shadowStrength.
        highlightColor: palette.paleLight,
        shadowColor: palette.deepShade,
        bloomTintColor: palette.glow,
        highlightStrength,
        shadowStrength,
        bloomBiasStrength,
        bloomBiasThreshold,
        exposure: exposure * exposureAmount,
        brightness: brightnessAmount,
        highlightsAdjust: highlightsAmount,
        shadowsAdjust: shadowsAmount,
        contrast: contrast * contrastAmount,
        vibrance: vibrance * vibranceAmount,
        vignette,
      }),
    [
      palette,
      highlightStrength,
      shadowStrength,
      bloomBiasStrength,
      bloomBiasThreshold,
      exposure,
      exposureAmount,
      brightnessAmount,
      highlightsAmount,
      shadowsAmount,
      contrast,
      contrastAmount,
      vibrance,
      vibranceAmount,
      vignette,
    ],
  )

  useEffect(() => {
    return () => {
      pass.dispose()
    }
  }, [pass])

  return <primitive object={pass} />
}
