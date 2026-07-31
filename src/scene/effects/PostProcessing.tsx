import { Bloom, ChromaticAberration, EffectComposer, Noise, Vignette } from '@react-three/postprocessing'
import { BlendFunction } from 'postprocessing'
import { Vector2 } from 'three'
import { AtmosphericHaze } from './AtmosphericHaze'
import { BilateralSoft } from './BilateralSoft'
import { POST_PROCESSING_CONFIG } from './config'
import { LensDistortion } from './LensDistortion'
import { LensOpticsDepthOfField } from './LensOpticsDepthOfField'
import { LongExposureBlur } from './LongExposureBlur'
import { PaletteGrade } from './PaletteGrade'

/**
 * Post-processing pipeline, styled after analogue photography rather than a
 * digital/social filter — every effect here is something a real lens or a
 * real strip of film would do, kept subtle enough to be felt rather than
 * noticed on its own:
 *
 * - PaletteGrade: a two-point colour grade towards the active palette's
 *   `highlight`/`shadow`, plus a bloom-tint pre-bias — listed *first* so
 *   Bloom's own glow (next) samples the already-tinted image and inherits
 *   `bloomTint` rather than being recoloured after the fact.
 * - Bloom: highlights glowing into their surroundings, listed early so
 *   depth of field blurs those highlights into soft bokeh discs rather than
 *   leaving them crisp on top of the blur.
 * - LensOpticsDepthOfField: the dominant characteristic — a thin,
 *   physically-derived focus slice, everything else melting into bokeh.
 * - AtmosphericHaze: low-frequency haze + volumetric scatter, both gated
 *   by view-space distance so the focal subject stays close to untouched
 *   and the background reads hazier — aerial perspective, not a flat veil.
 * - BilateralSoft: edge-aware softening on top — smooths the fine texture
 *   haze/bloom/DoF leave behind while its luminance-difference term keeps
 *   real contrast edges (the subject's silhouette) intact.
 * - ChromaticAberration: radially modulated, so the colour fringing only
 *   shows up towards the edges the way a real lens's does, not as a
 *   full-frame colour shift.
 * - LensDistortion: a slight barrel bow, not a fisheye.
 * - Vignette: gentle edge falloff.
 * - LongExposureBlur: simulated handheld-long-exposure blur, blending in a
 *   decaying history of recent frames — driven by the scene's own existing
 *   camera drift, not a synthetic per-object velocity streak.
 * - Noise: film grain last, on top of the fully-formed image — the
 *   emulsion layer, not a digital overlay — and premultiplied so it fades
 *   in shadows rather than sitting uniformly over everything.
 */
export function PostProcessing() {
  const { bloom, chromaticAberration, grain, vignette } = POST_PROCESSING_CONFIG

  return (
    <EffectComposer multisampling={4}>
      <PaletteGrade />
      <Bloom
        intensity={bloom.intensity}
        luminanceThreshold={bloom.luminanceThreshold}
        luminanceSmoothing={bloom.luminanceSmoothing}
        mipmapBlur
      />
      <LensOpticsDepthOfField />
      <AtmosphericHaze />
      <BilateralSoft />
      <ChromaticAberration
        offset={new Vector2(...chromaticAberration.offset)}
        radialModulation={chromaticAberration.radialModulation}
        modulationOffset={chromaticAberration.modulationOffset}
      />
      <LensDistortion />
      <Vignette eskil={false} offset={vignette.offset} darkness={vignette.darkness} />
      <LongExposureBlur />
      <Noise premultiply blendFunction={BlendFunction.OVERLAY} opacity={grain.opacity} />
    </EffectComposer>
  )
}
