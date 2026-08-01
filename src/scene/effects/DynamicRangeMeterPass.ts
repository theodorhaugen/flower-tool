import { Pass } from 'postprocessing'
import * as THREE from 'three'
import { dynamicRangeMeter } from './dynamicRangeMeter'

const VERTEX_SHADER = `
  varying vec2 vUv;
  void main() {
    vUv = position.xy * 0.5 + 0.5;
    gl_Position = vec4(position.xy, 1.0, 1.0);
  }
`

const FRAGMENT_SHADER = `
  uniform sampler2D tDiffuse;
  varying vec2 vUv;
  void main() {
    gl_FragColor = texture2D(tDiffuse, vUv);
  }
`

/** Fixed pixel budget per measurement, not "every pixel" — keeps the JS-side aggregation cost flat regardless of render resolution/devicePixelRatio. */
const SAMPLE_BUDGET = 4000

/** How many standard deviations out from the mean the stretch reaches — see the class docstring for why this, not the frame's literal min/max. */
const CLIP_SIGMA = 2.2

/** Measure only every Nth frame — `readRenderTargetPixels` is a real GPU→CPU sync point, and this only needs to track a slowly-converging average, not react every single frame. */
const MEASURE_EVERY_N_FRAMES = 3

/** How far dynamicRangeMeter.{blackPoint,whitePoint} move towards each new measurement, 0-1 per *measured* frame (not every frame, since measurement itself is throttled above). */
const SMOOTHING = 0.35

function relLuminance(r: number, g: number, b: number): number {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

/**
 * Reads back one RGBA pixel buffer for `inputBuffer`, normalized to real
 * 0-1ish float values regardless of the render target's actual storage
 * type. Matters because this project's composer buffers are `HalfFloatType`
 * (this pipeline stays HDR-ish, linear, right up to ToneMapping — see
 * PostProcessing.tsx), not the `UnsignedByteType` a naive `Uint8Array` read
 * would assume; reading half-float data into the wrong typed array doesn't
 * throw in JS, it just silently reads garbage (a real bug this went through
 * once already — readPixels throws WebGL's own INVALID_OPERATION on a type
 * mismatch, which console-only surfaces as a warning, not a hard failure,
 * so it's easy to miss without actually checking for it).
 */
function readNormalizedPixels(
  renderer: THREE.WebGLRenderer,
  target: THREE.WebGLRenderTarget,
  width: number,
  height: number,
): { get: (index: number) => number } {
  const count = width * height * 4
  const type = target.texture.type

  if (type === THREE.FloatType) {
    const buffer = new Float32Array(count)
    renderer.readRenderTargetPixels(target, 0, 0, width, height, buffer)
    return { get: (i) => buffer[i] }
  }

  if (type === THREE.HalfFloatType) {
    const buffer = new Uint16Array(count)
    renderer.readRenderTargetPixels(target, 0, 0, width, height, buffer)
    return { get: (i) => THREE.DataUtils.fromHalfFloat(buffer[i]) }
  }

  const buffer = new Uint8Array(count)
  renderer.readRenderTargetPixels(target, 0, 0, width, height, buffer)
  return { get: (i) => buffer[i] / 255 }
}

/**
 * Passthrough — this pass never changes a single pixel. Its entire purpose
 * is the *side effect*: reading back the actual composited frame (a real
 * GPU→CPU sync, which is why it's throttled and samples a fixed pixel
 * budget rather than the full buffer) to measure the mean and spread of its
 * luminance, then writing a corrective black/white point to
 * dynamicRangeMeter.ts for PaletteGradePass (first in the pipeline, see
 * PostProcessing.tsx) to apply on the next frame as a levels stretch — the
 * mechanism behind a render's tonal range always pulling back towards real
 * shadows/highlights, regardless of how flat or blown-out this particular
 * seed/palette/lighting combination would otherwise land on its own.
 *
 * Deliberately last in the pipeline (measures the true final image, grain
 * and all) even though the correction it feeds applies at the very start —
 * that one-frame lag is the point, see dynamicRangeMeter.ts.
 *
 * Uses mean ± `CLIP_SIGMA` standard deviations rather than the frame's
 * literal min/max — a single hot specular pixel or one dark crevice would
 * otherwise pin the whole stretch off one outlier texel; a percentile-ish
 * spread around the mean is what real "auto levels"/"auto contrast" tools
 * use for exactly this reason.
 */
export class DynamicRangeMeterPass extends Pass {
  private readonly material: THREE.ShaderMaterial
  private frameCount = 0

  constructor() {
    super('DynamicRangeMeterPass')

    this.material = new THREE.ShaderMaterial({
      uniforms: { tDiffuse: { value: null } },
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

    this.frameCount++
    if (this.frameCount % MEASURE_EVERY_N_FRAMES === 0) {
      this.measure(renderer, inputBuffer)
    }

    this.material.uniforms.tDiffuse.value = inputBuffer.texture
    renderer.setRenderTarget(this.renderToScreen ? null : outputBuffer)
    renderer.render(this.scene, this.camera)
  }

  private measure(renderer: THREE.WebGLRenderer, inputBuffer: THREE.WebGLRenderTarget): void {
    const { width, height } = inputBuffer
    if (width <= 0 || height <= 0) return

    const pixels = readNormalizedPixels(renderer, inputBuffer, width, height)

    const totalPixels = width * height
    const stride = Math.max(1, Math.floor(totalPixels / SAMPLE_BUDGET))

    let sum = 0
    let sumSq = 0
    let sampleCount = 0
    for (let i = 0; i < totalPixels; i += stride) {
      const offset = i * 4
      const l = relLuminance(pixels.get(offset), pixels.get(offset + 1), pixels.get(offset + 2))
      if (!Number.isFinite(l)) continue
      sum += l
      sumSq += l * l
      sampleCount++
    }
    if (sampleCount === 0) return

    const mean = sum / sampleCount
    const variance = Math.max(sumSq / sampleCount - mean * mean, 0)
    const stdDev = Math.sqrt(variance)

    const targetBlack = THREE.MathUtils.clamp(mean - CLIP_SIGMA * stdDev, 0, 0.4)
    const targetWhite = THREE.MathUtils.clamp(mean + CLIP_SIGMA * stdDev, 0.6, 1)

    dynamicRangeMeter.blackPoint = THREE.MathUtils.lerp(dynamicRangeMeter.blackPoint, targetBlack, SMOOTHING)
    dynamicRangeMeter.whitePoint = THREE.MathUtils.lerp(dynamicRangeMeter.whitePoint, targetWhite, SMOOTHING)
  }
}
