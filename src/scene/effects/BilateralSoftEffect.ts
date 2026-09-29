import { BlendFunction, Effect, EffectAttribute } from 'postprocessing'
import { Uniform } from 'three'

/**
 * Edge-aware ("bilateral") softening: each output pixel is a weighted
 * average of a small ring of neighbours, but the weight also drops off with
 * how different a neighbour's brightness is from the centre pixel — not
 * just how far away it is, the way a plain blur works. That second term is
 * what keeps a flower's silhouette against the grass (a big luminance
 * jump) crisp while still smoothing fine, low-contrast texture (petal
 * grain, grass noise, the haze layer below) into something softer. A plain
 * Gaussian blur here would eat exactly the contrast this project's DoF and
 * bloom rely on to keep the in-focus subject legible.
 */
const FRAGMENT_SHADER = /* glsl */ `
uniform float radius;
uniform float spatialSigma;
uniform float rangeSigma;

float relLuminance(vec3 color) {
  return dot(color, vec3(0.2126, 0.7152, 0.0722));
}

// Every ring tap sits at the same normalised distance from the centre (this
// is a single-ring filter, not a multi-radius Gaussian), so spatialSigma is
// really "how much the ring counts relative to the always-included centre
// tap" rather than a true distance falloff — a coarser but much cheaper
// stand-in for a full multi-tap kernel.
float accumulateTap(const in vec2 uv, const in vec2 offsetDir, const in float centerLuminance, inout vec3 sum) {
  vec2 offset = offsetDir * radius * texelSize;
  vec3 sampleColor = texture2D(inputBuffer, uv + offset).rgb;
  float sampleLuminance = relLuminance(sampleColor);

  float spatialWeight = exp(-1.0 / (2.0 * spatialSigma * spatialSigma));
  float rangeDelta = sampleLuminance - centerLuminance;
  float rangeWeight = exp(-(rangeDelta * rangeDelta) / (2.0 * rangeSigma * rangeSigma));
  float weight = spatialWeight * rangeWeight;

  sum += sampleColor * weight;
  return weight;
}

void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
  vec3 centerColor = inputColor.rgb;
  float centerLuminance = relLuminance(centerColor);

  vec3 sum = centerColor;
  float weightSum = 1.0;

  weightSum += accumulateTap(uv, vec2(1.0, 0.0), centerLuminance, sum);
  weightSum += accumulateTap(uv, vec2(-1.0, 0.0), centerLuminance, sum);
  weightSum += accumulateTap(uv, vec2(0.0, 1.0), centerLuminance, sum);
  weightSum += accumulateTap(uv, vec2(0.0, -1.0), centerLuminance, sum);
  weightSum += accumulateTap(uv, vec2(0.7071, 0.7071), centerLuminance, sum);
  weightSum += accumulateTap(uv, vec2(-0.7071, 0.7071), centerLuminance, sum);
  weightSum += accumulateTap(uv, vec2(0.7071, -0.7071), centerLuminance, sum);
  weightSum += accumulateTap(uv, vec2(-0.7071, -0.7071), centerLuminance, sum);

  outputColor = vec4(sum / weightSum, inputColor.a);
}
`

export interface BilateralSoftOptions {
  blendFunction?: BlendFunction
  /** Kernel radius in texels — how far the 8-tap ring reaches. */
  radius?: number
  /** How much the ring counts relative to the centre tap (see the shader comment — this is a single-ring filter, not a multi-distance falloff). */
  spatialSigma?: number
  /**
   * Luminance-difference falloff, normalised 0-1 — the edge-preserving
   * half of the filter. Small values reject taps whose brightness differs
   * much from the centre pixel, which is what keeps hard silhouette edges
   * intact while flat/gradient regions blend together.
   */
  rangeSigma?: number
}

export class BilateralSoftEffect extends Effect {
  constructor({
    blendFunction = BlendFunction.NORMAL,
    radius = 1.5,
    spatialSigma = 1,
    rangeSigma = 0.15,
  }: BilateralSoftOptions = {}) {
    super('BilateralSoftEffect', FRAGMENT_SHADER, {
      blendFunction,
      attributes: EffectAttribute.CONVOLUTION,
      uniforms: new Map([
        ['radius', new Uniform(radius)],
        ['spatialSigma', new Uniform(spatialSigma)],
        ['rangeSigma', new Uniform(rangeSigma)],
      ]),
    })
  }
}
