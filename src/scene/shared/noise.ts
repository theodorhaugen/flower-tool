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

/**
 * Sharpened value noise: folds each octave around its midpoint before
 * summing, so smooth rolling hills become creased ridges/valleys instead —
 * a structurally different "grain" than plain `fbm2D`, deliberately, so not
 * every layer of the scene's procedural texture (terrain, ground colour,
 * meadow clusters, path wander, camera drift, haze — all plain `fbm2D`
 * today) shares the exact same soft, blobby character regardless of seed.
 */
export function ridgedFbm2D(x: number, z: number, seed: number, options: FbmOptions = {}): number {
  const { octaves = 4, persistence = 0.5, lacunarity = 2 } = options
  let amplitude = 1
  let frequency = 1
  let sum = 0
  let maxSum = 0

  for (let i = 0; i < octaves; i++) {
    const n = 1 - Math.abs(valueNoise2D(x * frequency, z * frequency, seed + i * 101) * 2 - 1)
    sum += n * n * amplitude
    maxSum += amplitude
    amplitude *= persistence
    frequency *= lacunarity
  }

  return sum / maxSum
}

/** One feature point per integer cell, jittered within it — the lattice Worley/cellular noise below scatters distances against. */
function cellFeaturePoint(cellX: number, cellZ: number, seed: number): [number, number] {
  return [cellX + hash2D(cellX, cellZ, seed), cellZ + hash2D(cellX, cellZ, seed + 1)]
}

/**
 * Cellular (Worley) noise — distance from `(x, z)` to the nearest of a
 * scattered set of feature points, roughly normalized to [0, 1] at unit
 * cell spacing. Reads as mottled clumps/cracks with actual hard edges
 * between cells, the opposite character from `valueNoise2D`'s smooth
 * lattice interpolation — used where the scene wants a visibly different
 * kind of irregularity (dirt-clump mottling) rather than another soft blob.
 */
export function worley2D(x: number, z: number, seed: number): number {
  const cellX = Math.floor(x)
  const cellZ = Math.floor(z)
  let minDistance = Infinity

  for (let dx = -1; dx <= 1; dx++) {
    for (let dz = -1; dz <= 1; dz++) {
      const [px, pz] = cellFeaturePoint(cellX + dx, cellZ + dz, seed)
      const ddx = px - x
      const ddz = pz - z
      const distance = Math.sqrt(ddx * ddx + ddz * ddz)
      if (distance < minDistance) minDistance = distance
    }
  }

  return Math.min(minDistance, 1)
}
