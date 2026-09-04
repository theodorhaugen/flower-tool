import { Pass } from 'postprocessing'
import * as THREE from 'three'

const VERTEX_SHADER = `
  varying vec2 vUv;
  void main() {
    vUv = position.xy * 0.5 + 0.5;
    gl_Position = vec4(position.xy, 1.0, 1.0);
  }
`

const TAPS = 8

const FRAGMENT_SHADER = `
  uniform sampler2D tDiffuse;
  uniform vec2 texelSize;
  uniform float threshold;
  uniform float intensity;
  uniform vec3 tint;
  // How far the sampling ring reaches, in multiples of its base 7-texel
  // radius — see zoomGlowCompensation.ts's docstring. 1 = as tuned. This
  // ring is a fixed pixel radius by construction, with no idea what the
  // camera's FOV is doing; zooming in magnifies a highlight's own on-screen
  // size without this ring growing to match it, so relative to the subject
  // the bleed reads thinner the more zoomed in a render is. Scaling this by
  // the render's actual zoom factor keeps the ring's reach proportional to
  // the magnified subject instead of fixed to the frame.
  uniform float radiusScale;
  varying vec2 vUv;

  float localLuminance(vec3 c) {
    return dot(c, vec3(0.2126, 0.7152, 0.0722));
  }

  void main() {
    vec4 texel = texture2D(tDiffuse, vUv);
    vec3 color = texel.rgb;

    // A ring of samples around this pixel, weighted by how far each one is
    // above 'threshold' — the same "only genuinely blown-out highlights"
    // gating the highlight bloom pass uses, so this reads as that bloom's
    // own warm chromatic bleed (the way light scatters back through a real
    // emulsion layer) rather than an independent second glow.
    vec3 bloomSum = vec3(0.0);
    float totalWeight = 0.0;
    for (int i = 0; i < ${TAPS}; i++) {
      float angle = float(i) / float(${TAPS}) * 6.28318530718;
      vec2 offset = vec2(cos(angle), sin(angle)) * texelSize * 7.0 * radiusScale;
      vec3 sample3 = texture2D(tDiffuse, vUv + offset).rgb;
      float weight = max(0.0, localLuminance(sample3) - threshold);
      bloomSum += sample3 * weight;
      totalWeight += weight;
    }

    if (totalWeight > 0.0001) {
      // The average excess-brightness colour around this pixel, tinted and
      // scaled by how much of the ring is actually contributing (so a
      // pixel fully surrounded by blown-out neighbours bleeds harder than
      // one with only a sliver of bright ring) — but capped at the tap
      // count rather than left as a bare totalWeight multiplier. Bare
      // totalWeight cancels the /totalWeight average above algebraically
      // (color += bloomSum * tint * intensity), which grows unbounded
      // with scene brightness — reachable in half-float overflow at
      // extreme Colour-fold settings, which then poisons downstream
      // passes with Inf/NaN. Capped at TAPS this is a no-op at the tuned
      // operating point (per-tap weights of ~0.12-0.28 keep totalWeight
      // well under 8 in ordinary highlights) and only engages the ceiling
      // once the ring's average excess reaches roughly 1 stop over threshold.
      vec3 halation = (bloomSum / totalWeight) * tint;
      color += halation * min(totalWeight, float(${TAPS})) * intensity;
    }

    gl_FragColor = vec4(color, texel.a);
  }
`

export interface HalationPassOptions {
  /** Luminance a pixel needs to contribute to the bleed — matches PostProcessing's highlight-bloom threshold so this reads as that bloom's own chromatic fringe. */
  threshold?: number
  intensity?: number
  /** Warm red/orange bleed, the way light scattering back through a real emulsion layer skews warm. */
  tint?: readonly [number, number, number]
  /** Multiplies the sampling ring's base 7-texel radius — see zoomGlowCompensation.ts. 1 = as tuned. */
  radiusScale?: number
}

/**
 * Cheap halation: a warm-tinted bleed around only the brightest, already-
 * blooming highlights — real film halation comes from light scattering back
 * through the emulsion's red-sensitive layer, which is why it reads
 * specifically warm/red rather than a colour-neutral glow the way Bloom's
 * own soft/highlight passes (PostProcessing.tsx) already are. A plain
 * `Pass` (not `Effect`) purely so it can carry its own `texelSize` uniform
 * the same way TextureGrainPass/HalationPass's siblings do.
 */
export class HalationPass extends Pass {
  private readonly material: THREE.ShaderMaterial

  constructor({ threshold = 0.82, intensity = 0.18, tint = [1, 0.45, 0.25], radiusScale = 1 }: HalationPassOptions = {}) {
    super('HalationPass')

    this.material = new THREE.ShaderMaterial({
      uniforms: {
        tDiffuse: { value: null },
        texelSize: { value: new THREE.Vector2(1, 1) },
        threshold: { value: threshold },
        intensity: { value: intensity },
        tint: { value: new THREE.Vector3(...tint) },
        radiusScale: { value: radiusScale },
      },
      vertexShader: VERTEX_SHADER,
      fragmentShader: FRAGMENT_SHADER,
      depthTest: false,
      depthWrite: false,
    })

    this.fullscreenMaterial = this.material
  }

  setSize(width: number, height: number): void {
    this.material.uniforms.texelSize.value.set(1 / width, 1 / height)
  }

  render(renderer: THREE.WebGLRenderer, inputBuffer: THREE.WebGLRenderTarget | null, outputBuffer: THREE.WebGLRenderTarget | null): void {
    if (!inputBuffer) return

    this.material.uniforms.tDiffuse.value = inputBuffer.texture
    renderer.setRenderTarget(this.renderToScreen ? null : outputBuffer)
    renderer.render(this.scene, this.camera)
  }
}
