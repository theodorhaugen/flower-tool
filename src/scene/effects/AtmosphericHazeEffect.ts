import { BlendFunction, Effect, EffectAttribute } from 'postprocessing'
import { Color, Uniform } from 'three'
import type { WebGLRenderTarget, WebGLRenderer } from 'three'
import { virtualClock } from '../shared/virtualClock'

/**
 * Screen-space aerial perspective: a slow-drifting, large-scale ("low
 * frequency") haze veil plus a soft wide-tap scatter, both masked by real
 * view-space distance so they thicken with depth rather than sitting
 * evenly over the whole frame. An even veil would just lighten and flatten
 * everything (exactly the contrast loss this needs to avoid); gating by
 * distance keeps the foreground/focal subject close to untouched while the
 * background reads hazier, the way real atmosphere behaves.
 *
 * This complements — doesn't replace — the scene's existing `FogExp2`
 * (environment/Fog.tsx): that fog is geometry-level (baked into how the
 * environment mesh itself is lit/rendered), this is a screen-space top-up
 * that also reaches the flowers/whole composited frame and adds the
 * low-frequency drift and volumetric-scatter terms fog alone doesn't have.
 * `depthFalloff` deliberately mirrors that fog's exponential falloff
 * shape (`1 - exp(-distance * falloff)`) so the two read as one
 * consistent atmosphere rather than two competing effects.
 */
const FRAGMENT_SHADER = /* glsl */ `
uniform float time;
uniform float frequency;
uniform float driftSpeed;
uniform float hazeStrength;
uniform float depthFalloff;
uniform float volumetricStrength;
uniform float volumetricRadius;
uniform vec3 hazeColor;

float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

float valueNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  float a = hash21(i);
  float b = hash21(i + vec2(1.0, 0.0));
  float c = hash21(i + vec2(0.0, 1.0));
  float d = hash21(i + vec2(1.0, 1.0));
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

// Two octaves, both at sub-1-cycle-per-screen scale — this is meant to read
// as slow, soft haze density drifting across the frame, not visible grain,
// so it deliberately stays low-frequency rather than adding more octaves.
float lowFrequencyHaze(vec2 uv) {
  vec2 drift = vec2(time * driftSpeed, time * driftSpeed * 0.6);
  vec2 p = uv * frequency + drift;
  return valueNoise(p) * 0.65 + valueNoise(p * 2.13 + 19.0) * 0.35;
}

void mainImage(const in vec4 inputColor, const in vec2 uv, const in float depth, out vec4 outputColor) {
  #ifdef PERSPECTIVE_CAMERA
    float distanceFromCamera = -perspectiveDepthToViewZ(depth, cameraNear, cameraFar);
  #else
    float distanceFromCamera = depth;
  #endif

  // Aerial-perspective mask: 0 at the camera, approaching 1 with distance,
  // same exponential shape as the scene's own FogExp2 so both layers agree
  // on where "far" starts.
  float depthMask = 1.0 - exp(-distanceFromCamera * depthFalloff);

  vec3 color = inputColor.rgb;

  // Volumetric softness: a handful of wide taps faded in by the same
  // depth mask, standing in for light scattering thickening with distance
  // rather than a uniform blur.
  float volumetricAmount = volumetricStrength * depthMask;
  if (volumetricAmount > 0.001) {
    vec2 r = volumetricRadius * texelSize;
    vec3 scattered = color;
    scattered += texture2D(inputBuffer, uv + vec2(r.x, 0.0)).rgb;
    scattered += texture2D(inputBuffer, uv - vec2(r.x, 0.0)).rgb;
    scattered += texture2D(inputBuffer, uv + vec2(0.0, r.y)).rgb;
    scattered += texture2D(inputBuffer, uv - vec2(0.0, r.y)).rgb;
    scattered *= 0.2;
    color = mix(color, scattered, volumetricAmount);
  }

  float haze = lowFrequencyHaze(uv);
  float hazeAmount = clamp(hazeStrength * depthMask * (0.7 + 0.3 * haze), 0.0, 1.0);
  color = mix(color, hazeColor, hazeAmount);

  outputColor = vec4(color, inputColor.a);
}
`

export interface AtmosphericHazeOptions {
  blendFunction?: BlendFunction
  /** Veil colour — should read as "the air", so this deliberately matches the scene's FogExp2 colour (environment/config.ts). */
  color?: string | Color
  /** Low-frequency noise scale, in cycles per screen-width. Kept under ~2 so it drifts as soft haze, not visible grain. */
  frequency?: number
  /** How fast the haze pattern drifts, in UV-units/second. */
  driftSpeed?: number
  /** Maximum strength of the haze veil, at full depth mask. */
  hazeStrength?: number
  /** Exponential falloff rate applied to view-space distance — mirrors FogExp2's density so the two agree on where "far" starts. */
  depthFalloff?: number
  /** Maximum strength of the wide-tap scatter, at full depth mask. */
  volumetricStrength?: number
  /** Wide-tap radius, in texels. */
  volumetricRadius?: number
}

export class AtmosphericHazeEffect extends Effect {
  constructor({
    blendFunction = BlendFunction.NORMAL,
    color = '#d8d2c6',
    frequency = 1.8,
    driftSpeed = 0.02,
    hazeStrength = 0.12,
    depthFalloff = 0.06,
    volumetricStrength = 0.3,
    volumetricRadius = 3,
  }: AtmosphericHazeOptions = {}) {
    super('AtmosphericHazeEffect', FRAGMENT_SHADER, {
      blendFunction,
      attributes: EffectAttribute.CONVOLUTION | EffectAttribute.DEPTH,
      uniforms: new Map<string, Uniform<unknown>>([
        ['time', new Uniform(0)],
        ['frequency', new Uniform(frequency)],
        ['driftSpeed', new Uniform(driftSpeed)],
        ['hazeStrength', new Uniform(hazeStrength)],
        ['depthFalloff', new Uniform(depthFalloff)],
        ['volumetricStrength', new Uniform(volumetricStrength)],
        ['volumetricRadius', new Uniform(volumetricRadius)],
        ['hazeColor', new Uniform(new Color(color))],
      ]),
    })
  }

  /**
   * Reads `virtualClock.time` directly rather than accumulating the
   * composer-supplied `deltaTime` — this is what makes the haze drift
   * settle into a still along with the camera/wind (see
   * camera/CameraSweep.tsx's docstring) instead of continuing to drift on
   * every render-on-demand tick an orbit drag triggers.
   */
  update(_renderer: WebGLRenderer, _inputBuffer: WebGLRenderTarget): void {
    const time = this.uniforms.get('time')
    if (time) time.value = virtualClock.time
  }
}
