import { Bloom, EffectComposer, Vignette } from '@react-three/postprocessing'
import { LensOpticsDepthOfField } from './LensOpticsDepthOfField'

/**
 * Post-processing pipeline. Depth of field is the dominant visual
 * characteristic here, not a subtle finishing touch — everything outside a
 * thin, physically-derived focus slice melts into bokeh (see
 * LensOpticsDepthOfField.tsx). Bloom is listed first so its highlights get
 * blurred into soft bokeh discs by the DoF pass rather than staying crisp on
 * top of it.
 */
export function PostProcessing() {
  return (
    <EffectComposer multisampling={4}>
      <Bloom intensity={0.35} luminanceThreshold={0.6} luminanceSmoothing={0.2} mipmapBlur />
      <LensOpticsDepthOfField />
      <Vignette eskil={false} offset={0.2} darkness={0.6} />
    </EffectComposer>
  )
}
