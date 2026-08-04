import { Bloom, ChromaticAberration, EffectComposer, ToneMapping } from '@react-three/postprocessing'
import { ToneMappingMode } from 'postprocessing'
import { Vector2 } from 'three'
import { useGenerative } from '../shared/generativeContext'
import { AtmosphericHaze } from './AtmosphericHaze'
import { BilateralSoft } from './BilateralSoft'
import { POST_PROCESSING_CONFIG } from './config'
import { GrainOverlay } from './GrainOverlay'
import { Halation } from './Halation'
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
 * - PaletteGrade: exposure/brightness/contrast/highlights/shadows/vibrance
 *   plus a two-point colour grade towards the active palette's `glow`/
 *   `foliagePrimary` and a bloom-tint pre-bias — listed *first* so Bloom's
 *   own glow (next) samples the already-graded/tinted image and inherits
 *   `glow` rather than being recoloured after the fact.
 * - Bloom (soft): a low-threshold, wide bloom reading as ambient glow off
 *   pale/diffusely-lit surfaces — atmosphere, not a highlight blowing out.
 *   `intensity` comes from the active render's generative state (a jitter
 *   around `POST_PROCESSING_CONFIG.bloom.intensity` — see
 *   shared/generative.ts).
 * - Bloom (highlight): a second, high-threshold/narrow-smoothing bloom on
 *   top — only pixels bright enough to actually be blown-out highlights
 *   (direct sun catching an edge, sky) glow, and glow hard. This is the
 *   "highlight bloom" the panel's Lens > Highlight Bloom control drives
 *   (`highlightBloomIntensity`) — the soft bloom above can't produce this
 *   look on its own without also flattening the whole frame into haze.
 *   Both blooms are listed early so depth of field (next) blurs their glow
 *   into soft bokeh discs rather than leaving them crisp on top of the blur.
 * - Halation: a warm-tinted bleed around only the brightest highlights,
 *   gated by the same threshold as the highlight bloom above — light
 *   scattering back through a real emulsion's red-sensitive layer skews
 *   warm, which a colour-neutral bloom on its own can't produce. Listed
 *   right after both blooms for the same reason they're grouped together —
 *   depth of field (next) softens this bleed into the highlight's bokeh too.
 * - LensOpticsDepthOfField: the dominant characteristic — a thin,
 *   physically-derived focus slice, everything else melting into bokeh.
 * - AtmosphericHaze: low-frequency haze + volumetric scatter, both gated
 *   by view-space distance so the focal subject stays close to untouched
 *   and the background reads hazier — aerial perspective, not a flat veil.
 * - BilateralSoft: edge-aware softening on top — smooths the fine texture
 *   haze/bloom/DoF leave behind while its luminance-difference term keeps
 *   real contrast edges (the subject's silhouette) intact.
 * - ToneMapping (ACES Filmic): compresses the scene's actual linear/HDR
 *   output down to display range with a real filmic highlight rolloff,
 *   instead of a flat gamma encode. This has to live *here*, as an effect
 *   inside this composer, rather than as the renderer's own
 *   `toneMapping`/`toneMappingExposure` (SceneCanvas.tsx) — mounting
 *   `<EffectComposer>` unconditionally forces `renderer.toneMapping` to
 *   `NoToneMapping` for as long as it's mounted (which, here, is always),
 *   so a renderer-level tone-mapping setting is silently inert the whole
 *   time this pipeline is running. Placed after Bloom/DoF/Haze/Bilateral
 *   (which all want to see/produce genuine linear HDR values — an
 *   already-compressed input would flatten their blending) and before the
 *   purely cosmetic effects below, which are fine operating on the
 *   now-display-range image.
 * - ChromaticAberration: radially modulated, so the colour fringing only
 *   shows up towards the edges the way a real lens's does, not as a
 *   full-frame colour shift.
 * - LongExposureBlur: simulated handheld-long-exposure blur, blending in a
 *   decaying history of recent frames — driven by the scene's own existing
 *   camera drift, not a synthetic per-object velocity streak. Listed
 *   *before* LensDistortion (next), not after — LensDistortionEffect's own
 *   shader hard-zeroes any pixel whose distorted UV lands outside [0, 1],
 *   which is a real (if normally subtle) edge vignette, but this pass's
 *   within-frame streak samples up to ~10% of the frame along the pan
 *   direction (see LongExposureBlurPass.ts's `MAX_STREAK_UV`): with
 *   distortion running first, a strong sweep dragged that black edge
 *   visibly inward every time, turning a thin lens vignette into a wide
 *   dark band specifically on blurred renders. Blurring first means
 *   LensDistortion's own edge-blackening is the last thing applied to
 *   those pixels, so there's nothing left downstream to smear it with.
 * - LensDistortion: a slight barrel bow, not a fisheye.
 * - GrainOverlay: last, on top of the fully-formed image — a real
 *   photographed grain plate laid over the frame with a standard Overlay
 *   blend and a highlight falloff (dense in shadows/midtones, thinning
 *   through the highlights, like actual film) — see TextureGrainPass.ts.
 */
export function PostProcessing() {
  const { bloom, highlightBloom, chromaticAberration } = POST_PROCESSING_CONFIG
  const { bloomIntensity, highlightBloomIntensity } = useGenerative()

  return (
    // multisampling was 4 — MSAA's whole job is smoothing raw geometric
    // edge aliasing, but by the time this pipeline's own DOF/haze/bilateral-
    // soft/motion-blur have all run, those edges are already softened well
    // past where 4x MSAA's contribution is visible. Confirmed directly: a
    // pixel diff between multisampling=4 and =0 on the same seed averaged
    // 0.6/255 with under 3% of pixels differing at all, consistent with
    // film-grain's own per-frame randomness rather than a real AA loss.
    // Disabling it is a straightforward render-target/fill-rate win with no
    // measured visual cost in this pipeline specifically.
    <EffectComposer multisampling={0}>
      <PaletteGrade />
      <Bloom
        intensity={bloomIntensity}
        luminanceThreshold={bloom.luminanceThreshold}
        luminanceSmoothing={bloom.luminanceSmoothing}
        mipmapBlur
      />
      <Bloom
        intensity={highlightBloomIntensity}
        luminanceThreshold={highlightBloom.luminanceThreshold}
        luminanceSmoothing={highlightBloom.luminanceSmoothing}
        mipmapBlur
      />
      <Halation />
      <LensOpticsDepthOfField />
      <AtmosphericHaze />
      <BilateralSoft />
      <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
      <ChromaticAberration
        offset={new Vector2(...chromaticAberration.offset)}
        radialModulation={chromaticAberration.radialModulation}
        modulationOffset={chromaticAberration.modulationOffset}
      />
      <LongExposureBlur />
      <LensDistortion />
      <GrainOverlay />
    </EffectComposer>
  )
}
