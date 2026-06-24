import { describe, it, expect } from "vitest";
import { mulberry32, sampleIndices, shuffleInPlace, seedFromString } from "./mulberry32";

describe("mulberry32 PRNG", () => {
  it("deterministic per seed", () => {
    const rng1 = mulberry32(42);
    const rng2 = mulberry32(42);
    for (let i = 0; i < 100; i++) {
      expect(rng1()).toBe(rng2());
    }
  });

  it("different seeds → different sequences", () => {
    const a = mulberry32(1);
    const b = mulberry32(2);
    expect(a()).not.toBe(b());
  });

  it("output in [0, 1)", () => {
    const rng = mulberry32(7);
    for (let i = 0; i < 1000; i++) {
      const x = rng();
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(1);
    }
  });

  it("sampleIndices returns unique sorted indices", () => {
    const rng = mulberry32(99);
    const idx = sampleIndices(1000, 50, rng);
    expect(idx.length).toBe(50);
    expect(new Set(idx).size).toBe(50);
    expect([...idx]).toEqual([...idx].sort((a, b) => a - b));
    for (const i of idx) {
      expect(i).toBeGreaterThanOrEqual(0);
      expect(i).toBeLessThan(1000);
    }
  });

  it("sampleIndices reproducible per seed", () => {
    const a = sampleIndices(500, 30, mulberry32(123));
    const b = sampleIndices(500, 30, mulberry32(123));
    expect(a).toEqual(b);
  });

  it("sampleIndices returns all when n >= populationSize", () => {
    const idx = sampleIndices(10, 20, mulberry32(1));
    expect(idx).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });

  it("shuffleInPlace produces permutation", () => {
    const arr = Array.from({ length: 20 }, (_, i) => i);
    shuffleInPlace(arr, mulberry32(1));
    expect(arr.length).toBe(20);
    expect(new Set(arr).size).toBe(20);
  });

  it("seedFromString deterministic", () => {
    expect(seedFromString("cuplik")).toBe(seedFromString("cuplik"));
    expect(seedFromString("cuplik")).not.toBe(seedFromString("cuplek"));
  });
});
