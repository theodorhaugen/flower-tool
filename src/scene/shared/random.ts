export type Rng = () => number

/** Deterministic PRNG (mulberry32) so a given seed always reproduces the same field. */
export function createRng(seed: number): Rng {
  let a = seed >>> 0
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function range(rng: Rng, min: number, max: number): number {
  return min + rng() * (max - min)
}

export function intRange(rng: Rng, min: number, max: number): number {
  return Math.floor(range(rng, min, max + 1))
}

/** Sum-of-uniforms approximation of a gaussian, roughly clipped to [-1, 1], centered on 0. */
export function gaussianish(rng: Rng): number {
  return (rng() + rng() + rng() - 1.5) / 1.5
}
