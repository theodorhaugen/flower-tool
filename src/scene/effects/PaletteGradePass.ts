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
  varying vec2 vUv;

  float relLuminance(vec3 color) {
    return dot(color, vec3(0.2126, 0.7152, 0.0722));
  }

  void main() {
    vec4 texel = texture2D(tDiffuse, vUv);
    vec3 color = texel.rgb;
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
