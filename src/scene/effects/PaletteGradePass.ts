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

    // Exposure/contrast/vibrance run first, ahead of the palette grade and
    // bloom bias below, so those two still operate on (and measure
    // luminance from) the final graded tones rather than the flat/muddy
    // input — this is the actual fix for the "washed, low-contrast, muted"
    // look: not more colour tinting, but real tonal separation first.
    color *= exposure;

    // Contrast: a simple pivot around mid-grey. Cheap and matches how a
    // print/film contrast grade reads — it isn't trying to be a filmic
    // S-curve, just a linear punch-up.
    color = (color - 0.5) * contrast + 0.5;

    // Vibrance: boosts saturation more on already-desaturated pixels
    // (muddy midtones, the exact thing making the render feel flat) and
    // backs off automatically on pixels that are already vivid, so it
    // can't push already-saturated petal colour into garish clipping.
    float maxChannel = max(color.r, max(color.g, color.b));
    float minChannel = min(color.r, min(color.g, color.b));
    float currentSaturation = maxChannel - minChannel;
    vec3 gray = vec3(relLuminance(color));
    float vibranceAmount = vibrance * (1.0 - currentSaturation);
    color = mix(gray, color, 1.0 + vibranceAmount);

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
  /** Linear brightness multiplier, applied before contrast/vibrance/grading. 1 = unchanged. */
  exposure?: number
  /** Pivot-around-mid-grey contrast multiplier. 1 = unchanged, >1 punchier. */
  contrast?: number
  /** Saturation boost, strongest on already-desaturated (muddy) pixels. 0 = unchanged. */
  vibrance?: number
  /** Soft multiplicative corner darkening, 0-1ish — natural lens light falloff, not a hard filter ring. 0 disables. */
  vignette?: number
}

/**
 * A simple two-point colour grade (lift shadows / tint highlights towards
 * the active palette's `shadow`/`highlight`) plus a bloom-tint pre-bias,
 * placed *before* Bloom in the pipeline (see PostProcessing.tsx) so
 * Bloom's own glow inherits `bloomTint` rather than being tinted after the
 * fact. A `Pass`, not an `Effect` — postprocessing's `Effect` model can
 * merge non-convolution effects into one shared shader, which would risk
 * Bloom's own internal blur sampling a buffer from *before* this grade
 * runs; a dedicated `Pass` guarantees Bloom always sees this pass's actual
 * output as its input, the same reasoning `LongExposureBlurPass` uses.
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
