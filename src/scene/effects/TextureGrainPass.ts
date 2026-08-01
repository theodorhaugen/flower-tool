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
  uniform sampler2D tGrain;
  uniform float opacity;
  uniform float grainScale;
  uniform float highlightFalloffStart;
  uniform float highlightFalloffEnd;
  varying vec2 vUv;

  float relLuminance(vec3 color) {
    return dot(color, vec3(0.2126, 0.7152, 0.0722));
  }

  // Standard Photoshop-style Overlay: darkens where the grain plate reads
  // dark, lightens where it reads light, and — crucially, unlike a plain
  // additive/premultiplied blend — leaves true black/white anchored, which
  // is what keeps a real grain plate reading as a texture riding on top of
  // the image rather than a wash. Channel-wise, so the grain's own subtle
  // colour (real film grain isn't perfectly neutral) survives the blend.
  vec3 overlayBlend(vec3 base, vec3 blend) {
    return mix(2.0 * base * blend, 1.0 - 2.0 * (1.0 - base) * (1.0 - blend), step(0.5, base));
  }

  void main() {
    vec4 texel = texture2D(tDiffuse, vUv);
    vec3 base = texel.rgb;
    vec3 grain = texture2D(tGrain, vUv * grainScale).rgb;
    vec3 blended = overlayBlend(base, grain);

    // Real emulsion grain is a silver-density effect: dense (visible) in
    // shadows/midtones, and progressively thinner through the highlights as
    // the silver itself burns out — a flat, uniform-strength grain overlay
    // reads as a screen-space filter sitting on the image rather than a
    // property of the film the image was captured on. highlightFalloffStart
    // is where that thinning begins (luminance, 0-1); by
    // highlightFalloffEnd the grain has faded out completely.
    float luminance = relLuminance(base);
    float highlightFade = 1.0 - smoothstep(highlightFalloffStart, highlightFalloffEnd, luminance);
    float strength = opacity * highlightFade;

    vec3 color = mix(base, blended, strength);
    gl_FragColor = vec4(color, texel.a);
  }
`

export interface TextureGrainPassOptions {
  /** The grain plate itself — a mid-grey overlay-ready texture (photographed film grain, in this project's case), not a runtime-generated one. */
  grainTexture: THREE.Texture
  /** Overall strength — 0 disables, 1 is a full Overlay blend at every pixel the highlight falloff doesn't already fade out. */
  opacity?: number
  /** UV multiplier on the grain plate — >1 samples more of it (needs `grainTexture.wrapS/T = RepeatWrapping`, set once at load, to tile without clamping seams); <1 crops into a smaller region of it, magnified, which is what actually reads as "bigger" grain on screen. 1 = the plate at its own native scale. */
  grainScale?: number
  /** Luminance (0-1) where the highlight falloff begins thinning the grain out. */
  highlightFalloffStart?: number
  /** Luminance (0-1) where the falloff completes — the grain is fully gone by this brightness. */
  highlightFalloffEnd?: number
}

/**
 * Overlays a real photographed grain plate onto the frame with a standard
 * Overlay blend, rather than generating grain procedurally (FilmGrainPass,
 * which this replaces) — a real emulsion scan carries texture/colour
 * variation no per-pixel hash convincingly reproduces. The highlight
 * falloff (see the shader's comment) is the other half of why this reads
 * as film rather than a filter: real grain visibility tracks silver
 * density, which thins out through the highlights, so a flat-strength
 * overlay everywhere — even with the right texture — would still read as
 * synthetic.
 *
 * A `Pass`, not an `Effect`, for the same reason FilmGrainPass was: needs
 * its own texture uniform wired in independent of the composer's own
 * per-effect uniform plumbing, matching this project's other hand-rolled
 * full-screen passes.
 */
export class TextureGrainPass extends Pass {
  private readonly material: THREE.ShaderMaterial

  constructor({
    grainTexture,
    opacity = 0.8,
    grainScale = 1,
    highlightFalloffStart = 0.55,
    highlightFalloffEnd = 0.95,
  }: TextureGrainPassOptions) {
    super('TextureGrainPass')

    this.material = new THREE.ShaderMaterial({
      uniforms: {
        tDiffuse: { value: null },
        tGrain: { value: grainTexture },
        opacity: { value: opacity },
        grainScale: { value: grainScale },
        highlightFalloffStart: { value: highlightFalloffStart },
        highlightFalloffEnd: { value: highlightFalloffEnd },
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
