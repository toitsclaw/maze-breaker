import type { MapData } from "./types";
import { castRay } from "./raycast";

/** Hitscan weapons: ray-circle intersection with wall obstruction. */

export interface Combatant {
  id: number;
  x: number;
  y: number;
  radius: number;
  hp: number;
}

export interface Hitscan {
  targetIndex: number; // -1 = no valid target
  targetDist: number; // distance along the ray to the target's near edge
  wallDist: number; // distance to first wall (== range when unobstructed)
}

/**
 * Cast a unit ray; return the closest living combatant the ray pierces, if the
 * ray reaches their near edge before hitting a wall. Deterministic: nearest
 * entry point along the ray wins, not merely the nearest centre.
 */
export function hitscan(
  map: MapData,
  targets: readonly Combatant[],
  ox: number,
  oy: number,
  dirX: number,
  dirY: number,
  range: number,
): Hitscan {
  const wall = castRay(map, ox, oy, dirX, dirY, range);
  const wallDist = wall ? wall.dist : range;
  const wallLimit = Math.min(wallDist, range);
  let targetIndex = -1;
  let targetDist = Infinity;
  for (let i = 0; i < targets.length; i++) {
    const t = targets[i];
    if (t.hp <= 0) continue;
    const relX = t.x - ox;
    const relY = t.y - oy;
    const along = relX * dirX + relY * dirY; // distance from ray origin to centre
    if (along <= 0) continue;
    const perp2 = relX * relX + relY * relY - along * along; // perpendicular²
    const rr = t.radius * t.radius;
    if (perp2 > rr + 1e-12) continue;
    const halfChord = Math.sqrt(Math.max(0, rr - perp2));
    const entry = Math.max(0, along - halfChord);
    if (entry > wallLimit || entry >= targetDist) continue;
    targetIndex = i;
    targetDist = entry;
  }
  return { targetIndex, targetDist, wallDist };
}

/** Apply damage; returns true when the target dies from this hit. */
export function applyDamage(target: Combatant, damage: number): boolean {
  if (target.hp <= 0) return false;
  target.hp -= damage;
  return target.hp <= 0;
}
