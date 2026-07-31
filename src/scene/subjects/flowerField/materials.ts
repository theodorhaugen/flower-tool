import * as THREE from 'three'

/**
 * Translucency is faked with plain alpha blending rather than physical
 * transmission — with tens of thousands of overlapping instances, a real
 * transmission pass would be needlessly expensive, and the eventual heavy
 * depth-of-field blur hides the difference anyway.
 */
const sharedPetalProps = {
  color: new THREE.Color('#ffffff'),
  transparent: true,
  depthWrite: false,
  side: THREE.DoubleSide,
  metalness: 0,
} as const

export const PETAL_MATERIAL_PROPS: readonly THREE.MeshStandardMaterialParameters[] = [
  {
    ...sharedPetalProps,
    roughness: 0.55,
    opacity: 0.78,
    emissive: new THREE.Color('#fbdce6'),
    emissiveIntensity: 0.08,
  },
  {
    ...sharedPetalProps,
    roughness: 0.68,
    opacity: 0.72,
    emissive: new THREE.Color('#e6dcfb'),
    emissiveIntensity: 0.06,
  },
]

export const CENTER_MATERIAL_PROPS: THREE.MeshStandardMaterialParameters = {
  color: new THREE.Color('#ffffff'),
  roughness: 0.6,
  metalness: 0.05,
  emissive: new THREE.Color('#7a5a2a'),
  emissiveIntensity: 0.12,
}
