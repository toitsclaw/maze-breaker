import type { MapData } from "./types";
import { isSolid } from "./level";

/** Circle-vs-grid collision. Axis-separated movement gives natural wall sliding. */

export function circleHitsWall(
  map: MapData,
  x: number,
  y: number,
  r: number,
): boolean {
  const minX = Math.floor(x - r);
  const maxX = Math.floor(x + r);
  const minY = Math.floor(y - r);
  const maxY = Math.floor(y + r);
  const r2 = r * r;
  for (let cy = minY; cy <= maxY; cy++) {
    for (let cx = minX; cx <= maxX; cx++) {
      if (!isSolid(map, cx, cy)) continue;
      // Closest point on cell rect [cx, cx+1) x [cy, cy+1)
      const nx = Math.min(Math.max(x, cx), cx + 1);
      const ny = Math.min(Math.max(y, cy), cy + 1);
      const dx = x - nx;
      const dy = y - ny;
      if (dx * dx + dy * dy < r2) return true;
    }
  }
  return false;
}

export interface Moved {
  x: number;
  y: number;
  moved: boolean;
}

/** Upper bound on a single collision sample, as a fraction of the radius. */
const MAX_SUBSTEP_FRACTION = 0.5;

/**
 * Attempt a circular body move. The move is split into short sub-steps so a
 * large displacement (a low frame rate, a future dash, a test, or a fallback
 * steering nudge) cannot tunnel through a thin wall between samples. Each
 * axis is tested independently inside every sub-step, so diagonal moves into
 * a wall slide along it instead of sticking. Never lets the body leave the
 * map bounds.
 */
export function moveCircle(
  map: MapData,
  x: number,
  y: number,
  r: number,
  dx: number,
  dy: number,
): Moved {
  const margin = Math.min(r, 0.45);
  const distance = Math.hypot(dx, dy);
  const stepLength = Math.max(r * MAX_SUBSTEP_FRACTION, 1e-6);
  const steps = Math.max(1, Math.ceil(distance / stepLength));
  const stepX = dx / steps;
  const stepY = dy / steps;

  let nx = x;
  let ny = y;
  for (let i = 0; i < steps; i++) {
    if (stepX !== 0) {
      const tx = nx + stepX;
      if (!circleHitsWall(map, tx, ny, r)) nx = tx;
    }
    if (stepY !== 0) {
      const ty = ny + stepY;
      if (!circleHitsWall(map, nx, ty, r)) ny = ty;
    }
  }

  nx = Math.min(Math.max(nx, margin), map.w - margin);
  ny = Math.min(Math.max(ny, margin), map.h - margin);
  return { x: nx, y: ny, moved: nx !== x || ny !== y };
}
