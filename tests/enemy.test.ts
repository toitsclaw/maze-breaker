import { describe, expect, it } from "vitest";
import type { Enemy as EnemyT, EnemyState, MapData, Player } from "../src/game/types";
import { updateEnemy, type EnemyUpdateContext } from "../src/game/enemy";
import { mulberry32 } from "../src/game/rng";
import {
  ENEMY_ATTACK_RANGE,
  ENEMY_CHASE_SPEED,
  ENEMY_SIGHT_DIST,
  ENEMY_WANDER_SPEED,
  WANDER_INTERVAL,
} from "../src/game/constants";

/** Perfect L-shaped corridor map: long east runner, wall stub to force reroutes. */
function corridorMap(): MapData {
  // Layout: both rows open (y=2, y=3); a pillar wall at (5, 3) blocks row 3.
  const rows = [
    "#######",
    "#.....#",
    "#.....#",
    "##...##",
    "#######",
  ];
  const w = 7;
  const h = 5;
  const cells = new Uint8Array(w * h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) cells[y * w + x] = rows[y][x] === "#" ? 1 : 0;
  return { w, h, cells, spawn: { x: 1, y: 2 }, exit: { x: 5, y: 2 }, enemySpawns: [] };
}

const map = corridorMap();

/** Mutate the shared test map in place, then restore for later tests. */
const ORIGINAL_CELLS = new Uint8Array(map.cells);
function cellsPatch(w: number, h: number, rows: string[]): void {
  if (w !== map.w || h !== map.h) throw new Error("patch must match dims");
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) map.cells[y * w + x] = rows[y][x] === "#" ? 1 : 0;
}
function restoreStandardMap(): void {
  map.cells.set(ORIGINAL_CELLS);
}

function player(x: number, y: number): Player {
  return { x, y, dir: 0, hp: 6, hurt: 0, bob: 0 };
}

function enemy(
  id: number,
  x: number,
  y: number,
  state: EnemyState = "idle",
): EnemyT {
  return {
    id,
    x,
    y,
    radius: 0.26,
    hp: 2,
    state,
    stateTime: 0,
    flash: 0,
    cooldown: 0,
    wanderDir: null,
    wanderTimer: WANDER_INTERVAL,
  };
}

function ctx(overrides: Partial<EnemyUpdateContext>): EnemyUpdateContext {
  return {
    map,
    player: player(5.5, 3.5),
    playerAlive: true,
    dt: 1 / 60,
    rng: mulberry32(1),
    onPlayerHit: () => {},
    ...overrides,
  };
}

describe("enemy state transitions", () => {
  it("stays idle when the player is out of sight range", () => {
    const e = enemy(0, 1.5, 2.5);
    const c = ctx({ player: player(20.5, 3.5) });
    for (let i = 0; i < 120; i++) updateEnemy(e, c);
    expect(e.state).toBe("idle");
  });

  it("goes idle→chase when the player is visible within sight distance", () => {
    const e = enemy(0, 1.5, 2.5);
    const c = ctx({ player: player(4.5, 2.5) }); // dist 3 < 8.5, straight line open
    updateEnemy(e, c);
    expect(e.state).toBe("chase");
  });

  it("does not aggro a player behind a wall", () => {
    // Enemy in lower corridor beyond pillar: wall blocks sight on row 3.
    const e = enemy(0, 5.5, 2.5);
    const c = ctx({ player: player(1.5, 3.5) }); // around the corner, dist ~4.3
    for (let i = 0; i < 60; i++) updateEnemy(e, c);
    // (5,3) is wall; the pillar separates them, so no LOS → still idle
    expect(e.state).toBe("idle");
  });

  it("chases toward the player until attack range, then attacks", () => {
    const e = enemy(0, 1.5, 2.5);
    const c = ctx({ player: player(5.5, 2.5) });
    let guard = 0;
    while (e.state !== "attack" && guard++ < 600) updateEnemy(e, c);
    expect(e.state).toBe("attack");
    expect(e.stateTime).toBeLessThan(0.1);
    expect(Math.hypot(c.player.x - e.x, c.player.y - e.y)).toBeLessThanOrEqual(ENEMY_ATTACK_RANGE + 0.2);
  });

  it("deals damage when the windup lands with the player in range", () => {
    const e = enemy(0, 5.0, 2.5, "attack");
    const c = ctx({ player: player(5.2, 2.5) });
    let hit = 0;
    c.onPlayerHit = () => hit++;
    for (let i = 0; i < 60; i++) updateEnemy(e, c);
    expect(hit).toBe(1);
    expect(e.state).toBe("chase"); // back to chase after the swing
    expect(e.cooldown).toBeGreaterThan(0);
  });

  it("does not deal damage if the player escapes during the windup", () => {
    const e = enemy(0, 5.0, 2.5, "attack");
    const c = ctx({ player: player(1.0, 2.5) }); // ran away
    let hit = 0;
    c.onPlayerHit = () => hit++;
    for (let i = 0; i < 60; i++) updateEnemy(e, c);
    expect(hit).toBe(0);
  });

  it("cannot attack again before the cooldown elapses", () => {
    const e = enemy(0, 5.0, 2.5);
    const c = ctx({ player: player(5.4, 2.5) });
    let hits = 0;
    c.onPlayerHit = () => hits++;
    for (let i = 0; i < 60; i++) updateEnemy(e, c); // one attack cycle
    const hitsAfterFirst = hits;
    expect(hitsAfterFirst).toBeGreaterThan(0);
    for (let i = 0; i < 10; i++) updateEnemy(e, c); // should still be cooling down
    expect(hits).toBe(hitsAfterFirst);
  });
});

describe("enemy movement safety", () => {
  it("chase never places the enemy inside a wall", () => {
    const e = enemy(0, 1.5, 2.5);
    const c = ctx({ player: player(5.5, 2.5) });
    for (let i = 0; i < 600; i++) {
      updateEnemy(e, c);
      const tx = Math.floor(e.x);
      const ty = Math.floor(e.y);
      expect(map.cells[ty * map.w + tx]).toBe(0);
    }
  });

  it("never moves faster than the chase speed, even while wall-sliding", () => {
    const e = enemy(0, 1.5, 2.5);
    const c = ctx({ player: player(5.5, 3.5) }); // diagonal into the lower wall
    const maxStep = ENEMY_CHASE_SPEED * c.dt + 1e-9;
    for (let i = 0; i < 400; i++) {
      const before = { x: e.x, y: e.y };
      updateEnemy(e, c);
      expect(Math.hypot(e.x - before.x, e.y - before.y)).toBeLessThanOrEqual(maxStep);
    }
  });

  it("wander movement respects walls and speed", () => {
    const e = enemy(0, 1.5, 2.5);
    e.wanderDir = { x: 0, y: 1 }; // south into the wall row
    const startX = e.x;
    const startY = e.y;
    const c = ctx({ player: player(11.5, 2.5) }); // far away: stays idle
    for (let i = 0; i < 120; i++) updateEnemy(e, c);
    expect(e.state).toBe("idle");
    // cannot have moved more than speed*dt*steps, and never into a wall
    expect(Math.hypot(e.x - startX, e.y - startY)).toBeLessThanOrEqual(
      ENEMY_WANDER_SPEED * (1 / 60) * 130 + 1e-6,
    );
    const tx = Math.floor(e.x);
    const ty = Math.floor(e.y);
    expect(map.cells[ty * map.w + tx]).toBe(0);
  });

  it("dead enemies are frozen in place", () => {
    const e = enemy(0, 3.5, 2.5, "dead");
    const c = ctx({ player: player(1.0, 2.5) });
    for (let i = 0; i < 120; i++) updateEnemy(e, c);
    expect(e.x).toBeCloseTo(3.5, 6);
    expect(e.y).toBeCloseTo(2.5, 6);
    expect(e.state).toBe("dead");
  });

  it("the attack windup needs line of sight: no damage through a wall", () => {
    // Dedicated 7x5 map with a pillar at (2,2) splitting the middle row.
    const rows = ["#######", "#.....#", "#.#...#", "#.....#", "#######"];
    const w = 7;
    const h = 5;
    cellsPatch(w, h, rows); // installs the geometry into the module-level map
    const e = enemy(0, 1.8, 2.5, "attack");
    const c = ctx({ player: player(2.2, 2.5) }); // right behind the pillar
    let hit = 0;
    c.onPlayerHit = () => hit++;
    e.stateTime = 1; // windup already complete on the next tick
    updateEnemy(e, c);
    expect(hit).toBe(0);
    expect(e.state).toBe("chase");
    // Same distance, open lane: damage lands.
    const e2 = enemy(1, 1.1, 2.5, "attack");
    e2.stateTime = 1;
    let hit2 = 0;
    const c2 = ctx({ player: player(1.3, 2.5) });
    c2.onPlayerHit = () => hit2++;
    updateEnemy(e2, c2);
    expect(hit2).toBe(1);
  });

  it("sight range caps aggro even in the open", () => {
    restoreStandardMap();
    const e = enemy(0, 1.5, 3.5);
    const far = ENEMY_SIGHT_DIST + 1;
    const c = ctx({ player: player(1.5 + far, 3.5) });
    updateEnemy(e, c);
    expect(e.state).toBe("idle");
  });
});
