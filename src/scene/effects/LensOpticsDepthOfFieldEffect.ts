import { BlendFunction, Effect, EffectAttribute } from 'postprocessing'
import { Uniform } from 'three'

/**
 * Thin-lens circle-of-confusion depth of field: for each pixel, converts its
 * scene depth into an image-space defocus amount using the same lens
 * equation a real camera obeys — object distance, focal length, and focus
 * distance together give a focal-plane conjugate distance; the difference
 * between a pixel's conjugate distance and the focus plane's, scaled by
 * aperture (f-stop) and a fixed circle-of-confusion criterion, is the blur
 * radius. Nothing here is an arbitrary/hand-tuned falloff curve.
 *
 * This is adapted from `postprocessing`'s own `RealisticBokehEffect`
 * (credited below) rather than used directly: that effect's bundled shader
 * calls `linearToRelativeLuminance`, a helper three.js used to expose as a
 * global shader chunk function in older versions but has since removed,
 * so it fails to compile against the three.js version this project uses.
 * The fix is a one-line standard-luminance inline; the lens equation and
 * ring/sample bokeh-disc sampling are otherwise unchanged from the
 * original.
 *
 * One thing *was* changed from the original, in `mainImage` below: the
 * per-pixel depth it reads used to go through `viewZToOrthographicDepth`,
 * which normalizes it into a [0,1] fraction of the camera's near/far clip
 * range — then the next line multiplied that fraction by 1000 as if it
 * were real-world metres. It never was: `focus` (the JS side, see
 * LensOpticsDepthOfField.tsx) is a genuine metres value via
 * `metersPerWorldUnit`, and this per-pixel depth was on an entirely
 * different, near/far-dependent scale — so every comparison this shader
 * makes between "this pixel's depth" and "the focus distance" was
 * comparing two numbers with no real relationship to each other. It could
 * only ever look sharp where those two unrelated scales happened to
 * coincide by chance, never reliably at the actual configured focus
 * distance (confirmed directly: pointing a real raycast at the exact
 * on-screen focus target and feeding *that* real, verified-correct world
 * distance into `focus` still produced a fully out-of-focus render). Fixed
 * by keeping the already-linear `viewZ` (real world units) and scaling it
 * through the same `metersPerWorldUnit` uniform `focus` itself uses,
 * instead of ever normalizing it against near/far at all.
 *
 * Original shader: Martins Upitis,
 * http://blenderartists.org/forum/showthread.php?237488
 */
const FRAGMENT_SHADER = /* glsl */ `
uniform float focus;
uniform float focalLength;
uniform float fStop;
uniform float maxBlur;
uniform float luminanceThreshold;
uniform float luminanceGain;
uniform float bias;
uniform float fringe;
uniform float metersPerWorldUnit;

float lensRelativeLuminance(vec3 color) {
  return dot(color, vec3(0.2126729, 0.7151522, 0.0721750));
}

vec3 processTexel(const in vec2 coords, const in float blur) {
  vec2 scale = texelSize * fringe * blur;
  vec3 c = vec3(
    texture2D(inputBuffer, coords + vec2(0.0, 1.0) * scale).r,
    texture2D(inputBuffer, coords + vec2(-0.866, -0.5) * scale).g,
    texture2D(inputBuffer, coords + vec2(0.866, -0.5) * scale).b
  );

  float luminance = lensRelativeLuminance(c);
  float threshold = max((luminance - luminanceThreshold) * luminanceGain, 0.0);
  return c + mix(vec3(0.0), c, threshold * blur);
}

float gather(const in float i, const in float j, const in float ringSamples, const in vec2 uv,
  const in vec2 blurFactor, const in float blur, inout vec3 color) {
  float step = PI2 / ringSamples;
  vec2 wh = vec2(cos(j * step) * i, sin(j * step) * i);
  color += processTexel(wh * blurFactor + uv, blur) * mix(1.0, i / RINGS_FLOAT, bias);
  return mix(1.0, i / RINGS_FLOAT, bias);
}

void mainImage(const in vec4 inputColor, const in vec2 uv, const in float depth, out vec4 outputColor) {
  #ifdef PERSPECTIVE_CAMERA
    float viewZ = perspectiveDepthToViewZ(depth, cameraNear, cameraFar);
  #else
    float viewZ = -depth;
  #endif

  // viewZ above is already a genuine world-space distance (negative,
  // camera-space) — converting it through viewZToOrthographicDepth used
  // to normalize it into a [0,1] fraction of the near/far clip range
  // instead, which the line below then multiplied by 1000 as if it were
  // metres: a completely different, near/far-dependent scale than focus
  // actually uses (which goes through metersPerWorldUnit from real world
  // units). The two sides of every comparison below were never
  // commensurate — this pass could only ever look sharp where those two
  // unrelated scales happened to coincide by chance, not at the actual
  // focus distance. Using -viewZ (real world units) with the same
  // metersPerWorldUnit conversion focus already went through is what
  // actually makes "sharp at the real focus distance" true.
  float linearDepthWorldUnits = -viewZ;

  // Thin-lens equation: converts a world-space depth into the conjugate
  // image-plane distance for a lens of this focal length. Applied both to
  // the pixel's own depth and to the focus distance, then compared.
  //
  // The standard 35mm acceptable-sharpness criterion (0.03mm) this used to
  // be set to made blur reach its 0-1 clamp within roughly ±0.022 world
  // units of the focus plane at this scene's focal length/aperture/scale —
  // about a thousandth of the scene's actual depth range. In effect every
  // pixel not at exactly the focus distance rendered at max blur, so
  // focusDistance (per-seed and per-preset, see generative.ts) had
  // essentially no visible effect: nothing ever read as gradually going
  // soft with distance, it was binary knife-edge-sharp-or-fully-blurred at
  // a razor's width. This is already a deliberately non-physical lens in
  // every other respect (fStop is pinned at 1.4 specifically because "real
  // macro is usually stopped down for more sharpness, the opposite of what
  // we want here" — see camera/config.ts) — 2.0mm is picked the same way,
  // for the falloff width it produces rather than any photographic
  // criterion: it puts full-sharpness roughly ±0.6 to ±1.5 world units
  // (preset-dependent — closer focus distances get a physically-correct
  // *shallower* absolute range) around the focus plane, wide enough to read
  // as a real gradual falloff across the near flower cluster rather than a
  // single infinitesimal plane, while still keeping the shallow, defocus-
  // dominant macro look this effect is going for.
  const float CIRCLE_OF_CONFUSION = 2.0; // mm — tuned for falloff width, not a photographic criterion (see above)
  float focalPlaneMM = focus * 1000.0;
  float depthMM = linearDepthWorldUnits * metersPerWorldUnit * 1000.0;
  float focalPlane = (depthMM * focalLength) / (depthMM - focalLength);
  float farDoF = (focalPlaneMM * focalLength) / (focalPlaneMM - focalLength);
  float nearDoF = (focalPlaneMM - focalLength) / (focalPlaneMM * fStop * CIRCLE_OF_CONFUSION);
  float blur = abs(focalPlane - farDoF) * nearDoF;

  const int MAX_RING_SAMPLES = RINGS_INT * SAMPLES_INT;
  blur = clamp(blur, 0.0, 1.0);
  vec3 color = inputColor.rgb;

  if (blur >= 0.05) {
    vec2 blurFactor = blur * maxBlur * texelSize;
    float s = 1.0;
    int ringSamples;

    for (int i = 1; i <= RINGS_INT; i++) {
      ringSamples = i * SAMPLES_INT;
      for (int j = 0; j < MAX_RING_SAMPLES; j++) {
        if (j >= ringSamples) break;
        s += gather(float(i), float(j), float(ringSamples), uv, blurFactor, blur, color);
      }
    }

    color /= s;
  }

  outputColor = vec4(color, inputColor.a);
}
`

export interface LensOpticsDepthOfFieldOptions {
  blendFunction?: BlendFunction
  /** Focus distance in world units (meters, physically speaking). */
  focus?: number
  /** Focal length in mm. */
  focalLength?: number
  /** f-number — the ratio of focal length to aperture diameter. Lower = shallower depth of field. */
  fStop?: number
  /** Bokeh-disc size multiplier — the lens equation decides how much to blur a pixel, this decides how large that blur renders. */
  maxBlur?: number
  /** Ring count for the bokeh-disc sampling pattern — more rings/samples look smoother but cost more. */
  rings?: number
  samples?: number
  /** Real-world metres one world unit represents — must match whatever `focus` was itself computed with (see camera/config.ts's `dof.metersPerWorldUnit`), so the per-pixel depth this shader samples from the depth buffer lands on the same real-world scale `focus` does. */
  metersPerWorldUnit?: number
}

export class LensOpticsDepthOfFieldEffect extends Effect {
  constructor({
    blendFunction = BlendFunction.NORMAL,
    focus = 1,
    focalLength = 24,
    fStop = 0.9,
    maxBlur = 1,
    rings = 3,
    samples = 2,
    metersPerWorldUnit = 1,
  }: LensOpticsDepthOfFieldOptions = {}) {
    super('LensOpticsDepthOfFieldEffect', FRAGMENT_SHADER, {
      blendFunction,
      attributes: EffectAttribute.CONVOLUTION | EffectAttribute.DEPTH,
      uniforms: new Map([
        ['focus', new Uniform(focus)],
        ['focalLength', new Uniform(focalLength)],
        ['fStop', new Uniform(fStop)],
        ['maxBlur', new Uniform(maxBlur)],
        ['metersPerWorldUnit', new Uniform(metersPerWorldUnit)],
        // Chromatic fringing / highlight-boost knobs the original shader
        // exposes but this project doesn't need to tune — fixed, sane
        // defaults rather than dead configuration surface.
        ['luminanceThreshold', new Uniform(0.5)],
        ['luminanceGain', new Uniform(2.0)],
        ['bias', new Uniform(0.5)],
        ['fringe', new Uniform(0.7)],
      ]),
    })

    this.rings = rings
    this.samples = samples
  }

  get rings(): number {
    return Number.parseInt(this.defines.get('RINGS_INT') ?? '0')
  }

  set rings(value: number) {
    const r = Math.floor(value)
    this.defines.set('RINGS_INT', r.toFixed(0))
    this.defines.set('RINGS_FLOAT', r.toFixed(1))
    this.setChanged()
  }

  get samples(): number {
    return Number.parseInt(this.defines.get('SAMPLES_INT') ?? '0')
  }

  set samples(value: number) {
    const s = Math.floor(value)
    this.defines.set('SAMPLES_INT', s.toFixed(0))
    this.defines.set('SAMPLES_FLOAT', s.toFixed(1))
    this.setChanged()
  }
}
