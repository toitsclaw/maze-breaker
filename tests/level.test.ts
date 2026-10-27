import { describe, expect, it } from "vitest";
import {
  MAZE_ROWS,
  cellIdx,
  floodReachable,
  levelFullyReachable,
  parseLevel,
  tileAt,
} from "../src/game/level";

describe("authored level", () => {
  it("parses with correct dimensions", () => {
    const map = parseLevel(MAZE_ROWS);
    expect(map.w).toBe(28);
    expect(map.h).toBe(20);
  });

  it("spawns a player and exactly seven enemies on floor tiles", () => {
    const map = parseLevel(MAZE_ROWS);
    expect(map.cells[cellIdx(map, map.spawn.x, map.spawn.y)]).toBe(0);
    expect(map.enemySpawns.length).toBe(7);
    for (const spawn of map.enemySpawns) {
      expect(map.cells[cellIdx(map, spawn.x, spawn.y)]).toBe(0);
    }
    expect(map.cells[cellIdx(map, map.exit.x, map.exit.y)]).toBe(2);
  });

  it("is fully connected: every open cell, enemy spawn and the exit reachable from spawn", () => {
    const map = parseLevel(MAZE_ROWS);
    expect(levelFullyReachable(map)).toBe(true);
  });

  it("has exactly one connected room component (no sealed pockets)", () => {
    const map = parseLevel(MAZE_ROWS);
    const seen = new Set<number>();
    let components = 0;
    for (let y = 0; y < map.h; y++) {
      for (let x = 0; x < map.w; x++) {
        const idx = cellIdx(map, x, y);
        if (map.cells[idx] === 1 || seen.has(idx)) continue;
        components++;
        const queue = [idx];
        seen.add(idx);
        for (let q = 0; q < queue.length; q++) {
          const cur = queue[q];
          const cx = cur % map.w;
          const cy = (cur - cx) / map.w;
          for (const [nx, ny] of [
            [cx + 1, cy],
            [cx - 1, cy],
            [cx, cy + 1],
            [cx, cy - 1],
          ] as const) {
            if (nx < 0 || ny < 0 || nx >= map.w || ny >= map.h) continue;
            const nIdx = cellIdx(map, nx, ny);
            if (map.cells[nIdx] === 1 || seen.has(nIdx)) continue;
            seen.add(nIdx);
            queue.push(nIdx);
          }
        }
      }
    }
    expect(components).toBe(1);
  });

  it("flood fill visits exactly the open cells", () => {
    const map = parseLevel(MAZE_ROWS);
    const open = [...map.cells].filter((t) => t !== 1).length;
    const visited = floodReachable(map, map.spawn).filter(Boolean).length;
    expect(visited).toBe(open);
  });

  it("treats out-of-bounds tiles as wall", () => {
    const map = parseLevel(MAZE_ROWS);
    expect(tileAt(map, -1, 5)).toBe(1);
    expect(tileAt(map, 99, 99)).toBe(1);
    expect(tileAt(map, 1, 2)).toBe(0);
  });

  it("parses deterministically", () => {
    const a = parseLevel(MAZE_ROWS);
    const b = parseLevel(MAZE_ROWS);
    expect([...a.cells]).toEqual([...b.cells]);
  });
});
