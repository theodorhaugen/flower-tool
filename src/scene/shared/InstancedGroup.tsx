import { useLayoutEffect, useRef } from 'react'
import * as THREE from 'three'
import type { InstanceDatum } from './instancing'

interface InstancedGroupProps {
  geometry: THREE.BufferGeometry
  material: THREE.Material
  instances: InstanceDatum[]
}

/**
 * Populates an InstancedMesh's transforms/colors imperatively. Depends on
 * `geometry`/`material` too, not just `instances` — the `args` tuple below
 * (`[geometry, material, instances.length]`) means R3F destroys and
 * recreates the underlying `THREE.InstancedMesh` whenever *any* of those
 * three change identity, not only when `instances.length` does. If this
 * effect only watched `instances`, a caller whose `material` is rebuilt for
 * reasons that have nothing to do with this group's own data (grass/wild-
 * vegetation both rebuild their shared material whenever the active
 * render's `wind` object changes identity, which happens on *every* Leva
 * tweak anywhere in the app — see shared/GenerativeProvider.tsx's `wind`
 * field) would get a brand-new mesh with its transforms never (re)written,
 * since React sees `instances` as unchanged and skips the effect — every
 * instance then renders at the mesh's default identity transform (stacked
 * at the origin) instead of its real position, reading as "the whole group
 * vanished." Confirmed directly: dragging an unrelated slider and back to
 * its starting value reproduced exactly this on Grass, with the console
 * showing the instancedMesh being torn down and recreated while the
 * layout effect never re-ran.
 */
export function InstancedGroup({ geometry, material, instances }: InstancedGroupProps) {
  const meshRef = useRef<THREE.InstancedMesh>(null)

  useLayoutEffect(() => {
    const mesh = meshRef.current
    if (!mesh) return

    instances.forEach((instance, index) => {
      mesh.setMatrixAt(index, instance.matrix)
      mesh.setColorAt(index, instance.color)
    })
    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
    mesh.computeBoundingSphere()
  }, [geometry, material, instances])

  if (instances.length === 0) return null

  return <instancedMesh ref={meshRef} args={[geometry, material, instances.length]} />
}
