import { hasLineOfSight } from "./raycast";
import { moveCircle } from "./collision";
import type { Enemy, EnemyState, GameState, MapData, Player } from "./types";
import {
  PLAYER_MAX_HP,
  ENEMY_ATTACK_COOLDOWN,
  ENEMY_ATTACK_DAMAGE,
  ENEMY_ATTACK_RANGE,
  ENEMY_ATTACK_WINDUP,
  ENEMY_CHASE_SPEED,
  ENEMY_MIN_GAP,
  ENEMY_NOISE_DIST,
  ENEMY_SIGHT_DIST,
  ENEMY_WANDER_SPEED,
  WANDER_INTERVAL,
} from "./constants";
import { randomHeading } from "./level";
import type { Rng } from "./rng";

export interface EnemyUpdateContext {
  readonly map: MapData;
  readonly player: Player;
  readonly playerAlive: boolean;
  readonly dt: number;
  readonly rng: Rng;
  /** Set player hp / report events; keeps the FSM pure against game internals. */
  onPlayerHit: (damage: number) => void;
}

function distTo(e: { x: number; y: number }, player: Player): number {
  return Math.hypot(player.x - e.x, player.y - e.y);
}

/** Move toward a point with axis fallback so phases of a wall never trap us. */
function stepToward(
  e: Enemy,
  map: MapData,
  targetX: number,
  targetY: number,
  speed: number,
  dt: number,
): void {
  const dx = targetX - e.x;
  const dy = targetY - e.y;
  const len = Math.hypot(dx, dy);
  if (len < 1e-6) return;
  const step = speed * dt;
  const nx = (dx / len) * step;
  const ny = (dy / len) * step;
  // Primary diagonal move (slides along walls inside moveCircle).
  const moved = moveCircle(map, e.x, e.y, e.radius, nx, ny);
  e.x = moved.x;
  e.y = moved.y;
}

/** Chase with a small half-step fallback when both full-axis samples hit a wall. */
function chaseStep(e: Enemy, ctx: EnemyUpdateContext): void {
  const d = distTo(e, ctx.player);
  if (d < ENEMY_MIN_GAP) return; // close enough; attack instead of shoving
  const start = { x: e.x, y: e.y };
  stepToward(e, ctx.map, ctx.player.x, ctx.player.y, ENEMY_CHASE_SPEED, ctx.dt);
  if (Math.abs(e.x - start.x) < 1e-9 && Math.abs(e.y - start.y) < 1e-9) {
    // Straight-line blocked at a corner: creep along the dominant axis (still
    // capped to the same speed so a blocked enemy can never outrun its stats).
    const dx = ctx.player.x - e.x;
    const dy = ctx.player.y - e.y;
    const sx = Math.sign(dx);
    const sy = Math.sign(dy);
    const creep = ENEMY_CHASE_SPEED * ctx.dt * 0.5;
    if (Math.abs(dx) > Math.abs(dy)) {
      const ax = moveCircle(ctx.map, e.x, e.y, e.radius, sx * creep, 0);
      e.x = ax.x;
      const ay = moveCircle(ctx.map, e.x, e.y, e.radius, 0, sy * creep);
      e.y = ay.y;
    } else {
      const ay = moveCircle(ctx.map, e.x, e.y, e.radius, 0, sy * creep);
      e.y = ay.y;
      const ax = moveCircle(ctx.map, e.x, e.y, e.radius, sx * creep, 0);
      e.x = ax.x;
    }
  }
}

/**
 * One fixed-step update for a single enemy. Mutates `e`; wall-safe movement;
 * deterministic for identical context inputs (rng stream is supplied).
 */
export function updateEnemy(e: Enemy, ctx: EnemyUpdateContext): void {
  e.flash = Math.max(0, e.flash - ctx.dt); // corpses keep fading to their husk color
  if (e.state === "dead" || e.hp <= 0) {
    if (e.state !== "dead") {
      e.state = "dead";
      e.stateTime = 0;
      e.wanderDir = null;
    }
    return;
  }
  e.stateTime += ctx.dt;

  const d = distTo(e, ctx.player);
  const sighted = ctx.playerAlive && d <= ENEMY_SIGHT_DIST && hasLineOfSight(ctx.map, e.x, e.y, ctx.player.x, ctx.player.y);

  switch (e.state as EnemyState) {
    case "idle": {
      if (sighted) {
        e.state = "chase";
        e.stateTime = 0;
        break;
      }
      e.wanderTimer -= ctx.dt;
      if (e.wanderTimer <= 0) {
        e.wanderTimer = WANDER_INTERVAL;
        e.wanderDir = ctx.rng() < 0.45 ? null : randomHeading(ctx.rng);
      }
      if (e.wanderDir) {
        const m = moveCircle(
          ctx.map,
          e.x,
          e.y,
          e.radius,
          e.wanderDir.x * ENEMY_WANDER_SPEED * ctx.dt,
          e.wanderDir.y * ENEMY_WANDER_SPEED * ctx.dt,
        );
        e.x = m.x;
        e.y = m.y;
        if (!m.moved) e.wanderDir = null; // bumped a wall; pick again next cycle
      }
      break;
    }
    case "chase": {
      e.cooldown = Math.max(0, e.cooldown - ctx.dt);
      if (!ctx.playerAlive) {
        e.state = "idle";
        e.stateTime = 0;
        break;
      }
      if (d <= ENEMY_ATTACK_RANGE && e.cooldown <= 0 && hasLineOfSight(ctx.map, e.x, e.y, ctx.player.x, ctx.player.y)) {
        e.state = "attack";
        e.stateTime = 0;
        break;
      }
      chaseStep(e, ctx);
      break;
    }
    case "attack": {
      // Windup complete: damage if still in range and sight; then re-chase.
      if (e.stateTime >= ENEMY_ATTACK_WINDUP) {
        if (ctx.playerAlive && d <= ENEMY_ATTACK_RANGE + 0.15 && hasLineOfSight(ctx.map, e.x, e.y, ctx.player.x, ctx.player.y)) {
          ctx.onPlayerHit(ENEMY_ATTACK_DAMAGE);
        }
        e.state = "chase";
        e.cooldown = ENEMY_ATTACK_COOLDOWN;
        e.stateTime = 0;
      }
      break;
    }
    case "dead":
      break;
  }
}

/** Pairwise repulsion so enemies never stack; pushes stay wall-safe. */
export function separateEnemies(enemies: Enemy[], map: MapData): void {
  for (let i = 0; i < enemies.length; i++) {
    const a = enemies[i];
    if (a.state === "dead") continue;
    for (let j = i + 1; j < enemies.length; j++) {
      const b = enemies[j];
      if (b.state === "dead") continue;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const d = Math.hypot(dx, dy);
      const minD = a.radius + b.radius + 0.04;
      if (d >= minD || d < 1e-6) continue;
      const push = (minD - d) * 0.5;
      const ux = (dx / d) * push;
      const uy = (dy / d) * push;
      const ma = moveCircle(map, a.x, a.y, a.radius, -ux, -uy);
      a.x = ma.x;
      a.y = ma.y;
      const mb = moveCircle(map, b.x, b.y, b.radius, ux, uy);
      b.x = mb.x;
      b.y = mb.y;
    }
  }
}

/** Noise aggro helper: gunfire wakes nearby enemies even through walls. */
export function wakeByNoise(enemies: Enemy[], player: Player, noise: boolean): void {
  if (!noise) return;
  for (const e of enemies) {
    if (e.state !== "idle") continue;
    if (Math.hypot(player.x - e.x, player.y - e.y) <= ENEMY_NOISE_DIST) {
      e.state = "chase";
      e.stateTime = 0;
    }
  }
}

export function damagePlayer(state: GameState, damage: number): void {
  state.player.hp = Math.max(0, state.player.hp - damage);
  state.player.hurt = Math.max(state.player.hurt, 1);
  state.events.push(`HIT! HP ${state.player.hp}/${PLAYER_MAX_HP}`);
}
