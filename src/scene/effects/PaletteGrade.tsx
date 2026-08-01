import { useEffect, useMemo } from 'react'
import { useGenerative, usePalette } from '../shared/generativeContext'
import { POST_PROCESSING_CONFIG } from './config'
import { PaletteGradePass } from './PaletteGradePass'

/**
 * R3F wrapper — constructs PaletteGradePass from the active palette
 * (colours), effects/config.ts's `paletteGrade` block (base tuning), and
 * the generative state's `contrastAmount`/`vibranceAmount` (Leva's Colour >
 * Contrast/Vibrance, 1 = as tuned), same pattern as LongExposureBlur.tsx.
 */
export function PaletteGrade() {
  const palette = usePalette()
  const { contrastAmount, vibranceAmount } = useGenerative()
  const { highlightStrength, shadowStrength, bloomBiasStrength, bloomBiasThreshold, exposure, contrast, vibrance, vignette } =
    POST_PROCESSING_CONFIG.paletteGrade

  const pass = useMemo(
    () =>
      new PaletteGradePass({
        highlightColor: palette.glow,
        shadowColor: palette.foliagePrimary,
        bloomTintColor: palette.glow,
        highlightStrength,
        shadowStrength,
        bloomBiasStrength,
        bloomBiasThreshold,
        exposure,
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
