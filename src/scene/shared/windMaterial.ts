import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import type { GenerativeWind } from './generative'

interface WindShaderRef {
  uniforms: { uWindTime: { value: number } }
}

/**
 * Injects a cheap per-vertex wind sway into a `MeshStandardMaterial` via
 * `onBeforeCompile` — no extra geometry attributes needed. Relies on two
 * things already true of every caller (Grass.tsx/WildVegetation.tsx):
 *
 * - The blade/leaflet geometry's local Y already runs 0 (base) .. 1 (tip)
 *   (see shared/taperedBlade.ts), so `position.y` alone is "how far
 *   towards the tip", the way a real blade actually bends more near its
 *   tip than its rooted base.
 * - The mesh has no group-level transform of its own, so `transformed`
 *   (mesh-local position with the instance's own matrix already applied,
 *   right before `<project_vertex>`) is already effectively world-space —
 *   letting the wind direction be expressed once, in world terms, instead
 *   of needing to counter-rotate each instance's own random spin/lean.
 *
 * The travelling-wave phase (`transformed.x/z * frequency`) is what makes
 * gusts sweep across the field spatially instead of every blade swaying in
 * perfect unison — the classic cheap grass-wind technique — and it needs
 * no per-instance attribute at all, since `transformed` is already a
 * genuine per-vertex world position by this point in the shader.
 */
export function applyWindDisplacement(
  material: THREE.MeshStandardMaterial,
  wind: GenerativeWind,
  strengthMultiplier = 1,
): void {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uWindTime = { value: 0 }
    shader.uniforms.uWindSpeed = { value: wind.speed }
    shader.uniforms.uWindStrength = { value: wind.strength * strengthMultiplier }
    shader.uniforms.uWindFrequency = { value: wind.frequency }
    shader.uniforms.uWindDir = {
      value: new THREE.Vector2(Math.cos(wind.directionRad), Math.sin(wind.directionRad)),
    }

    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `
        #include <common>
        uniform float uWindTime;
        uniform float uWindSpeed;
        uniform float uWindStrength;
        uniform float uWindFrequency;
        uniform vec2 uWindDir;
        `,
      )
      .replace(
        '#include <project_vertex>',
        `
        {
          float windPhase = uWindTime * uWindSpeed - (transformed.x * uWindFrequency + transformed.z * uWindFrequency * 0.6);
          float windSway = sin(windPhase) * uWindStrength * pow(clamp(position.y, 0.0, 1.0), 1.5);
          transformed.x += uWindDir.x * windSway;
          transformed.z += uWindDir.y * windSway;
        }
        ` + THREE.ShaderChunk.project_vertex,
      )

    material.userData.windShader = shader
  }
  // onBeforeCompile only runs again if the material is marked dirty — since
  // wind never changes after mount (fixed for the render's lifetime, like
  // everything else generative), this is a one-time setup, not per-frame.
  material.needsUpdate = true
}

/** Advances every wind-displaced material's animation together — call once per frame with real elapsed time. */
export function useWindAnimation(materials: readonly THREE.Material[]): void {
  useFrame(({ clock }) => {
    for (const material of materials) {
      const shader = material.userData.windShader as WindShaderRef | undefined
      if (shader) shader.uniforms.uWindTime.value = clock.elapsedTime
    }
  })
}
