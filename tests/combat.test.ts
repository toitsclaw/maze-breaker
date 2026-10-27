import { describe, expect, it } from "vitest";
import type { MapData } from "../src/game/types";
import { applyDamage, hitscan, type Combatant } from "../src/game/combat";

function openMap(): MapData {
  const w = 16;
  const h = 4;
  const cells = new Uint8Array(w * h).fill(0);
  for (let x = 0; x < w; x++) {
    cells[x] = 1;
    cells[(h - 1) * w + x] = 1;
  }
  for (let y = 0; y < h; y++) {
    cells[y * w] = 1;
    cells[y * w + w - 1] = 1;
  }
  return { w, h, cells, spawn: { x: 1, y: 1 }, exit: { x: 1, y: 1 }, enemySpawns: [] };
}

function openBlockedMap(): MapData {
  const map = openMap();
  map.cells[1 * map.w + 5] = 1; // wall pillar at (5,1), corridor rows 1..2
  return map;
}

function target(id: number, x: number, y: number, hp = 2, radius = 0.3): Combatant {
  return { id, x, y, radius, hp };
}

describe("hitscan targeting", () => {
  it("returns the nearest of two targets standing on the ray", () => {
    const map = openMap();
    const targets = [target(0, 6.0, 1.5), target(1, 3.0, 1.5)];
    const r = hitscan(map, targets, 1.5, 1.5, 1, 0, 20);
    expect(r.targetIndex).toBe(1);
    expect(r.targetDist).toBeCloseTo(1.2, 6); // 1.5 to centre minus 0.3 radius
  });

  it("selects by nearest near-edge, not merely nearest centre", () => {
    const map = openMap();
    // The fat target's centre is farther, but its front edge is closer.
    const targets = [target(0, 4.0, 1.5, 2, 0.6), target(1, 3.6, 1.5, 2, 0.1)];
    const r = hitscan(map, targets, 1.5, 1.5, 1, 0, 20);
    expect(r.targetIndex).toBe(0);
    expect(r.targetDist).toBeCloseTo(1.9, 6); // centre 2.5 away, radius 0.6
  });

  it("misses targets off-axis beyond their radius", () => {
    const map = openMap();
    const targets = [target(0, 6.0, 2.5)];
    const r = hitscan(map, targets, 1.5, 1.5, 1, 0, 20);
    expect(r.targetIndex).toBe(-1);
    expect(r.wallDist).toBeGreaterThan(10);
  });

  it("hits a target clipped at the edge of its radius", () => {
    const map = openMap();
    const targets = [target(0, 6.0, 1.75)]; // 0.25 lateral from ray center vs radius 0.3
    const r = hitscan(map, targets, 1.5, 1.5, 1, 0, 20);
    expect(r.targetIndex).toBe(0);
  });

  it("reports a wall behind the target instead of the target itself", () => {
    const map = openBlockedMap(); // wall at (5,1)
    const targets = [target(0, 9.0, 1.5)];
    const r = hitscan(map, targets, 1.5, 1.5, 1, 0, 20);
    expect(r.targetIndex).toBe(-1);
    expect(r.wallDist).toBeGreaterThan(0);
    // The first wall plane along +x from x=1.5 is x=5: distance 3.5.
    expect(r.wallDist).toBeCloseTo(3.5, 6);
  });

  it("still hits a target between the shooter and the wall", () => {
    const map = openBlockedMap();
    const mapOpen = openMap();
    const behind = target(0, 9.0, 1.5);
    const before = target(1, 3.0, 1.5);
    const rBehind = hitscan(mapOpen, [behind], 1.5, 1.5, 1, 0, 20);
    expect(rBehind.targetIndex).toBe(0);
    const rBefore = hitscan(map, [before], 1.5, 1.5, 1, 0, 20);
    expect(rBefore.targetIndex).toBe(0);
  });

  it("ignores already-dead combatants", () => {
    const map = openMap();
    const targets = [target(0, 3.0, 1.5, 0)];
    const r = hitscan(map, targets, 1.5, 1.5, 1, 0, 20);
    expect(r.targetIndex).toBe(-1);
  });

  it("respects the maximum shooting range", () => {
    const map = openMap();
    const targets = [target(0, 10.0, 1.5)];
    const r = hitscan(map, targets, 1.5, 1.5, 1, 0, 5);
    expect(r.targetIndex).toBe(-1);
  });

  it("works on diagonal rays", () => {
    const map = openMap();
    const targets = [target(0, 4.0, 2.5)];
    const dx = 2.5;
    const dy = 1.0;
    const len = Math.hypot(dx, dy);
    const r = hitscan(map, targets, 1.5, 1.5, dx / len, dy / len, 20);
    expect(r.targetIndex).toBe(0);
    expect(r.targetDist).toBeCloseTo(len - 0.3, 6);
  });
});

describe("applyDamage", () => {
  it("kills exactly when hp reaches zero", () => {
    const t = target(0, 0, 0, 2);
    expect(applyDamage(t, 1)).toBe(false);
    expect(t.hp).toBe(1);
    expect(applyDamage(t, 1)).toBe(true);
    expect(t.hp).toBe(0);
  });

  it("never benefits from overkill", () => {
    const t = target(0, 0, 0, 1);
    expect(applyDamage(t, 5)).toBe(true);
    expect(t.hp).toBe(-4);
  });
});
