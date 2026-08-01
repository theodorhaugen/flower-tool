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
  uniform float uSeed;
  uniform float uOpacity;
  varying vec2 vUv;

  float hash21(vec2 p, float seed) {
    // seed is passed in as a whole number (uSeed = renderSeed % 1000), and
    // fract(x + n) == fract(x) for any exact integer n — a bare "+ seed"
    // here would make the whole pattern seed-*independent*, the opposite
    // of the point. Scaling by an irrational-ish constant first is what
    // actually gives an integer seed a meaningful fractional contribution.
    p = fract(p * vec2(123.34, 345.45) + seed * 0.7639174);
    p += dot(p, p + 34.345);
    return fract(p.x * p.y);
  }

  void main() {
    vec4 texel = texture2D(tDiffuse, vUv);
    vec3 color = texel.rgb;

    // Sparse dust specks: a coarse grid where only a handful of cells host
    // a speck at all, each at a per-cell random offset/size — fixed for
    // the whole still (keyed off uSeed, not time), the way real dust on
    // a lens or scan doesn't move frame to frame within one exposure.
    vec2 grid = vUv * 55.0;
    vec2 cell = floor(grid);
    float cellHash = hash21(cell, uSeed);
    vec2 speckCenter = (cell + vec2(hash21(cell + 11.0, uSeed), hash21(cell + 23.0, uSeed))) / 55.0;
    float speckSize = 0.0007 + hash21(cell + 3.0, uSeed) * 0.002;
    float speckPresent = step(0.982, cellHash);
    float speck = speckPresent * smoothstep(speckSize, 0.0, distance(vUv, speckCenter));
    // Dust reads as small dark/matte specks, not bright ones.
    color -= speck * uOpacity * 1.6;

    // One or two long, faint, slightly slanted scratch lines — a fixed
    // near-vertical abrasion mark, the kind a real scan/print/lens
    // occasionally shows, rather than an obviously-CG-clean frame.
    float scratchX = 0.12 + hash21(vec2(1.0, 2.0), uSeed) * 0.76;
    float scratchSlant = (hash21(vec2(3.0, 4.0), uSeed) - 0.5) * 0.05;
    float lineDist = abs(vUv.x - (scratchX + scratchSlant * vUv.y));
    float scratch = smoothstep(0.0007, 0.0, lineDist);
    color += scratch * uOpacity * 0.6;

    gl_FragColor = vec4(color, texel.a);
  }
`

export interface DustScratchesPassOptions {
  /** Distinguishes one still's fixed dust/scratch pattern from another — the active render's generative seed, not a runtime constant. */
  seed?: number
  /** Overall strength — kept subtle; this should be felt, not noticed. */
  opacity?: number
}

/**
 * A fixed (not per-frame-animated) speckled-dust + scratch overlay — the
 * one kind of analogue imperfection nothing else in the pipeline produces:
 * FilmGrainPass reseeds every settle frame (it's meant to look alive, like
 * emulsion grain does), but real dust on a lens or scratches on a scan
 * don't move during one exposure, so this reads `uSeed` from the render's
 * own generative seed once at construction rather than `virtualClock.time`.
 * A plain `Pass` for the same reason FilmGrainPass/LongExposureBlurPass are
 * — a custom uniform this project's `Effect`-based effects don't need.
 */
export class DustScratchesPass extends Pass {
  private readonly material: THREE.ShaderMaterial

  constructor({ seed = 0, opacity = 0.5 }: DustScratchesPassOptions = {}) {
    super('DustScratchesPass')

    this.material = new THREE.ShaderMaterial({
      uniforms: {
        tDiffuse: { value: null },
        uSeed: { value: seed % 1000 },
        uOpacity: { value: opacity },
      },
      vertexShader: VERTEX_SHADER,
      fragmentShader: FRAGMENT_SHADER,
      depthTest: false,
      depthWrite: false,
    })

    this.fullscreenMaterial = this.material
  }

  render(renderer: THREE.WebGLRenderer, inputBuffer: THREE.WebGLRenderTarget | null, outputBuffer: THREE.WebGLRenderTarget | null): void {
    if (!inputBuffer) return

    this.material.uniforms.tDiffuse.value = inputBuffer.texture
    renderer.setRenderTarget(this.renderToScreen ? null : outputBuffer)
    renderer.render(this.scene, this.camera)
  }
}
