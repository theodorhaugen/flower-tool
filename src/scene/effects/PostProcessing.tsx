import { Bloom, DepthOfField, EffectComposer, Vignette } from '@react-three/postprocessing'
import { CAMERA_CONFIG } from '../camera/config'

/**
 * Post-processing pipeline. Depth of field does the heavy lifting for the
 * "macro lens" look — everything outside a thin focus slice melts into
 * bokeh. Bloom is listed first so its highlights get blurred into soft
 * bokeh discs by the DoF pass rather than staying crisp on top of it.
 */
export function PostProcessing() {
  return (
    <EffectComposer multisampling={4}>
      <Bloom intensity={0.35} luminanceThreshold={0.6} luminanceSmoothing={0.2} mipmapBlur />
      <DepthOfField
        focusDistance={CAMERA_CONFIG.dof.focusDistance}
        focusRange={CAMERA_CONFIG.dof.focusRange}
        bokehScale={CAMERA_CONFIG.dof.bokehScale}
      />
      <Vignette eskil={false} offset={0.2} darkness={0.6} />
    </EffectComposer>
  )
}
