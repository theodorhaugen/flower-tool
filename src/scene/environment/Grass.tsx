import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { useGenerative } from '../shared/generativeContext'
import { InstancedGroup } from '../shared/InstancedGroup'
import { useMeadowLayout } from '../shared/meadowLayoutConfig'
import { useTerrainShape } from '../shared/terrainShapeConfig'
import { applyWindDisplacement, useWindAnimation } from '../shared/windMaterial'
import { generateGrass } from './generateGrass'
import { useEnvironmentPaletteColors } from './paletteColors'

/**
 * Grass-only self-lit floor: adds a fraction of each blade's own vertex
 * colour directly into the shaded output, on top of whatever the scene's
 * directional lighting actually contributed.
 *
 * SceneLighting.tsx deliberately keeps the non-directional floor
 * (hemisphere+ambient) well below the key light's peak — that ratio is what
 * gives sun-facing surfaces real shadow depth, and undoing it to brighten
 * grass would flatten that dynamic range for *everything* (flowers, ground,
 * terrain) again, re-introducing the exact flat-exposure problem that ratio
 * was tuned to fix. Grass specifically suffers more from it than a flat
 * ground plane does, though: blades are thin, near-vertical, curled/twisted
 * cards, so a large share of their surface faces well away from the single
 * key light's direction and gets little to no direct N·L contribution,
 * while the ground's mostly-upward normal catches it directly. Measured
 * directly: rendered grass came out 2-4x darker than the ground it grows
 * out of across every palette, and adjusting base colour/AO strength barely
 * moved that number — confirming the gap is mostly a lighting-angle effect,
 * not a colour one. Patching the shader to add a self-lit contribution
 * tied to the blade's *own* colour (so AO/tip-vs-base shading is still
 * visible, just less totally erased by grazing-angle lighting) is the
 * targeted fix that doesn't touch anything else's exposure.
 */
function applyVertexColorLightFloor(material: THREE.MeshStandardMaterial, floorAmount: number): void {
  const previousOnBeforeCompile = material.onBeforeCompile
  material.onBeforeCompile = (shader, renderer) => {
    previousOnBeforeCompile.call(material, shader, renderer)
    shader.uniforms.uLightFloor = { value: floorAmount }
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\nuniform float uLightFloor;`)
      .replace('#include <opaque_fragment>', `outgoingLight += vColor.rgb * uLightFloor;\n#include <opaque_fragment>`)
    material.userData.lightFloorShader = shader
  }
  material.needsUpdate = true
}

/** Dense instanced grass blades covering the near/mid ground, swaying in the active render's generative wind. */
export function Grass() {
  const { environmentSeed, meadowLayoutSeed, terrainShapeSeed, wind, grassDensity, grassHeight, grassWidth } =
    useGenerative()
  const { grassColorPalette } = useEnvironmentPaletteColors()
  const meadowLayout = useMeadowLayout(meadowLayoutSeed)
  const terrainShape = useTerrainShape(terrainShapeSeed)

  const groups = useMemo(
    () =>
      generateGrass(grassColorPalette, environmentSeed, meadowLayout, terrainShape, {
        densityMultiplier: grassDensity,
        heightMultiplier: grassHeight,
        widthMultiplier: grassWidth,
      }),
    [grassColorPalette, environmentSeed, meadowLayout, terrainShape, grassDensity, grassHeight, grassWidth],
  )
  const material = useMemo(() => {
    const mat = new THREE.MeshStandardMaterial({
      color: new THREE.Color('#ffffff'),
      roughness: 0.85,
      side: THREE.DoubleSide,
      // Reads the baked base-darkening AO every tapered-blade geometry now
      // carries (shared/taperedBlade.ts) — without this the geometry's own
      // colour attribute is simply ignored and every blade stays flatly lit
      // top-to-bottom.
      vertexColors: true,
    })
    applyWindDisplacement(mat, wind)
    applyVertexColorLightFloor(mat, 0.7)
    return mat
  }, [wind])

  useWindAnimation([material])

  useEffect(() => {
    return () => {
      groups.forEach((group) => group.geometry.dispose())
      material.dispose()
    }
  }, [groups, material])

  return (
    <>
      {groups.map((group, index) => (
        <InstancedGroup key={index} geometry={group.geometry} material={material} instances={group.instances} />
      ))}
    </>
  )
}
