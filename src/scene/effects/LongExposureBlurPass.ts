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
//
// Raised from 20 alongside STREAK_STRENGTH/MAX_STREAK_UV below (1.1→2.2,
// 0.1→0.2) — doubling the streak's own max length without also widening the
// tap count doubles the *gap* between adjacent samples too, which is
// exactly the aliasing case this comment already warned about: a visible
// repeating diagonal banding across the whole frame, at the widened step's
// coarser interval. Scaled up to match (roughly doubled) so the worst-case
// spacing between taps lands back where it was before that widening.
const STREAK_TAPS = 40

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
    //
    // Deliberately no saturation/contrast massaging in here — this
    // shader's own output becomes *next frame's* \`tOld\`, so anything
    // beyond a plain blend compounds: verified directly that a per-frame
    // saturation boost living here, even a modest one, feeds back into
    // itself every subsequent frame decay keeps most of (which is most of
    // them — decay is close to 1 at normal 60fps step sizes relative to
    // \`halfLifeSeconds\`), and over the many real frames one settle burst
    // now runs (see SettleDriver.tsx's own per-frame virtual-time cap)
    // that compounds into an exponential blowout — thin HDR bloom
    // highlights clipping to solid, posterised red/green/yellow blocks
    // after tone-mapping, not a subtle vividness recovery. Any such
    // correction has to live downstream of this accumulation entirely —
    // see COPY_FRAGMENT_SHADER below, which only ever writes the
    // *displayed* frame, never feeds its own output back into itself.
    gl_FragColor = decay > 0.0 ? mix(texelNew, texelOld, decay) : texelNew;
  }
`

const COPY_FRAGMENT_SHADER = `
  uniform sampler2D tDiffuse;
  // How much this *render's* contrast/saturation recovery below should
  // kick in, 0-1 — fixed once per pass instance from this render's own
  // Blur Length setting (see the constructor's \`recoveryAmount\` for how
  // this is derived and why it's a per-render constant, not a per-frame
  // signal). Explicitly not derived from \`decay\`/the accumulation
  // buffer's own history here: this shader runs once per displayed frame
  // and its output is never read back in, so there's nothing to compound
  // regardless of what this value does — see BLEND_FRAGMENT_SHADER's
  // docstring for why that guarantee matters and where the *previous*
  // version of the saturation fix went wrong by living there instead of
  // here.
  uniform float recoveryAmount;
  varying vec2 vUv;

  // Standard luma-lerp saturation adjustment — \`amount\` 1 is unchanged,
  // above 1 boosts saturation, below 1 desaturates towards grey.
  vec3 saturate3(vec3 color, float amount) {
    float luma = dot(color, vec3(0.2126, 0.7152, 0.0722));
    return mix(vec3(luma), color, amount);
  }

  // Same pivot-around-mid-grey contrast punch PaletteGradePass.ts's own
  // \`contrast\` control uses, for the same reason it works there: a plain
  // linear pivot, not a filmic S-curve, is enough to read as "punchier"
  // without needing per-channel tone-curve tuning.
  vec3 contrastBoost(vec3 color, float amount) {
    return (color - 0.5) * amount + 0.5;
  }

  void main() {
    vec4 color = texture2D(tDiffuse, vUv);
    // Averaging (both BLEND_FRAGMENT_SHADER's within-frame streak tap sum
    // and its temporal blend against the accumulated history) doesn't just
    // dilute saturation — it's fundamentally a contrast-flattening
    // operation: a bloomed highlight sampled at one swept camera position
    // averages against whatever *duller* midtone sat there a moment
    // earlier/later in the sweep, and a deep shadow averages against
    // whatever was brighter nearby. The wider the sweep (higher Blur
    // Length), the further apart those blended positions are, so the more
    // the whole frame's dynamic range collapses towards a flat middle —
    // exactly the "loses its bloomed highlights/warm colour/deep shadow
    // character" complaint, and a much bigger effect than the saturation
    // dilution alone. Boosting contrast here, same safe display-only spot
    // as the saturation recovery below, claws a good deal of that punch
    // back without touching the actual directional smear this pass exists
    // to produce.
    color.rgb = contrastBoost(color.rgb, 1.0 + recoveryAmount * 0.5);
    // \`contrastBoost\` is an unclamped pivot around 0.5 — at high enough
    // \`recoveryAmount\` (near max Blur Length), any input under roughly 0.17
    // comes out negative, not just dark. This pass renders into a floating-
    // point intermediate target, not straight to the screen, so a negative
    // value doesn't clip to black right here — it survives into every
    // downstream pass (bloom, tone mapping, halation, grain, chromatic
    // aberration) that assumes non-negative colour, and whatever those do
    // with it only gets clamped to displayable range at the very end. That
    // cascade is what was actually producing the reported "large solid-black
    // patches" — clamping the low end back to 0 immediately, right where the
    // boost can push past it, keeps the recovery's intended effect (a
    // punchier, less washed-out image) without ever handing a negative
    // colour to a pass that has no idea what to do with one.
    color.rgb = max(color.rgb, 0.0);
    // Reboosting saturation on the *displayed* frame only (not the
    // accumulation buffer feeding this texture — see BLEND_FRAGMENT_SHADER)
    // recovers vividness thin, saturated detail otherwise loses under that
    // same averaging, proportionally to this render's own blur strength,
    // without the boost ever being applied twice to the same history.
    color.rgb = saturate3(color.rgb, 1.0 + recoveryAmount * 0.6);
    gl_FragColor = color;
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
  /**
   * The active render's actual vertical field of view, degrees (the
   * generative state's `fov` — CAMERA_CONFIG.fov by default, Leva's
   * Camera > Zoom-overridable — see MainCamera.tsx). Used only to convert
   * the yaw/pitch delta estimate below into a UV fraction (`render()`) — a
   * narrower FOV (more zoomed in) means the same angular delta covers a
   * *larger* fraction of the frame, so this has to track whatever
   * MainCamera.tsx is actually using, not a fixed constant, or the streak
   * would desync from the zoom level the moment it's no longer the default.
   */
  fov?: number
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
 * Raised from 0.08, then again from 0.22 — the accumulation blend above is
 * what does most of the work streaking *large* features (a flower cluster
 * shifts a real fraction of its own size across the settle burst's camera
 * sweep), but small/fine detail — a flower centre's dark disc, a petal's
 * own edge — shifts by only a few pixels over that same angular sweep,
 * nowhere near its own size, so it kept reading as crisp even at Blur
 * Length's max. This term is what actually reaches that detail: it's a
 * direct directional blur of *this one frame* before it ever joins the
 * accumulation, sized off the camera's instantaneous angular speed rather
 * than the swept range, so it scales with Blur Length independently of how
 * far the overall sweep is allowed to travel. Still well under the "full
 * physically correct" smear the comment above warns against — that's
 * measured in whole-frame terms, and this is scaled for small-feature
 * reach, not to redo the large-feature job the blend above already does.
 *
 * Raised again, from 1.1, alongside cutting `halfLifeSeconds` (effects/
 * config.ts) hard: shrinking the temporal accumulation's memory window
 * fixed the "blends genuinely different vantage points, erasing shape"
 * failure mode, but on its own that also thins out the overall blur *look*
 * this tool wants present on every render, never fully sharp. This term is
 * what carries that look forward instead — it's a same-frame directional
 * smear, so it can't erase shape the way blending distinct moments can,
 * only stretch what's already there along the sweep's own direction. Net
 * effect versus the old (0.7 half-life, 1.1 streak) pairing: still, or more,
 * visibly blurred, but blurred *as* a flower rather than blurred *into*
 * abstract noise.
 */
const STREAK_STRENGTH = 2.2
/** Caps the within-frame streak to a sane fraction of the screen — a guard against a single unusually large virtual-time step (e.g. a slow real frame) producing an absurdly long smear rather than a subtle one. Raised alongside `STREAK_STRENGTH` so the cap isn't clipping the strengthened streak back down to the old, barely-visible length. */
const MAX_STREAK_UV = 0.2

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
  private readonly verticalFovRad: number
  private lastVirtualTime = 0
  /** Tracked from `setSize()` purely to convert the yaw/pitch estimate below into a UV displacement — see `render()`. */
  private aspect = 1

  constructor({
    halfLifeSeconds = DEFAULT_HALF_LIFE_SECONDS,
    movementMultiplier = 1,
    directionAngle = 0,
    fov = CAMERA_CONFIG.fov,
  }: LongExposureBlurPassOptions = {}) {
    super('LongExposureBlurPass')

    this.halfLifeSeconds = halfLifeSeconds
    this.movementMultiplier = movementMultiplier
    this.directionAngle = directionAngle
    this.verticalFovRad = THREE.MathUtils.degToRad(fov)

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

    // How much this *render's* contrast/saturation recovery (see
    // COPY_FRAGMENT_SHADER) should kick in, 0-1 — fixed for this pass
    // instance's whole lifetime, deliberately *not* recomputed per frame
    // from the within-frame streak estimate below (`blurStepU`/`blurStepV`
    // in `render()`) the way an earlier version of this fix did. That
    // estimate is this *one frame's* instantaneous angular step, which at
    // any real frame rate fast enough to matter (measured directly: real
    // per-frame `elapsed` during a burst is typically 0.015-0.05s, not the
    // much larger step a slow/capped frame would take) stays small — under
    // 0.2 — even at Blur Length's maximum, regardless of how far the sweep
    // itself actually travels over the *whole* burst. Scaling the recovery
    // by it meant the boost barely engaged even at max Blur Length, which
    // is exactly backwards: the contrast/saturation *loss* this recovers is
    // a cumulative effect of the whole burst's accumulation blending frames
    // further apart, not of any single frame's own tiny step. This render's
    // actual swept amplitude versus its own hard ceiling
    // (`MAX_ROTATION_AMPLITUDE_RAD`) is what actually tracks how much
    // washing the whole burst does, so that ratio — not the per-frame
    // streak — is what the recovery below scales with.
    const recoveryAmount = clampedRotationAmplitude(movementMultiplier) / MAX_ROTATION_AMPLITUDE_RAD

    this.copyMaterial = new THREE.ShaderMaterial({
      uniforms: { tDiffuse: { value: null }, recoveryAmount: { value: recoveryAmount } },
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
      // not a bug. `recoveryAmount` is left as whatever the constructor set
      // it to (this render's fixed blur-strength recovery, not a per-frame
      // motion signal) — nothing moved *this frame*, but that doesn't change
      // how much this render's own accumulation has washed the image out.
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
    //
    // On a fresh-burst hard cut (elapsed < 0), `previousVirtualTime` is
    // leftover from the *previous* settle and meaningless as a streak
    // reference — but that doesn't mean this frame has no streak at all.
    // `virtualClock.burstStartTime` (set by SettleDriver.tsx whenever it
    // (re)starts a burst) is the actual virtual time this frame's own
    // step began from, so `virtualClock.time - burstStartTime` is this
    // frame's real elapsed virtual time within the new burst, exactly like
    // `elapsed` on every later frame — just computed against a different
    // reference point than `lastVirtualTime` tracks. Without this, the
    // burst's very first frame was a hard, unstreaked cut on top of having
    // zero accumulated history, so it read as fully tack-sharp; the
    // temporal accumulation below only ever dilutes that sharp frame's
    // *weight* towards zero (a matter of degree, never fully to zero by
    // capture time), which is disproportionately visible specifically on
    // thin/high-contrast geometry — a grass blade, a petal rim, a flower
    // centre's disc — as a faint but genuinely sharp double-image ghost,
    // even once its blended weight is down in the single digits. Giving
    // this frame a real streak of its own, same as every other frame gets,
    // fixes the actual cause instead of just shrinking its residual.
    const previousForStreak = elapsed > 0 ? previousVirtualTime : virtualClock.burstStartTime
    const deltaYaw = yawAt(virtualClock.time, this.movementMultiplier, this.directionAngle) - yawAt(previousForStreak, this.movementMultiplier, this.directionAngle)
    const deltaPitch =
      pitchAt(virtualClock.time, this.movementMultiplier, this.directionAngle) - pitchAt(previousForStreak, this.movementMultiplier, this.directionAngle)
    const horizontalFovRad = 2 * Math.atan(Math.tan(this.verticalFovRad / 2) * this.aspect)
    const blurStepU = THREE.MathUtils.clamp((deltaYaw * STREAK_STRENGTH) / horizontalFovRad, -MAX_STREAK_UV, MAX_STREAK_UV)
    const blurStepV = THREE.MathUtils.clamp((deltaPitch * STREAK_STRENGTH) / this.verticalFovRad, -MAX_STREAK_UV, MAX_STREAK_UV)

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
