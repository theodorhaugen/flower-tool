import { Pass } from 'postprocessing'
import * as THREE from 'three'

const VERTEX_SHADER = `
  varying vec2 vUv;
  void main() {
    vUv = position.xy * 0.5 + 0.5;
    gl_Position = vec4(position.xy, 1.0, 1.0);
  }
`

const FRAGMENT_SHADER = `
  uniform sampler2D tDiffuse;
  uniform vec3 highlightColor;
  uniform vec3 shadowColor;
  uniform vec3 bloomTintColor;
  uniform float highlightStrength;
  uniform float shadowStrength;
  uniform float bloomBiasStrength;
  uniform float bloomBiasThreshold;
  uniform float exposure;
  uniform float brightness;
  uniform float highlightsAdjust;
  uniform float shadowsAdjust;
  uniform float contrast;
  uniform float vibrance;
  uniform float vignette;
  varying vec2 vUv;

  float relLuminance(vec3 color) {
    return dot(color, vec3(0.2126, 0.7152, 0.0722));
  }

  void main() {
    vec4 texel = texture2D(tDiffuse, vUv);
    vec3 color = texel.rgb;

    // Exposure: a linear (camera-stop-like) multiplier — scales the whole
    // range, so it leaves true black at true black. Runs first, ahead of
    // everything below, so the rest of the grade operates on (and measures
    // luminance from) the already-exposed image rather than the flat/muddy
    // input.
    color *= exposure;

    // Brightness: a flat additive offset, distinct from exposure above —
    // it lifts/lowers every tone uniformly, including true black, the way
    // a simple "Brightness" slider does in most photo editors (as opposed
    // to "Exposure", which only ever scales).
    color += brightness;

    // Highlights/Shadows: luminance-weighted lift, independent of the flat
    // Brightness above — Highlights only touches the bright end of the
    // frame, Shadows only the dark end, the way a real editing tool's
    // Highlights/Shadows sliders recover or crush just that one end of the
    // tonal range without dragging the whole image with it.
    //
    // This pass runs *before* Bloom/ToneMapping (see PostProcessing.tsx),
    // so colour here is still unbounded pre-tonemap HDR — a typical frame's
    // raw luminance mostly sits well under 0.5, with only a small minority
    // of genuinely blown-out pixels running past 1. Compressing through
    // lum/(lum+1) — the same simple Reinhard-style curve a basic tonemap
    // uses — first bounds that unbounded range into 0-1 so the split below
    // has a fixed, finite scale to work against regardless of how bright
    // this render's HDR intermediate values happen to run. The split
    // points themselves are placed against *that compressed scale*, not
    // the naive midpoint (0.5) a display-referred image would use: 0.5
    // compressed corresponds to a raw luminance of 1.0 — already past
    // where most pixels in this pipeline ever reach — so a highlight mask
    // split there barely engages, while a shadow mask split there
    // reaches deep into ordinary midtones. 0.25/0.6 below correspond to
    // raw luminance ≈0.33/≈1.5, which actually brackets where this
    // pipeline's real shadow/highlight pixels sit.
    float preGradeLuminance = max(relLuminance(color), 0.0);
    float perceptualLuminance = preGradeLuminance / (preGradeLuminance + 1.0);
    float shadowMask = 1.0 - smoothstep(0.0, 0.25, perceptualLuminance);
    float highlightMask = smoothstep(0.33, 0.6, perceptualLuminance);
    color += shadowsAdjust * shadowMask;
    color += highlightsAdjust * highlightMask;

    // Contrast: a simple pivot around mid-grey. Cheap and matches how a
    // print/film contrast grade reads — it isn't trying to be a filmic
    // S-curve, just a linear punch-up.
    color = (color - 0.5) * contrast + 0.5;

    // Vibrance: boosts saturation more on already-desaturated pixels
    // (muddy midtones, the exact thing making the render feel flat) and
    // backs off automatically on pixels that are already vivid, so it
    // can't push already-saturated petal colour into garish clipping.
    //
    // currentSaturation is normalised (HSV-style, divided by maxChannel)
    // rather than a bare max-min channel spread — this is still unbounded
    // pre-tonemap HDR colour, so a raw channel spread can run well past 1.0
    // on a bright saturated pixel (easily reachable with Exposure/Contrast
    // pushed up), which would drive vibranceAmount negative and the
    // mix factor below 0 — mixing *past* grey rather than towards it,
    // i.e. inverting the pixel's hue instead of desaturating it. Normalising
    // keeps currentSaturation in 0-1 regardless of how bright the pixel
    // is, and the final clamp is a second backstop against the same
    // overshoot.
    float maxChannel = max(color.r, max(color.g, color.b));
    float minChannel = min(color.r, min(color.g, color.b));
    float currentSaturation = clamp((maxChannel - minChannel) / max(maxChannel, 1e-4), 0.0, 1.0);
    vec3 gray = vec3(relLuminance(color));
    float vibranceAmount = vibrance * (1.0 - currentSaturation);
    color = max(mix(gray, color, 1.0 + vibranceAmount), 0.0);

    float luminance = relLuminance(color);

    // Two-point grade: shadows lift towards shadowColor, highlights tint
    // towards highlightColor, both luminance-weighted so midtones stay
    // close to untouched and only the extremes pick up the palette's mood.
    float shadowWeight = (1.0 - smoothstep(0.0, 0.5, luminance)) * shadowStrength;
    float highlightWeight = smoothstep(0.4, 1.0, luminance) * highlightStrength;
    color = mix(color, shadowColor, shadowWeight);
    color = mix(color, highlightColor, highlightWeight);

    // Bloom-tint bias: pixels bright enough to actually bloom get pushed
    // further towards bloomTintColor *before* Bloom (next in the pipeline,
    // see PostProcessing.tsx) samples them, so the glow it produces
    // literally carries that colour instead of just being a brighter copy
    // of the scene's own colours.
    float bloomWeight = smoothstep(bloomBiasThreshold, 1.0, luminance) * bloomBiasStrength;
    color = mix(color, bloomTintColor, bloomWeight);

    // Lens light falloff: a soft multiplicative darkening towards the
    // frame's corners, distance-based rather than a hard circular mask —
    // real macro lenses (especially wide-open, which is the whole point of
    // this tool's shallow DoF) show natural corner falloff, and reference
    // photography consistently reads darker at the edges than a flat,
    // uniformly-lit frame. Deliberately multiplicative (dims, doesn't tint
    // towards black-as-a-colour) and gated by a wide smoothstep so it never
    // reads as a hard-edged filter ring.
    vec2 centered = (vUv - 0.5) * vec2(1.15, 1.0);
    float cornerDistance = length(centered);
    float falloff = smoothstep(0.25, 0.9, cornerDistance) * vignette;
    color *= 1.0 - falloff;

    gl_FragColor = vec4(color, texel.a);
  }
`

export interface PaletteGradeOptions {
  highlightColor?: THREE.ColorRepresentation
  shadowColor?: THREE.ColorRepresentation
  bloomTintColor?: THREE.ColorRepresentation
  /** How strongly bright pixels tint towards `highlightColor`, 0-1. */
  highlightStrength?: number
  /** How strongly dark pixels lift towards `shadowColor`, 0-1. */
  shadowStrength?: number
  /** How strongly the brightest (bloom-triggering) pixels bias towards `bloomTintColor`, 0-1. */
  bloomBiasStrength?: number
  /** Luminance (0-1) above which the bloom-tint bias starts ramping in — should sit close to Bloom's own `luminanceThreshold`. */
  bloomBiasThreshold?: number
  /** Linear (camera-stop-like) brightness multiplier, applied before everything else below. 1 = unchanged. */
  exposure?: number
  /** Flat additive brightness offset, applied right after exposure. 0 = unchanged. */
  brightness?: number
  /** Additive lift/pull on just the bright end of the tonal range (luminance-weighted), independent of `brightness`. 0 = unchanged, negative recovers/darkens highlights, positive brightens them further. */
  highlightsAdjust?: number
  /** Additive lift/pull on just the dark end of the tonal range (luminance-weighted), independent of `brightness`. 0 = unchanged, positive opens up shadows, negative crushes them further. */
  shadowsAdjust?: number
  /** Pivot-around-mid-grey contrast multiplier. 1 = unchanged, >1 punchier. */
  contrast?: number
  /** Saturation boost, strongest on already-desaturated (muddy) pixels. 0 = unchanged. */
  vibrance?: number
  /** Soft multiplicative corner darkening, 0-1ish — natural lens light falloff, not a hard filter ring. 0 disables. */
  vignette?: number
}

/**
 * A small set of manual, photo-editing-style tone controls (`exposure`,
 * `brightness`, `highlightsAdjust`, `shadowsAdjust`, `contrast`) — Leva's
 * Colour fold exposes all five directly (see shared/GenerativeProvider.tsx)
 * so a render's dynamic range/lightness is something the person generating
 * an image dials in by eye, rather than something this project tries to
 * guarantee automatically. (An earlier version of this pass measured each
 * frame's actual luminance spread via a GPU readback and auto-corrected a
 * black/white point — DynamicRangeMeterPass.ts, now removed — but hidden,
 * automatic correction is a worse fit for a tool whose whole point is
 * hands-on creative control over the look of one specific still.) Plus a
 * simple two-point colour grade (lift shadows / tint highlights towards the
 * active palette's `foliagePrimary`/`glow`) and a bloom-tint pre-bias,
 * placed *before* Bloom in the pipeline (see PostProcessing.tsx) so Bloom's
 * own glow inherits `bloomTintColor` (the active palette's `glow`, passed
 * in by PaletteGrade.tsx) rather than being tinted after the fact. A
 * `Pass`, not an `Effect` — postprocessing's `Effect` model can merge
 * non-convolution effects into one shared shader, which would risk Bloom's
 * own internal blur sampling a buffer from *before* this grade runs; a
 * dedicated `Pass` guarantees Bloom always sees this pass's actual output
 * as its input, the same reasoning `LongExposureBlurPass` uses.
 */
export class PaletteGradePass extends Pass {
  private readonly material: THREE.ShaderMaterial

  constructor({
    highlightColor = '#ffffff',
    shadowColor = '#000000',
    bloomTintColor = '#ffffff',
    highlightStrength = 0.12,
    shadowStrength = 0.12,
    bloomBiasStrength = 0.35,
    bloomBiasThreshold = 0.65,
    exposure = 1,
    brightness = 0,
    highlightsAdjust = 0,
    shadowsAdjust = 0,
    contrast = 1,
    vibrance = 0,
    vignette = 0,
  }: PaletteGradeOptions = {}) {
    super('PaletteGradePass')

    this.material = new THREE.ShaderMaterial({
      uniforms: {
        tDiffuse: { value: null },
        highlightColor: { value: new THREE.Color(highlightColor) },
        shadowColor: { value: new THREE.Color(shadowColor) },
        bloomTintColor: { value: new THREE.Color(bloomTintColor) },
        highlightStrength: { value: highlightStrength },
        shadowStrength: { value: shadowStrength },
        bloomBiasStrength: { value: bloomBiasStrength },
        bloomBiasThreshold: { value: bloomBiasThreshold },
        exposure: { value: exposure },
        brightness: { value: brightness },
        highlightsAdjust: { value: highlightsAdjust },
        shadowsAdjust: { value: shadowsAdjust },
        contrast: { value: contrast },
        vibrance: { value: vibrance },
        vignette: { value: vignette },
      },
      vertexShader: VERTEX_SHADER,
      fragmentShader: FRAGMENT_SHADER,
      depthTest: false,
      depthWrite: false,
    })

    this.fullscreenMaterial = this.material
  }

  render(
    renderer: THREE.WebGLRenderer,
    inputBuffer: THREE.WebGLRenderTarget | null,
    outputBuffer: THREE.WebGLRenderTarget | null,
  ): void {
    if (!inputBuffer) return
    this.material.uniforms.tDiffuse.value = inputBuffer.texture
    renderer.setRenderTarget(this.renderToScreen ? null : outputBuffer)
    renderer.render(this.scene, this.camera)
  }
}
