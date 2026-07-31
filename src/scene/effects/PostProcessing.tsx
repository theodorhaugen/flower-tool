import { Bloom, EffectComposer, Vignette } from '@react-three/postprocessing'

/**
 * Post-processing pipeline. Only the barest, subject-agnostic effects live
 * here for now (soft bloom + vignette) — this is the slot where
 * depth-of-field / grain / chromatic aberration get added once there's an
 * actual flower subject to defocus around.
 */
export function PostProcessing() {
  return (
    <EffectComposer multisampling={4}>
      <Bloom intensity={0.35} luminanceThreshold={0.6} luminanceSmoothing={0.2} mipmapBlur />
      <Vignette eskil={false} offset={0.2} darkness={0.6} />
    </EffectComposer>
  )
}
