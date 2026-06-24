/**
 * mulberry32 — 32-bit PRNG deterministik & cepat.
 *
 * Dipakai di SEMUA selection algorithm sampling. JANGAN PERNAH pakai
 * Math.random() — reproducibility = defensibility audit. Seed tersimpan di
 * SampleResult + di-export ke JSON bundle, sehingga re-run dengan seed sama
 * menghasilkan sampel identik.
 *
 * Referensi: https://gist.github.com/tommyettinger/46a3c00ec7ad1d5b9f06f9d2eb20b46d
 */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Generate seed dari string (mis. hash populasi + timestamp dokumentasi).
 * Cara FNV-1a 32-bit; deterministik per input string.
 */
export function seedFromString(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return h >>> 0;
}

/**
 * Convenience: pick integer in [min, max] inclusive dengan PRNG.
 */
export function randInt(rng: () => number, min: number, max: number): number {
  return Math.floor(rng() * (max - min + 1)) + min;
}

/**
 * Fisher–Yates shuffle in-place pakai PRNG seeded. Mengembalikan array sama
 * (mutated) buat ergonomi chaining.
 */
export function shuffleInPlace<T>(arr: T[], rng: () => number): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/**
 * Sample n unique indices from [0, populationSize-1] tanpa pengembalian.
 * Pakai reservoir sampling kalau n << populationSize biar hemat memori,
 * Fisher–Yates partial kalau n besar.
 */
export function sampleIndices(
  populationSize: number,
  n: number,
  rng: () => number,
): number[] {
  if (n <= 0) return [];
  if (n >= populationSize) {
    return Array.from({ length: populationSize }, (_, i) => i);
  }
  // Fisher–Yates partial — generate first n positions of a shuffled identity
  const indices = Array.from({ length: populationSize }, (_, i) => i);
  for (let i = 0; i < n; i++) {
    const j = i + Math.floor(rng() * (populationSize - i));
    [indices[i], indices[j]] = [indices[j], indices[i]];
  }
  return indices.slice(0, n).sort((a, b) => a - b);
}
