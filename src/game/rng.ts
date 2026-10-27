/** Tiny deterministic PRNG (mulberry32). All randomness flows through one stream. */

export type Rng = () => number;

export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), t | 61)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Uniform float in [min, max). */
export function range(rng: Rng, min: number, max: number): number {
  return min + rng() * (max - min);
}

/** Uniform integer in [min, max]. */
export function intIn(rng: Rng, min: number, max: number): number {
  return min + Math.floor(rng() * (max - min + 1));
}

/** Pick one element uniformly. */
export function pick<T>(rng: Rng, items: readonly T[]): T {
  return items[intIn(rng, 0, items.length - 1)];
}
