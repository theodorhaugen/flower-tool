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
// coarser interval.
//
// Raised again, 40 → 64: doubling to 40 (matching the streak-length
// doubling exactly) reduced the banding but measurably didn't clear it —
// still visible, just fainter, on a real capture at max Blur Length. What's
// being aliased against isn't a single clean frequency (a texture tile, a
// grid), so there's no exact tap count that zeroes it out the way matching
// the *ratio* did for the first widening; it needs genuine oversampling
// margin instead. This loop runs once per pixel on the GPU each frame — a
// few dozen extra `texture2D` taps is negligible on real hardware, so
// erring high here costs real render time only in this sandbox's
// swiftshader software path, not in production.
const STREAK_TAPS = 64

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
  /** The per-seed/Leva-overridable `motionBlurStrength` (see shared/generative.ts, Leva's Camera > Blur Length) — used only for `recoveryAmount` (the contrast/saturation recovery in COPY_FRAGMENT_SHADER), *not* for the within-frame streak below (see `render()`'s docstring for why that's read from the real camera instead). 1 = as tuned. */
  movementMultiplier?: number
  /**
   * The actual scene camera (MainCamera.tsx) — read live each frame to
   * compute the within-frame streak directly from its real transform
   * rather than re-deriving CameraSweep's own sweep formula (see
   * `render()`'s docstring for why). Optional only so a pass can exist
   * before the camera is available for one tick; the streak is simply 0
   * until it's set.
   */
  camera?: THREE.Camera
}

const DEFAULT_HALF_LIFE_SECONDS = 0.12

// Used only for `recoveryAmount` below (how strong *this render's* Blur
// Length is, as a fraction of its own ceiling) — no longer for estimating
// the streak itself (see `render()`'s docstring for why that moved to
// reading the real camera transform instead).
const BASE_ROTATION_AMPLITUDE_RAD = THREE.MathUtils.degToRad(CAMERA_CONFIG.sweep.rotationAmplitudeDeg)
const MAX_ROTATION_AMPLITUDE_RAD = THREE.MathUtils.degToRad(CAMERA_CONFIG.sweep.maxRotationAmplitudeDeg)
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
/**
 * Caps the within-frame streak to a sane fraction of the screen — a guard
 * against a single unusually large real-world step (a slow/stalled frame,
 * or a burst-restart transition — see `render()`) producing an absurdly
 * long smear rather than a subtle one.
 *
 * Raised in steps (0.1 → 0.2 → 0.4) chasing a persistent diagonal banding
 * artifact that turned out to have nothing to do with this clamp at all —
 * see `render()`'s docstring for how the streak's own source was rewritten
 * from a formula-based estimate to reading the real camera transform,
 * which is what actually fixed it. Left at 0.4 since it's still a
 * reasonable outer bound for the *now-accurate* per-frame delta.
 */
const MAX_STREAK_UV = 0.4
/**
 * Effectively "at infinity" for the reference point `render()` reprojects
 * to estimate the streak — see its docstring. Large enough that any
 * *translation* between frames (HandheldDrift's position tremor, or a
 * user's orbit/dolly) contributes a negligible parallax shift to that
 * point (offset/distance, vanishing as distance grows), leaving only
 * *rotation* — matching this pass's original, deliberately narrower scope
 * (a translation-driven parallax smear was never part of the tuned look,
 * and introducing one now, however small, isn't a change to make
 * incidentally while fixing an unrelated bug).
 */
const STREAK_REFERENCE_DISTANCE = 100_000

function clampedRotationAmplitude(movementMultiplier: number): number {
  return Math.min(BASE_ROTATION_AMPLITUDE_RAD * movementMultiplier, MAX_ROTATION_AMPLITUDE_RAD)
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
 *
 * The within-frame streak (`render()`'s `blurStepU`/`blurStepV`, fed to
 * BLEND_FRAGMENT_SHADER's `streakedSample`) used to be estimated by
 * re-deriving CameraSweep.tsx's own sine-sweep formula independently inside
 * this class — duplicated amplitude/frequency/direction constants, kept
 * manually in sync. That missed HandheldDrift's tremor entirely (a
 * *second*, independent rotation source layered on top by a different
 * component, on different axes/frequencies) and any user orbit: the streak
 * smeared along the sweep's own direction only, while the actual rendered
 * frame-to-frame motion also included whatever those other sources did.
 * Diagnosed directly — disabling HandheldDrift on a render showing a
 * diagonal *crosshatch* (two intersecting sets of streaks, not one) left
 * only a single clean direction behind, confirming the second direction
 * was HandheldDrift's own uncompensated contribution.
 *
 * Now reads the real camera's transform each frame instead: reprojects one
 * fixed reference point (`STREAK_REFERENCE_DISTANCE` along the *previous*
 * frame's forward axis) through both the previous and current frame's
 * view-projection matrices, and takes the resulting screen-space UV delta.
 * This is exactly what a real exposure integrates over — it doesn't care
 * *which* component moved the camera or by what formula, so CameraSweep,
 * HandheldDrift, a user orbit, and anything added later are all captured
 * automatically and always in sync with what was actually rendered.
 */
export class LongExposureBlurPass extends Pass {
  private accumulated: THREE.WebGLRenderTarget
  private composited: THREE.WebGLRenderTarget
  private readonly blendMaterial: THREE.ShaderMaterial
  private readonly copyMaterial: THREE.ShaderMaterial
  private halfLifeSeconds: number
  private sceneCamera: THREE.Camera | null
  private lastVirtualTime = 0
  /** Set once a previous frame's camera transform has actually been captured — guards the very first render (nothing to diff against yet) and a fresh burst restart (see `render()`). */
  private hasPreviousCameraState = false
  private readonly previousWorldMatrix = new THREE.Matrix4()
  private readonly previousViewMatrix = new THREE.Matrix4()
  private readonly previousProjectionMatrix = new THREE.Matrix4()
  // Scratch objects, reused every frame — `render()` runs once per real
  // frame for the whole settle burst (up to a few hundred), so avoiding a
  // fresh Vector3 allocation each time is cheap insurance against GC churn.
  private readonly scratchPosition = new THREE.Vector3()
  private readonly scratchForward = new THREE.Vector3()
  private readonly scratchReferencePoint = new THREE.Vector3()
  private readonly scratchNdcOld = new THREE.Vector3()
  private readonly scratchNdcNew = new THREE.Vector3()

  constructor({ halfLifeSeconds = DEFAULT_HALF_LIFE_SECONDS, movementMultiplier = 1, camera }: LongExposureBlurPassOptions = {}) {
    super('LongExposureBlurPass')

    this.halfLifeSeconds = halfLifeSeconds
    this.sceneCamera = camera ?? null

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
  }

  /** Snapshots the live scene camera's current transform as the reference the *next* frame's streak diffs against — see `render()`. No-op if no camera has been set yet. */
  private captureCameraState(): void {
    if (!this.sceneCamera) return
    this.previousWorldMatrix.copy(this.sceneCamera.matrixWorld)
    this.previousViewMatrix.copy(this.sceneCamera.matrixWorldInverse)
    this.previousProjectionMatrix.copy(this.sceneCamera.projectionMatrix)
    this.hasPreviousCameraState = true
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
      // not a bug. `recoveryAmount` is left as whatever the constructor set
      // it to (this render's fixed blur-strength recovery, not a per-frame
      // motion signal) — nothing moved *this frame*, but that doesn't change
      // how much this render's own accumulation has washed the image out.
      //
      // The camera itself can still move here (a user dragging to orbit the
      // settled view) even though nothing is blurred for it — captured
      // below so the *next* real motion diffs against where the camera
      // actually is now, not a stale pre-orbit reference.
      this.captureCameraState()
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

    // Reprojects one fixed reference point — along the *previous* frame's
    // forward axis, far enough away that translation contributes nothing
    // (see `STREAK_REFERENCE_DISTANCE`) — through both the previous and
    // current frame's view-projection matrices, and reads off the
    // resulting screen-space UV delta. That's exactly what a real exposure
    // integrates over, and it doesn't care which component moved the
    // camera or by what formula — see the class docstring for why this
    // replaced a CameraSweep-only yaw/pitch estimate.
    //
    // Skipped (left at 0) on a fresh-burst hard cut (elapsed < 0): the
    // stored "previous" transform is wherever the *last* settle burst
    // happened to end, an arbitrary jump to this new burst's own starting
    // pose that isn't a real exposure step to streak across. Also skipped
    // if there's no camera yet, or no previous transform captured yet (the
    // very first render this pass instance ever does).
    let blurStepU = 0
    let blurStepV = 0
    if (elapsed > 0 && this.sceneCamera && this.hasPreviousCameraState) {
      const camera = this.sceneCamera
      const oldPosition = this.scratchPosition.setFromMatrixPosition(this.previousWorldMatrix)
      const oldForward = this.scratchForward.set(0, 0, -1).transformDirection(this.previousWorldMatrix)
      const referencePoint = this.scratchReferencePoint.copy(oldPosition).addScaledVector(oldForward, STREAK_REFERENCE_DISTANCE)

      const ndcOld = this.scratchNdcOld.copy(referencePoint).applyMatrix4(this.previousViewMatrix).applyMatrix4(this.previousProjectionMatrix)
      const ndcNew = this.scratchNdcNew.copy(referencePoint).applyMatrix4(camera.matrixWorldInverse).applyMatrix4(camera.projectionMatrix)

      blurStepU = THREE.MathUtils.clamp(((ndcNew.x - ndcOld.x) * 0.5) * STREAK_STRENGTH, -MAX_STREAK_UV, MAX_STREAK_UV)
      blurStepV = THREE.MathUtils.clamp(((ndcNew.y - ndcOld.y) * 0.5) * STREAK_STRENGTH, -MAX_STREAK_UV, MAX_STREAK_UV)
    }
    this.captureCameraState()

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
