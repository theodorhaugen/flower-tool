import { Pass } from 'postprocessing'
import * as THREE from 'three'
import { virtualClock } from '../shared/virtualClock'

const VERTEX_SHADER = `
  varying vec2 vUv;
  void main() {
    vUv = position.xy * 0.5 + 0.5;
    gl_Position = vec4(position.xy, 1.0, 1.0);
  }
`

const BLEND_FRAGMENT_SHADER = `
  uniform sampler2D tOld;
  uniform sampler2D tNew;
  uniform float decay;
  varying vec2 vUv;
  void main() {
    vec4 texelOld = texture2D(tOld, vUv);
    vec4 texelNew = texture2D(tNew, vUv);
    // A plain weighted blend, not a max()-based ghost trail (the classic
    // "afterimage" shader) — the whole frame drifts together here, from
    // camera movement, rather than isolated bright objects moving against a
    // still background, so a soft average reads as shutter integration
    // instead of a light-trail/streak effect.
    gl_FragColor = mix(texelNew, texelOld, decay);
  }
`

const COPY_FRAGMENT_SHADER = `
  uniform sampler2D tDiffuse;
  varying vec2 vUv;
  void main() {
    gl_FragColor = texture2D(tDiffuse, vUv);
  }
`

export interface LongExposureBlurPassOptions {
  /**
   * How long the blended history takes to fade to half strength, in
   * seconds. Framerate-independent — the decay is computed from elapsed
   * *virtual* time between renders (see the class docstring), not a fixed
   * per-frame constant, so the effect reads the same regardless of how
   * many real frames a given virtual-time step happened to take.
   */
  halfLifeSeconds?: number
}

const DEFAULT_HALF_LIFE_SECONDS = 0.12

/**
 * A cheap, screen-space simulation of an intentional-camera-movement (ICM)
 * long exposure: blends each frame with a decaying accumulation of recent
 * frames, so continuous camera movement (CameraSweep's wide pan, plus
 * HandheldDrift's fine tremor and any user orbit) smears the *whole* image
 * together into directional streaks rather than streaking individual moving
 * objects. There's no per-object velocity buffer here — that's exactly why
 * it doesn't read as typical "digital" motion blur.
 *
 * postprocessing's `Effect` model composes fragment shaders into a single
 * pass and has no concept of "last frame's render," so this needs to be a
 * `Pass` with its own persistent accumulation buffer — the same two-buffer
 * ping-pong technique three.js's own AfterimagePass uses (composite into a
 * fresh target while reading the previous one, then copy that composite to
 * the real output and swap), but blending with a plain `mix()` instead of
 * `max()` — see the fragment shader for why.
 *
 * Reads `virtualClock.time` (shared/virtualClock.ts) rather than the
 * composer-supplied real `deltaTime` — this is the one effect that
 * actually needs a *delta*, not just an absolute time, since it's doing
 * temporal accumulation, so it tracks its own `lastVirtualTime` and
 * derives elapsed virtual time from that each render:
 *
 * - Zero elapsed time (virtual time hasn't advanced since the last render
 *   — an orbit-drag-triggered render-on-demand tick while settled) means
 *   nothing moved, so there's nothing to motion-blur: this bypasses the
 *   blend entirely and shows the fresh input straight through, leaving
 *   the accumulated history untouched. Motion blur is inherently a
 *   property of the camera moving *during* the exposure; a static
 *   viewpoint change (orbiting to inspect the same settled frame from
 *   elsewhere) has no motion to blur, so a sharp view is the physically
 *   correct result here, not a bug.
 * - Negative elapsed time (SettleDriver.tsx just jumped `virtualClock.time`
 *   backwards/elsewhere to start a fresh settle burst — a reseed, a
 *   parameter tweak, or an explicit reroll) is treated as a hard cut: the
 *   decay formula below only applies for forward time, so this instead
 *   snaps decay to 0, fully replacing whatever the previous settle left
 *   in the accumulation buffer instead of blending into it. Without this,
 *   the first frame or two of a new settle would ghost the *previous*
 *   seed/look's streak into the new one.
 * - Positive elapsed time is the normal case (mid-settle-burst): the usual
 *   exponential half-life decay, exactly as before.
 */
export class LongExposureBlurPass extends Pass {
  private accumulated: THREE.WebGLRenderTarget
  private composited: THREE.WebGLRenderTarget
  private readonly blendMaterial: THREE.ShaderMaterial
  private readonly copyMaterial: THREE.ShaderMaterial
  private halfLifeSeconds: number
  private lastVirtualTime = 0

  constructor({ halfLifeSeconds = DEFAULT_HALF_LIFE_SECONDS }: LongExposureBlurPassOptions = {}) {
    super('LongExposureBlurPass')

    this.halfLifeSeconds = halfLifeSeconds

    const targetOptions = { type: THREE.HalfFloatType, depthBuffer: false, stencilBuffer: false }
    this.accumulated = new THREE.WebGLRenderTarget(1, 1, targetOptions)
    this.composited = new THREE.WebGLRenderTarget(1, 1, targetOptions)

    this.blendMaterial = new THREE.ShaderMaterial({
      uniforms: { tOld: { value: null }, tNew: { value: null }, decay: { value: 0 } },
      vertexShader: VERTEX_SHADER,
      fragmentShader: BLEND_FRAGMENT_SHADER,
      depthTest: false,
      depthWrite: false,
    })

    this.copyMaterial = new THREE.ShaderMaterial({
      uniforms: { tDiffuse: { value: null } },
      vertexShader: VERTEX_SHADER,
      fragmentShader: COPY_FRAGMENT_SHADER,
      depthTest: false,
      depthWrite: false,
    })
  }

  setSize(width: number, height: number): void {
    this.accumulated.setSize(width, height)
    this.composited.setSize(width, height)
  }

  render(
    renderer: THREE.WebGLRenderer,
    inputBuffer: THREE.WebGLRenderTarget | null,
    outputBuffer: THREE.WebGLRenderTarget | null,
  ): void {
    if (!inputBuffer) return

    const elapsed = virtualClock.time - this.lastVirtualTime
    this.lastVirtualTime = virtualClock.time

    if (elapsed === 0) {
      // Frozen (settled, orbit-triggered render-on-demand tick) — see the
      // class docstring for why a straight pass-through is correct here,
      // not a bug.
      this.copyMaterial.uniforms.tDiffuse.value = inputBuffer.texture
      this.fullscreenMaterial = this.copyMaterial
      renderer.setRenderTarget(this.renderToScreen ? null : outputBuffer)
      renderer.render(this.scene, this.camera)
      return
    }

    // elapsed < 0 means SettleDriver.tsx just started a fresh settle burst
    // from a new virtual time — decay=0 fully replaces the previous
    // settle's leftover history instead of blending into it (see the class
    // docstring). elapsed > 0 is the normal mid-burst case.
    const decay = elapsed > 0 ? THREE.MathUtils.clamp(Math.pow(0.5, elapsed / this.halfLifeSeconds), 0, 1) : 0

    this.blendMaterial.uniforms.decay.value = decay
    this.blendMaterial.uniforms.tOld.value = this.accumulated.texture
    this.blendMaterial.uniforms.tNew.value = inputBuffer.texture
    this.fullscreenMaterial = this.blendMaterial
    renderer.setRenderTarget(this.composited)
    renderer.render(this.scene, this.camera)

    this.copyMaterial.uniforms.tDiffuse.value = this.composited.texture
    this.fullscreenMaterial = this.copyMaterial
    renderer.setRenderTarget(this.renderToScreen ? null : outputBuffer)
    renderer.render(this.scene, this.camera)

    const swap = this.accumulated
    this.accumulated = this.composited
    this.composited = swap
  }
}
