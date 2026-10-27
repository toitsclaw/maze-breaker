import { describe, expect, it } from "vitest";
import type { MapData } from "../src/game/types";
import { circleHitsWall, moveCircle } from "../src/game/collision";

/** One-room map: 9x9 open with a 3x1 internal wall stub. */
function testMap(): MapData {
  const w = 9;
  const h = 9;
  const cells = new Uint8Array(w * h).fill(0);
  // Frame of walls
  for (let x = 0; x < w; x++) {
    cells[x] = 1;
    cells[(h - 1) * w + x] = 1;
  }
  for (let y = 0; y < h; y++) {
    cells[y * w] = 1;
    cells[y * w + w - 1] = 1;
  }
  // Wall stub: horizontal wall at y=4, x=4..6
  cells[4 * w + 4] = 1;
  cells[4 * w + 5] = 1;
  cells[4 * w + 6] = 1;
  return { w, h, cells, spawn: { x: 1, y: 1 }, exit: { x: 1, y: 1 }, enemySpawns: [] };
}

const map = testMap();
const R = 0.2;

describe("circle-vs-grid collision", () => {
  it("detects when a circle overlaps a wall", () => {
    expect(circleHitsWall(map, 0.1, 1.0, R)).toBe(true); // past the border
    expect(circleHitsWall(map, 1.5, 1.5, R)).toBe(false);
    expect(circleHitsWall(map, 5.5, 4.0, R)).toBe(true); // overlapping stub
  });

  it("blocks movement into a wall", () => {
    const m = moveCircle(map, 1.5, 1.0, R, -1, 0);
    expect(m.x).toBeCloseTo(1.5, 6);
    expect(m.y).toBeCloseTo(1.0, 6);
    expect(m.moved).toBe(false);
  });

  it("slides along walls: blocked x still lets y advance", () => {
    // Standing near the left border wall, pushing into it and down.
    const m = moveCircle(map, 1.5, 2.0, R, -1, 0.8);
    expect(m.x).toBeLessThan(1.5); // swept movement may approach the wall…
    expect(circleHitsWall(map, m.x, m.y, R)).toBe(false); // …but never enters it
    expect(m.y).toBeCloseTo(2.8, 6);
    expect(m.moved).toBe(true);
  });

  it("lets free movement pass unimpeded", () => {
    const m = moveCircle(map, 2.0, 2.0, R, 0.5, 0.25);
    expect(m.x).toBeCloseTo(2.5, 6);
    expect(m.y).toBeCloseTo(2.25, 6);
  });

  it("never leaves the map bounds", () => {
    // Walk in small steps toward the far corner: ends pinned inside bounds.
    let m = { x: 2.0, y: 2.0, moved: true };
    for (let i = 0; i < 200; i++) {
      m = moveCircle(map, m.x, m.y, R, 0.2, 0.2);
      expect(m.x).toBeLessThanOrEqual(map.w - R + 1e-9);
      expect(m.y).toBeLessThanOrEqual(map.h - R + 1e-9);
      expect(m.x).toBeGreaterThanOrEqual(R - 1e-9);
      expect(m.y).toBeGreaterThanOrEqual(R - 1e-9);
      if (!m.moved) break;
    }
    expect(circleHitsWall(map, m.x, m.y, R)).toBe(false);
    // Also pinned with a huge requested step in a single call.
    const one = moveCircle(map, 2.0, 2.0, R, 100, 100);
    expect(one.x).toBeLessThanOrEqual(map.w - R + 1e-9);
    expect(one.y).toBeLessThanOrEqual(map.h - R + 1e-9);
    expect(circleHitsWall(map, one.x, one.y, R)).toBe(false);
  });

  it("approaches a wall head-on and stops at radius clearance", () => {
    // Walk east toward the stub plane (x=4) starting from x=2, y=4.5 (row below stub? no—the stub row is y=4).
    let x = 2.0;
    const y = 4.0;
    for (let i = 0; i < 100; i++) {
      const m = moveCircle(map, x, y, R, 0.2, 0);
      if (!m.moved) break;
      x = m.x;
    }
    // Got close but never punched into the wall footprint.
    expect(x).toBeGreaterThan(3.0);
    expect(x).toBeLessThan(4.0);
    expect(4.0 - x).toBeGreaterThanOrEqual(R - 1e-6);
    // Continued head-on pushes are refused.
    expect(moveCircle(map, x, y, R, 0.2, 0).moved).toBe(false);
    // Sideways slide along the stub row still works.
    const slide = moveCircle(map, x, y, R, 0, 0.2);
    expect(slide.moved).toBe(true);
  });

  it("slides around a wall corner using axis-separated moves", () => {
    // Circle pressed to the west face of the stub, moving east+north: x blocked, y free.
    const m = moveCircle(map, 3.8, 4.5, R, 0.2, -0.3);
    expect(m.x).toBeCloseTo(3.8, 6);
    expect(m.y).toBeCloseTo(4.2, 6);
  });

  it("does not tunnel through a thin wall in one large step", () => {
    const w = 10;
    const h = 3;
    const cells = new Uint8Array(w * h);
    for (let x = 0; x < w; x++) {
      cells[x] = 1;
      cells[(h - 1) * w + x] = 1;
    }
    cells[1 * w] = 1;
    cells[1 * w + (w - 1)] = 1;
    cells[1 * w + 4] = 1; // one-cell-thick pillar
    const thin: MapData = { w, h, cells, spawn: { x: 1, y: 1 }, exit: { x: 1, y: 1 }, enemySpawns: [] };

    const m = moveCircle(thin, 2.5, 1.5, R, 5, 0);
    expect(m.x).toBeLessThan(4 - R + 1e-9); // stopped before the pillar
    expect(m.x).toBeGreaterThan(3.0); // but swept up to it
    expect(m.y).toBeCloseTo(1.5, 6);
    expect(circleHitsWall(thin, m.x, m.y, R)).toBe(false);
  });
});
