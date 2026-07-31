import { useEffect, useMemo } from 'react'
import { usePalette } from '../shared/paletteContext'
import { POST_PROCESSING_CONFIG } from './config'
import { PaletteGradePass } from './PaletteGradePass'

/**
 * R3F wrapper — constructs PaletteGradePass from the active palette
 * (colours) and effects/config.ts's `paletteGrade` block (strengths),
 * same pattern as LongExposureBlur.tsx.
 */
export function PaletteGrade() {
  const palette = usePalette()
  const { highlightStrength, shadowStrength, bloomBiasStrength, bloomBiasThreshold } =
    POST_PROCESSING_CONFIG.paletteGrade

  const pass = useMemo(
    () =>
      new PaletteGradePass({
        highlightColor: palette.highlight,
        shadowColor: palette.shadow,
        bloomTintColor: palette.bloomTint,
        highlightStrength,
        shadowStrength,
        bloomBiasStrength,
        bloomBiasThreshold,
      }),
    [palette, highlightStrength, shadowStrength, bloomBiasStrength, bloomBiasThreshold],
  )

  useEffect(() => {
    return () => {
      pass.dispose()
    }
  }, [pass])

  return <primitive object={pass} />
}
