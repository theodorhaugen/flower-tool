/**
 * Stand-in geometry so the scene has something to look at and focus/light
 * against. This is the slot the procedural flower generator will eventually
 * replace — nothing here should be assumed to survive that work.
 */
export function PlaceholderSubject() {
  return (
    <mesh>
      <icosahedronGeometry args={[1.4, 2]} />
      <meshStandardMaterial color="#e8c9d6" roughness={0.5} metalness={0.05} />
    </mesh>
  )
}
