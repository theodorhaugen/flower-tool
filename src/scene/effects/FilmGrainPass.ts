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
  uniform float time;
  uniform float opacity;
  uniform float grainSize;
  uniform vec2 resolution;
  varying vec2 vUv;

  // A cell-quantised hash rather than per-pixel noise — see grainSize below
  // for why — reseeded by time each frame so it flickers like a real film
  // scan instead of sitting as a static screen-door pattern.
  float hash13(vec3 p) {
    p = fract(p * vec3(0.1031, 0.1030, 0.0973));
    p += dot(p, p.yzx + 33.33);
    return fract((p.x + p.y) * p.z);
  }

  void main() {
    vec4 texel = texture2D(tDiffuse, vUv);

    // Quantising UV into cells of grainSize screen pixels before hashing is
    // what gives grain an actual visible size instead of reading as 1px
    // sensor noise — real emulsion grain clumps into a few pixels at
    // typical viewing resolutions, it isn't single-pixel-fine.
    vec2 cell = floor(vUv * resolution / max(grainSize, 0.5));
    float n = hash13(vec3(cell, time)) * 2.0 - 1.0;

    // Premultiplied by the pixel's own colour, so grain density fades with
    // it (deep shadows/saturated colour show less absolute grain than
    // midtones) rather than sitting at a uniform strength over everything.
    vec3 color = texel.rgb + texel.rgb * n * opacity;

    gl_FragColor = vec4(color, texel.a);
  }
`

export interface FilmGrainPassOptions {
  /** Grain strength — how far each grain cell pushes the underlying colour up/down. */
  opacity?: number
  /** Grain cell width, in screen pixels. */
  grainSize?: number
}

/**
 * Custom film-grain pass rather than @react-three/postprocessing's `Noise`
 * effect: that effect hashes per-pixel (screen-resolution-fine noise, which
 * reads as digital sensor noise, not emulsion grain) and has no size
 * control. This adds the one thing that actually makes grain look like
 * film — a `grainSize` texel-quantisation step — while keeping the same
 * premultiply-by-colour fade the previous effect had.
 *
 * A `Pass`, not an `Effect`, purely so `time` can accumulate real elapsed
 * seconds via the composer-supplied `deltaTime` the same way
 * AtmosphericHazeEffect/LongExposureBlurPass do — the postprocessing
 * `Effect` model would need the same custom-uniform-update wiring anyway,
 * and this keeps the pattern consistent with this project's other
 * hand-rolled full-screen passes.
 */
export class FilmGrainPass extends Pass {
  private readonly material: THREE.ShaderMaterial
  private time = 0

  constructor({ opacity = 0.16, grainSize = 1.6 }: FilmGrainPassOptions = {}) {
    super('FilmGrainPass')

    this.material = new THREE.ShaderMaterial({
      uniforms: {
        tDiffuse: { value: null },
        time: { value: 0 },
        opacity: { value: opacity },
        grainSize: { value: grainSize },
        resolution: { value: new THREE.Vector2(1, 1) },
      },
      vertexShader: VERTEX_SHADER,
      fragmentShader: FRAGMENT_SHADER,
      depthTest: false,
      depthWrite: false,
    })

    this.fullscreenMaterial = this.material
  }

  setSize(width: number, height: number): void {
    this.material.uniforms.resolution.value.set(width, height)
  }

  render(
    renderer: THREE.WebGLRenderer,
    inputBuffer: THREE.WebGLRenderTarget | null,
    outputBuffer: THREE.WebGLRenderTarget | null,
    deltaTime?: number,
  ): void {
    if (!inputBuffer) return

    this.time += deltaTime ?? 1 / 60
    this.material.uniforms.time.value = this.time
    this.material.uniforms.tDiffuse.value = inputBuffer.texture
    renderer.setRenderTarget(this.renderToScreen ? null : outputBuffer)
    renderer.render(this.scene, this.camera)
  }
}
