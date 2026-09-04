import { useLayoutEffect, useRef } from 'react'
import * as THREE from 'three'
import type { InstanceDatum } from './instancing'

interface InstancedGroupProps {
  geometry: THREE.BufferGeometry
  material: THREE.Material
  instances: InstanceDatum[]
}

/** Populates an InstancedMesh's transforms/colors imperatively — the instance count is fixed per dataset, so this only needs to run once. */
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
  }, [instances])

  if (instances.length === 0) return null

  return <instancedMesh ref={meshRef} args={[geometry, material, instances.length]} />
}
