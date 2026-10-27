import type { MapData, TileType, Vec } from "./types";
import { intIn } from "./rng";
import type { Rng } from "./rng";

/**
 * The authored maze. Hand-drawn characters, 28x20 cells:
 *   '#' wall, '.' floor, 'P' player spawn, 'e' enemy spawn, 'X' exit beacon.
 * Rows 3-4 form a long north gallery; row 17-18 is the grand south boulevard
 * (player and exit share it — the goal is visible from spawn).
 */
export const MAZE_ROWS: readonly string[] = [
  "############################", //  0
  "############################", //  1
  "#........#########.........#", //  2
  "#..........................#", //  3
  "#...e...................e..#", //  4
  "#..........#######.........#", //  5
  "#..........#######.........#", //  6
  "#..........##############..#", //  7
  "#..........##############..#", //  8
  "##....###........########..#", //  9
  "##.e.............########.e#", // 10
  "##............e..########..#", // 11
  "##....###........########..#", // 12
  "##..#####........########..#", // 13
  "##..########..#######......#", // 14
  "#.....######..#######.e....#", // 15
  "#.....######..#######......#", // 16
  "#.P...........e..........X.#", // 17
  "#..........................#", // 18
  "############################", // 19
];

export function parseLevel(rows: readonly string[]): MapData {
  const h = rows.length;
  const w = rows[0].length;
  const cells = new Uint8Array(w * h);
  const enemySpawns: Vec[] = [];
  let spawn: Vec = { x: 1, y: 1 };
  let exit: Vec = { x: w - 2, y: h - 2 };

  for (let y = 0; y < h; y++) {
    const row = rows[y];
    if (row.length !== w) {
      throw new Error(`Row ${y} length ${row.length} != ${w}`);
    }
    for (let x = 0; x < w; x++) {
      const c = row[x];
      let tile: TileType = 0;
      if (c === "#") tile = 1;
      else if (c === ".") tile = 0;
      else if (c === "P") {
        tile = 0;
        spawn = { x, y };
      } else if (c === "e") {
        tile = 0;
        enemySpawns.push({ x, y });
      } else if (c === "X") {
        tile = 2;
        exit = { x, y };
      } else {
        throw new Error(`Unknown map char '${c}' at ${x},${y}`);
      }
      cells[y * w + x] = tile;
    }
  }
  return { w, h, cells, spawn, exit, enemySpawns };
}

/** Tile type with out-of-bounds treated as wall (renders + blocks safely). */
export function tileAt(map: MapData, x: number, y: number): TileType {
  if (x < 0 || y < 0 || x >= map.w || y >= map.h) return 1;
  return map.cells[y * map.w + x] as TileType;
}

export function isSolid(map: MapData, x: number, y: number): boolean {
  return tileAt(map, x, y) === 1;
}

/** Flood fill from `start` over every non-wall cell. Deterministic BFS. */
export function floodReachable(map: MapData, start: Vec): boolean[] {
  const visited = new Array<boolean>(map.w * map.h).fill(false);
  const queue: number[] = [start.y * map.w + start.x];
  visited[start.y * map.w + start.x] = true;
  for (let qi = 0; qi < queue.length; qi++) {
    const idx = queue[qi];
    const x = idx % map.w;
    const y = (idx - x) / map.w;
    const next: Array<[number, number]> = [
      [x + 1, y],
      [x - 1, y],
      [x, y + 1],
      [x, y - 1],
    ];
    for (const [nx, ny] of next) {
      if (nx < 0 || ny < 0 || nx >= map.w || ny >= map.h) continue;
      const nIdx = ny * map.w + nx;
      if (visited[nIdx]) continue;
      if (map.cells[nIdx] === 1) continue;
      visited[nIdx] = true;
      queue.push(nIdx);
    }
  }
  return visited;
}

export function cellIdx(map: MapData, x: number, y: number): number {
  return y * map.w + x;
}

/** True when every walkable cell (and the exit) is reachable from `start`. */
export function levelFullyReachable(map: MapData): boolean {
  const visited = floodReachable(map, map.spawn);
  if (!visited[cellIdx(map, map.exit.x, map.exit.y)]) return false;
  for (const s of map.enemySpawns) {
    if (!visited[cellIdx(map, s.x, s.y)]) return false;
  }
  for (let i = 0; i < map.cells.length; i++) {
    if (map.cells[i] === 1) continue;
    if (!visited[i]) return false;
  }
  return true;
}

/** Only 4-way headings; randomizes idle wander choices deterministically. */
const HEADING_SET = [
  { x: 1, y: 0 },
  { x: -1, y: 0 },
  { x: 0, y: 1 },
  { x: 0, y: -1 },
] as const;

export function randomHeading(rng: Rng): Vec {
  const h = HEADING_SET[intIn(rng, 0, HEADING_SET.length - 1)];
  return { x: h.x, y: h.y };
}
