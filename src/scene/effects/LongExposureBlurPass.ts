import { Pass } from 'postprocessing'
import * as THREE from 'three'
import { CAMERA_CONFIG } from '../camera/config'
import { virtualClock } from '../shared/virtualClock'

const VERTEX_SHADER = `
  varying vec2 vUv;
  void main() {
    vUv = position.xy * 0.5 + 0.5;
    gl_Position = vec4(position.xy, 1.0, 1.0);
  }
`

// Per-tap count for the within-frame streak sample below — a compile-time
// constant since GLSL loop bounds need to be. Needs to be fairly high (not
// a cheap 4-8 tap box blur): too few taps sampled across a wide step lands
// on the scene's own fine periodic detail (grass jitter, film-grain-scale
// noise) at a coarse, evenly-spaced interval, aliasing into a comb/moiré
// banding pattern instead of a smooth streak.
const STREAK_TAPS = 20

const BLEND_FRAGMENT_SHADER = `
  uniform sampler2D tOld;
  uniform sampler2D tNew;
  uniform float decay;
  // Screen-space UV displacement the camera's sweep covered *during this
  // one rendered frame* (see LongExposureBlurPass.render()'s docstring) — pre-
  // streaking tNew along it before the temporal blend is what keeps thin,
  // high-frequency geometry (grass blades) from diluting into an invisible
  // wash: a bare temporal accumulation only ever sees each frame's blade at
  // one discrete, barely-overlapping position, so it averages towards
  // whatever's *behind* it instead of a visible streak. Sampling continuously
  // along the known motion vector within a single already-sharp frame gives
  // every accumulated sample its own soft smear instead of a lone thin line,
  // which is what a real shutter integrating continuous motion would do.
  uniform vec2 blurStep;
  varying vec2 vUv;

  vec4 streakedSample(sampler2D tex, vec2 uv, vec2 step) {
    vec4 sum = vec4(0.0);
    for (int i = 0; i < ${STREAK_TAPS}; i++) {
      float t = float(i) / float(${STREAK_TAPS - 1}) - 0.5;
      sum += texture2D(tex, uv + step * t);
    }
    return sum / float(${STREAK_TAPS});
  }

  void main() {
    vec4 texelOld = texture2D(tOld, vUv);
    vec4 texelNew = streakedSample(tNew, vUv, blurStep);
    // A plain weighted blend, not a max()-based ghost trail (the classic
    // "afterimage" shader) — the whole frame drifts together here, from
    // camera movement, rather than isolated bright objects moving against a
    // still background, so a soft average reads as shutter integration
    // instead of a light-trail/streak effect.
    //
    // decay == 0.0 is handled as a true hard replacement (texelNew alone,
    // never touching texelOld) rather than folded into the mix() below —
    // mix(x, y, 0.0) is mathematically x, but if y happens to be NaN/Inf
    // (an upstream HDR overflow — see HalationPass.ts/
    // LensOpticsDepthOfFieldEffect.ts, both amplifiers this pass sits
    // downstream of), y * 0.0 is NaN, not 0, so the "hard cut fully
    // replaces the previous settle's history" guarantee this pass's own
    // class docstring describes would silently fail to clear a poisoned
    // accumulation buffer — it would instead corrupt every frame from
    // then on, surviving reseeds indefinitely instead of clearing on the
    // very next one.
    gl_FragColor = decay > 0.0 ? mix(texelNew, texelOld, decay) : texelNew;
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
  /** The per-seed/Leva-overridable `motionBlurStrength` (see shared/generative.ts, Leva's Camera > Blur Length) — the same value CameraSweep.tsx scales its sweep amplitude by, so this pass's own yaw/pitch-delta estimate (used for the within-frame streak, see `render()`) tracks whatever the sweep is actually doing. 1 = as tuned. */
  movementMultiplier?: number
  /** Per-seed `motionBlurDirectionAngle` (see shared/generative.ts) — same angle CameraSweep.tsx blends its yaw/pitch weights by, so this pass estimates a streak in the same direction the camera is actually sweeping instead of always assuming a horizontal pan. Radians, 0 = pure yaw. */
  directionAngle?: number
}

const DEFAULT_HALF_LIFE_SECONDS = 0.12

// Mirrors CameraSweep.tsx's own constants — that component is the dominant
// source of the sweep this pass is estimating, so the estimate has to use
// the exact same amplitude/frequency it does, not an independent guess.
// Roll isn't modelled (fixed and small — a texture wobble, not the sweep's
// main direction) but yaw *and* pitch both are now, weighted by
// `directionAngle` the same way CameraSweep.tsx weights its own rotateX/Y,
// since that angle is no longer fixed to "always yaw" — see
// camera/config.ts's `sweep` docstring.
const BASE_ROTATION_AMPLITUDE_RAD = THREE.MathUtils.degToRad(CAMERA_CONFIG.sweep.rotationAmplitudeDeg)
// Same backstop CameraSweep.tsx clamps its actual sweep to — see
// camera/config.ts's `maxRotationAmplitudeDeg` docstring for why. Keeping
// this estimate un-clamped while the real sweep is clamped would desync
// the two right at the extreme end, so it's applied here too.
const MAX_ROTATION_AMPLITUDE_RAD = THREE.MathUtils.degToRad(CAMERA_CONFIG.sweep.maxRotationAmplitudeDeg)
const ANGULAR_FREQUENCY = (Math.PI * 2) / CAMERA_CONFIG.sweep.periodSeconds
const VERTICAL_FOV_RAD = THREE.MathUtils.degToRad(CAMERA_CONFIG.fov)
/**
 * The full per-frame yaw delta is the physically "correct" streak length —
 * a real continuous exposure would smear *everything* by exactly that much
 * — but applying that in full reads as an across-the-board blur increase,
 * not just a grass fix, since the existing multi-frame temporal
 * accumulation (below) already does most of the work of building up a
 * trail for larger features. This only needs to be large enough to close
 * the *gap* a thin blade would otherwise fall entirely into between
 * discrete accumulated frames, not to re-derive the whole exposure from
 * scratch, so it's dialled back well under 1.
 *
 * Raised from 0.08 — at that strength the within-frame streak was smaller
 * than a grass blade's own width most frames, so it closed the gap between
 * accumulated samples (no more *aliasing*) without actually leaving a
 * visible trail behind each blade — grass still read crisp/static while
 * bloom highlights streaked. This is still well under the "full physically
 * correct" smear the comment above warns against, just enough that thin
 * geometry visibly drags rather than merely avoiding a comb artifact.
 */
const STREAK_STRENGTH = 0.22
/** Caps the within-frame streak to a sane fraction of the screen — a guard against a single unusually large virtual-time step (e.g. a slow real frame) producing an absurdly long smear rather than a subtle one. Raised alongside `STREAK_STRENGTH` so the cap isn't clipping the strengthened streak back down to the old, barely-visible length. */
const MAX_STREAK_UV = 0.045

function clampedRotationAmplitude(movementMultiplier: number): number {
  return Math.min(BASE_ROTATION_AMPLITUDE_RAD * movementMultiplier, MAX_ROTATION_AMPLITUDE_RAD)
}

function yawAt(virtualTime: number, movementMultiplier: number, directionAngle: number): number {
  return clampedRotationAmplitude(movementMultiplier) * Math.cos(directionAngle) * Math.sin(virtualTime * ANGULAR_FREQUENCY)
}

// Same phase as yawAt (see CameraSweep.tsx's docstring on rotateX/Y for why
// pitch no longer carries its own +0.6 offset) — both this estimate and the
// real sweep need to trace the same straight line for the streak to match
// what the camera is actually doing.
function pitchAt(virtualTime: number, movementMultiplier: number, directionAngle: number): number {
  return clampedRotationAmplitude(movementMultiplier) * Math.sin(directionAngle) * Math.sin(virtualTime * ANGULAR_FREQUENCY)
}

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
  private readonly movementMultiplier: number
  private readonly directionAngle: number
  private lastVirtualTime = 0
  /** Tracked from `setSize()` purely to convert the yaw/pitch estimate below into a UV displacement — see `render()`. */
  private aspect = 1

  constructor({
    halfLifeSeconds = DEFAULT_HALF_LIFE_SECONDS,
    movementMultiplier = 1,
    directionAngle = 0,
  }: LongExposureBlurPassOptions = {}) {
    super('LongExposureBlurPass')

    this.halfLifeSeconds = halfLifeSeconds
    this.movementMultiplier = movementMultiplier
    this.directionAngle = directionAngle

    const targetOptions = { type: THREE.HalfFloatType, depthBuffer: false, stencilBuffer: false }
    this.accumulated = new THREE.WebGLRenderTarget(1, 1, targetOptions)
    this.composited = new THREE.WebGLRenderTarget(1, 1, targetOptions)

    this.blendMaterial = new THREE.ShaderMaterial({
      uniforms: {
        tOld: { value: null },
        tNew: { value: null },
        decay: { value: 0 },
        blurStep: { value: new THREE.Vector2() },
      },
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
    this.aspect = height > 0 ? width / height : 1
  }

  render(
    renderer: THREE.WebGLRenderer,
    inputBuffer: THREE.WebGLRenderTarget | null,
    outputBuffer: THREE.WebGLRenderTarget | null,
  ): void {
    if (!inputBuffer) return

    const previousVirtualTime = this.lastVirtualTime
    const elapsed = virtualClock.time - previousVirtualTime
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
    // docstring). elapsed > 0 is the normal mid-burst case. Same guard for
    // the within-frame streak below: `previousVirtualTime` is meaningless
    // across that discontinuous jump, so there's no valid yaw/pitch delta to
    // estimate — leave the incoming frame unstreaked rather than smearing
    // it across a jump that was never actually swept through.
    const decay = elapsed > 0 ? THREE.MathUtils.clamp(Math.pow(0.5, elapsed / this.halfLifeSeconds), 0, 1) : 0

    // Estimates how far the camera's own sweep panned/tilted *during this
    // one rendered frame* (not the whole burst) and converts that yaw/pitch
    // delta into a screen-space UV distance, so the blend shader can
    // pre-streak the incoming frame along it before folding it into the
    // accumulated history — see BLEND_FRAGMENT_SHADER's docstring for why
    // that's what keeps thin geometry from diluting into invisibility under
    // the temporal accumulation below. A small-angle tan()-based mapping
    // from radians to UV fraction of the relevant FOV axis; clamped since a
    // single unusually large virtual-time step (a slow real frame) shouldn't
    // produce a runaway streak.
    let blurStepU = 0
    let blurStepV = 0
    if (elapsed > 0) {
      const deltaYaw = yawAt(virtualClock.time, this.movementMultiplier, this.directionAngle) - yawAt(previousVirtualTime, this.movementMultiplier, this.directionAngle)
      const deltaPitch =
        pitchAt(virtualClock.time, this.movementMultiplier, this.directionAngle) - pitchAt(previousVirtualTime, this.movementMultiplier, this.directionAngle)
      const horizontalFovRad = 2 * Math.atan(Math.tan(VERTICAL_FOV_RAD / 2) * this.aspect)
      blurStepU = THREE.MathUtils.clamp((deltaYaw * STREAK_STRENGTH) / horizontalFovRad, -MAX_STREAK_UV, MAX_STREAK_UV)
      blurStepV = THREE.MathUtils.clamp((deltaPitch * STREAK_STRENGTH) / VERTICAL_FOV_RAD, -MAX_STREAK_UV, MAX_STREAK_UV)
    }

    this.blendMaterial.uniforms.decay.value = decay
    this.blendMaterial.uniforms.tOld.value = this.accumulated.texture
    this.blendMaterial.uniforms.tNew.value = inputBuffer.texture
    this.blendMaterial.uniforms.blurStep.value.set(blurStepU, blurStepV)
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
