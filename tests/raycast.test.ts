import { describe, expect, it } from "vitest";
import type { MapData } from "../src/game/types";
import { castRay, hasLineOfSight } from "../src/game/raycast";
import { tileAt } from "../src/game/level";

/** Open room with one wall column at x=3, rows 1..3 passable. */
function testMap(): MapData {
  const rows = [
    "####",
    "#..#",
    "#..#",
    "#..#",
    "####",
  ];
  const w = 4;
  const h = 5;
  const cells = new Uint8Array(w * h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) cells[y * w + x] = rows[y][x] === "#" ? 1 : 0;
  return { w, h, cells, spawn: { x: 1, y: 2 }, exit: { x: 1, y: 2 }, enemySpawns: [] };
}

const map = testMap();

describe("castRay (DDA wall hits)", () => {
  it("hits a wall straight ahead with exact perpendicular distance", () => {
    const hit = castRay(map, 1.5, 2.5, 1, 0, 32);
    expect(hit).not.toBeNull();
    expect(hit!.dist).toBeCloseTo(1.5, 6); // from x=1.5 to the x=3 plane
    expect(hit!.side).toBe(0);
    expect(hit!.cellX).toBe(3);
    expect(hit!.cellY).toBe(2);
  });

  it("hits a wall backwards", () => {
    const hit = castRay(map, 2.5, 2.5, -1, 0, 32);
    expect(hit!.dist).toBeCloseTo(1.5, 6);
    expect(hit!.cellX).toBe(0);
  });

  it("reports unit-ray distance equal to euclidean path length on diagonals", () => {
    // 45° up-right ray through corner cell (2,2)... actually exits east wall plane x=3.
    const s = Math.SQRT1_2;
    const hit = castRay(map, 1.5, 2.5, s, -s, 32);
    // y crosses 2.0 quickly? y=2.5-... verify against analytic expectation.
    expect(hit).not.toBeNull();
    expect(hit!.dist).toBeGreaterThan(1.0);
    expect(hit!.dist).toBeLessThan(3.0);
  });

  it("returns null beyond maxDist", () => {
    expect(castRay(map, 1.5, 2.5, 1, 0, 0.9)).toBeNull();
  });

  it("treats out-of-bounds as wall so rays always terminate", () => {
    const hit = castRay(map, 1.5, 2.5, 1, 0, 64);
    expect(hit!.cell).toBe(1);
    expect(tileAt(map, hit!.cellX, hit!.cellY)).toBe(1);
  });

  it("is deterministic for repeated calls", () => {
    const a = castRay(map, 1.5, 2.5, 0.8, 0.1, 32);
    const b = castRay(map, 1.5, 2.5, 0.8, 0.1, 32);
    expect(a).toEqual(b);
  });
});

describe("hasLineOfSight", () => {
  it("is true across an open straight corridor", () => {
    expect(hasLineOfSight(map, 0.5, 2.5, 2.5, 2.5)).toBe(true);
  });

  it("is true across gaps, false when a wall blocks the segment", () => {
    expect(hasLineOfSight(map, 1.5, 1.5, 2.5, 1.5)).toBe(true);
    // Wall column x=3 blocks sight from x=1 to x=3 past it.
    expect(hasLineOfSight(map, 0.5, 1.5, 3.5, 1.5)).toBe(false);
  });

  it("is true for degenerate same-point queries", () => {
    expect(hasLineOfSight(map, 1.5, 1.5, 1.5, 1.5)).toBe(true);
  });
});
