import type { MapData } from "./types";
import { tileAt } from "./level";

/**
 * DDA ray casting (Lodev style). Rays may be unnormalized (rendering columns)
 * or unit-length (LOS / hitscan `t` == euclidean distance).
 */

export interface RayHit {
  dist: number; // perpendicular distance along the camera axis
  side: 0 | 1; // 0 = stepped in x (E/W wall face), 1 = stepped in y
  cellX: number;
  cellY: number;
  cell: number; // tile type hit (always solid)
}

const MAX_STEPS = 256;

export function castRay(
  map: MapData,
  ox: number,
  oy: number,
  rayDirX: number,
  rayDirY: number,
  maxDist: number,
): RayHit | null {
  let mapX = Math.floor(ox);
  let mapY = Math.floor(oy);

  const deltaX = rayDirX === 0 ? Infinity : Math.abs(1 / rayDirX);
  const deltaY = rayDirY === 0 ? Infinity : Math.abs(1 / rayDirY);

  let stepX: number;
  let sideDistX: number;
  if (rayDirX < 0) {
    stepX = -1;
    sideDistX = (ox - mapX) * deltaX;
  } else {
    stepX = 1;
    sideDistX = (mapX + 1 - ox) * deltaX;
  }
  let stepY: number;
  let sideDistY: number;
  if (rayDirY < 0) {
    stepY = -1;
    sideDistY = (oy - mapY) * deltaY;
  } else {
    stepY = 1;
    sideDistY = (mapY + 1 - oy) * deltaY;
  }

  for (let i = 0; i < MAX_STEPS; i++) {
    let side: 0 | 1;
    if (sideDistX < sideDistY) {
      sideDistX += deltaX;
      mapX += stepX;
      side = 0;
    } else {
      sideDistY += deltaY;
      mapY += stepY;
      side = 1;
    }
    const perp = side === 0 ? sideDistX - deltaX : sideDistY - deltaY;
    if (perp > maxDist) return null;
    if (tileAt(map, mapX, mapY) === 1) {
      return { dist: perp, side, cellX: mapX, cellY: mapY, cell: 1 };
    }
  }
  return null;
}

/** True when nothing solid blocks the segment a→b. */
export function hasLineOfSight(
  map: MapData,
  ax: number,
  ay: number,
  bx: number,
  by: number,
): boolean {
  const dx = bx - ax;
  const dy = by - ay;
  const len = Math.hypot(dx, dy);
  if (len < 1e-9) return true;
  const hit = castRay(map, ax, ay, dx / len, dy / len, len);
  return hit === null;
}
