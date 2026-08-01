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
      vec2 offset = vec2(cos(angle), sin(angle)) * texelSize * 7.0;
      vec3 sample3 = texture2D(tDiffuse, vUv + offset).rgb;
      float weight = max(0.0, localLuminance(sample3) - threshold);
      bloomSum += sample3 * weight;
      totalWeight += weight;
    }

    if (totalWeight > 0.0001) {
      vec3 halation = (bloomSum / totalWeight) * tint;
      color += halation * totalWeight * intensity;
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
}

/**
 * Cheap halation: a warm-tinted bleed around only the brightest, already-
 * blooming highlights — real film halation comes from light scattering back
 * through the emulsion's red-sensitive layer, which is why it reads
 * specifically warm/red rather than a colour-neutral glow the way Bloom's
 * own soft/highlight passes (PostProcessing.tsx) already are. A plain
 * `Pass` (not `Effect`) purely so it can carry its own `texelSize` uniform
 * the same way FilmGrainPass/HalationPass's siblings do.
 */
export class HalationPass extends Pass {
  private readonly material: THREE.ShaderMaterial

  constructor({ threshold = 0.82, intensity = 0.18, tint = [1, 0.45, 0.25] }: HalationPassOptions = {}) {
    super('HalationPass')

    this.material = new THREE.ShaderMaterial({
      uniforms: {
        tDiffuse: { value: null },
        texelSize: { value: new THREE.Vector2(1, 1) },
        threshold: { value: threshold },
        intensity: { value: intensity },
        tint: { value: new THREE.Vector3(...tint) },
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
