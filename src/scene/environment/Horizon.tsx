import { useMemo } from 'react'
import * as THREE from 'three'
import { ENVIRONMENT_CONFIG } from './config'

const VERTEX_SHADER = `
  varying vec3 vWorldPosition;
  void main() {
    vec4 worldPosition = modelMatrix * vec4(position, 1.0);
    vWorldPosition = worldPosition.xyz;
    gl_Position = projectionMatrix * viewMatrix * worldPosition;
  }
`

const FRAGMENT_SHADER = `
  uniform vec3 skyColor;
  uniform vec3 horizonColor;
  uniform vec3 groundColor;
  uniform float horizonHeight;
  uniform float spread;
  varying vec3 vWorldPosition;

  void main() {
    float h = (vWorldPosition.y - horizonHeight) / spread;
    vec3 color = h > 0.0
      ? mix(horizonColor, skyColor, smoothstep(0.0, 1.0, h))
      : mix(horizonColor, groundColor, smoothstep(0.0, 1.0, -h));
    gl_FragColor = vec4(color, 1.0);
  }
`

/**
 * A soft vertical-gradient backdrop standing in for a distant horizon — a
 * plain custom shader rather than a physically-based sky, so the colors stay
 * inside the same muted editorial palette as everything else instead of
 * drifting towards a literal blue-sky-and-sun look. No fog chunk is included
 * on purpose: this represents "infinitely far away," so scene fog shouldn't
 * layer on top of it — its own gradient already meets the fog color at the
 * horizon line for a seamless blend.
 */
export function Horizon() {
  const { radius, skyColor, horizonColor, groundColor, horizonHeight, spread } = ENVIRONMENT_CONFIG.horizon

  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: {
          skyColor: { value: new THREE.Color(skyColor) },
          horizonColor: { value: new THREE.Color(horizonColor) },
          groundColor: { value: new THREE.Color(groundColor) },
          horizonHeight: { value: horizonHeight },
          spread: { value: spread },
        },
        vertexShader: VERTEX_SHADER,
        fragmentShader: FRAGMENT_SHADER,
        side: THREE.BackSide,
        depthWrite: false,
        fog: false,
      }),
    [skyColor, horizonColor, groundColor, horizonHeight, spread],
  )

  return (
    <mesh material={material} renderOrder={-1000}>
      <sphereGeometry args={[radius, 24, 16]} />
    </mesh>
  )
}
