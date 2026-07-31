function hash2D(ix: number, iz: number, seed: number): number {
  let h = ix * 374761393 + iz * 668265263 + seed * 1274126177
  h = (h ^ (h >>> 13)) * 1274126177
  h = h ^ (h >>> 16)
  return (h >>> 0) / 4294967295
}

function smoothstep(t: number): number {
  return t * t * (3 - 2 * t)
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

/** Bilinearly-interpolated value noise over an integer lattice, range [0, 1). */
export function valueNoise2D(x: number, z: number, seed: number): number {
  const x0 = Math.floor(x)
  const z0 = Math.floor(z)
  const sx = smoothstep(x - x0)
  const sz = smoothstep(z - z0)

  const n00 = hash2D(x0, z0, seed)
  const n10 = hash2D(x0 + 1, z0, seed)
  const n01 = hash2D(x0, z0 + 1, seed)
  const n11 = hash2D(x0 + 1, z0 + 1, seed)

  return lerp(lerp(n00, n10, sx), lerp(n01, n11, sx), sz)
}

export interface FbmOptions {
  octaves?: number
  persistence?: number
  lacunarity?: number
}

/** Layered value noise (fractal Brownian motion), normalized to [0, 1]. */
export function fbm2D(x: number, z: number, seed: number, options: FbmOptions = {}): number {
  const { octaves = 4, persistence = 0.5, lacunarity = 2 } = options
  let amplitude = 1
  let frequency = 1
  let sum = 0
  let maxSum = 0

  for (let i = 0; i < octaves; i++) {
    sum += valueNoise2D(x * frequency, z * frequency, seed + i * 101) * amplitude
    maxSum += amplitude
    amplitude *= persistence
    frequency *= lacunarity
  }

  return sum / maxSum
}

/** 1D slice through the same value noise — used for wandering path curves. */
export function noise1D(t: number, seed: number): number {
  return valueNoise2D(t, 0.5, seed)
}
