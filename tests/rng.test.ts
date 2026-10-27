import { describe, expect, it } from "vitest";
import { intIn, mulberry32, pick, range } from "../src/game/rng";

describe("mulberry32 seeded rng", () => {
  it("produces identical streams for identical seeds", () => {
    const a = mulberry32(12345);
    const b = mulberry32(12345);
    const seqA = Array.from({ length: 32 }, () => a());
    const seqB = Array.from({ length: 32 }, () => b());
    expect(seqA).toEqual(seqB);
  });

  it("produces different streams for different seeds", () => {
    const a = mulberry32(1);
    const b = mulberry32(2);
    const seqA = [a(), a(), a(), a()];
    const seqB = [b(), b(), b(), b()];
    expect(seqA).not.toEqual(seqB);
  });

  it("stays in the unit interval", () => {
    const rng = mulberry32(999);
    for (let i = 0; i < 1000; i++) {
      const v = rng();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it("range/intIn/pick respect their bounds", () => {
    const rng = mulberry32(314);
    for (let i = 0; i < 500; i++) {
      const v = range(rng, -2, 5);
      expect(v).toBeGreaterThanOrEqual(-2);
      expect(v).toBeLessThan(5);
      const n = intIn(rng, 0, 3);
      expect(Number.isInteger(n)).toBe(true);
      expect(n).toBeGreaterThanOrEqual(0);
      expect(n).toBeLessThanOrEqual(3);
      const p = pick(rng, ["a", "b", "c"]);
      expect(["a", "b", "c"]).toContain(p);
    }
  });

  it("wraps large seeds into uint32 space deterministically", () => {
    const raw = 0xffffffff + 12345;
    expect(mulberry32(raw)()).toBe(mulberry32(raw >>> 0)());
  });
});
